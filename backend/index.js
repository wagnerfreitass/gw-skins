const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão com PostgreSQL (Supabase)
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

// Testar conexão
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Erro ao conectar ao PostgreSQL:', err);
  } else {
    console.log('Conectado ao PostgreSQL em:', result.rows[0].now);
  }
});

// Rota teste
app.get('/', (req, res) => {
  res.send('GW Skins API rodando com PostgreSQL 🚀');
});

// Listar todos os usuários (debug)
app.get('/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Buscar carteira de um usuário
app.get('/usuarios/:steam_id', async (req, res) => {
  const { steam_id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT carteira FROM users WHERE steam_id = $1',
      [steam_id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.status(200).json({ carteira: rows[0].carteira });
  } catch (error) {
    console.error('Erro ao buscar carteira do usuário:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Buscar caixas
app.get('/caixas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM caixas');
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar caixas:', error);
    res.status(500).json({ message: 'Erro interno ao buscar caixas' });
  }
});

// Buscar skins de uma caixa
app.get('/caixas/:id/skins', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM skins WHERE caixa_id = $1', [id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Erro ao buscar skins da caixa:', error);
    res.status(500).json({ message: 'Erro interno ao buscar skins' });
  }
});

// Rota para adicionar skin ao inventário
app.post('/inventario', async (req, res) => {
  const { usuario_id, skin_id } = req.body;
  if (!usuario_id || !skin_id) {
    return res.status(400).json({ message: 'usuario_id e skin_id são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO inventario (usuario_id, skin_id, data_adicionada) VALUES ($1, $2, NOW()) RETURNING id',
      [usuario_id, skin_id]
    );
    const inventarioId = result.rows[0].id;
    res.status(201).json({ message: 'Skin adicionada ao inventário com sucesso!', inventario_id: inventarioId });
  } catch (error) {
    console.error('Erro ao adicionar skin ao inventário:', error);
    res.status(500).json({ message: 'Erro interno ao adicionar ao inventário' });
  }
});

// Rota para buscar inventário do usuário com dados da skin
app.get('/inventario/:usuario_id', async (req, res) => {
  const { usuario_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        inv.id as inventario_id,
        s.nome as skin_nome,
        s.imagem_url as skin_imagem_url,
        s.preco as skin_preco
      FROM inventario inv
      JOIN skins s ON inv.skin_id = s.id
      WHERE inv.usuario_id = $1
    `, [usuario_id]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar inventário do usuário:', error);
    res.status(500).json({ message: 'Erro interno ao buscar inventário' });
  }
});

// Vender item individual
app.post('/vender', async (req, res) => {
  const { inventario_id } = req.body;
  if (!inventario_id) return res.status(400).json({ message: 'inventario_id é obrigatório' });

  try {
    const inv = await pool.query('SELECT skin_id, usuario_id FROM inventario WHERE id = $1', [inventario_id]);
    if (inv.rows.length === 0) return res.status(404).json({ message: 'Item não encontrado' });

    const { skin_id, usuario_id } = inv.rows[0];

    const precoQuery = await pool.query('SELECT preco FROM skins WHERE id = $1', [skin_id]);
    if (precoQuery.rows.length === 0) return res.status(404).json({ message: 'Skin não encontrada' });

    const preco = parseFloat(precoQuery.rows[0].preco);

    await pool.query('DELETE FROM inventario WHERE id = $1', [inventario_id]);
    await pool.query('UPDATE users SET carteira = carteira + $1 WHERE id = $2', [preco, usuario_id]);

    res.status(200).json({ message: 'Item vendido com sucesso', valor: preco });
  } catch (error) {
    console.error('Erro ao vender item:', error);
    res.status(500).json({ message: 'Erro ao vender item' });
  }
});

// Vender tudo
app.post('/vender-tudo', async (req, res) => {
  const { usuario_id } = req.body;
  if (!usuario_id) return res.status(400).json({ message: 'usuario_id é obrigatório' });

  try {
    const result = await pool.query(`
      SELECT i.id, s.preco
      FROM inventario i
      JOIN skins s ON i.skin_id = s.id
      WHERE i.usuario_id = $1
    `, [usuario_id]);

    const itens = result.rows;
    const total = itens.reduce((acc, item) => acc + parseFloat(item.preco), 0);

    const ids = itens.map(item => item.id);
    if (ids.length > 0) {
      await pool.query('DELETE FROM inventario WHERE id = ANY($1)', [ids]);
      await pool.query('UPDATE users SET carteira = carteira + $1 WHERE id = $2', [total, usuario_id]);
    }

    res.status(200).json({ message: 'Todos os itens vendidos', valor: total });
  } catch (error) {
    console.error('Erro ao vender tudo:', error);
    res.status(500).json({ message: 'Erro ao vender tudo' });
  }
});

// Atualizar TradeURL
app.post('/usuarios/tradeurl', async (req, res) => {
  const { usuario_id, trade_url } = req.body;
  if (!usuario_id || !trade_url) {
    return res.status(400).json({ message: 'Dados obrigatórios ausentes' });
  }

  try {
    await pool.query('UPDATE users SET trade_url = $1 WHERE id = $2', [trade_url, usuario_id]);
    res.status(200).json({ message: 'Trade URL atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar Trade URL:', error);
    res.status(500).json({ message: 'Erro ao salvar Trade URL' });
  }
});

// Steam Auth
const setupAuth = require('./auth');
setupAuth(app);

// Importar manager do bot
const { manager } = require('./bot');

// Enviar skin via trade offer
app.post('/enviar-skin', async (req, res) => {
  const { steam_id_destino, mensagem, items } = req.body;

  if (!steam_id_destino || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Parâmetros inválidos. Informe steam_id_destino e items (array).' });
  }

  try {
    const offer = manager.createOffer(steam_id_destino);
    offer.addMyItems(items); // items = [{ appid, contextid, assetid }]
    offer.setMessage(mensagem || 'Aqui está sua skin da GW Skins 🎁');

    offer.send((err, status) => {
      if (err) {
        console.error('Erro ao enviar oferta:', err);
        return res.status(500).json({ message: 'Erro ao enviar trade offer' });
      }

      console.log('Oferta enviada! Status:', status);
      return res.status(200).json({ message: 'Oferta enviada com sucesso', status });
    });
  } catch (err) {
    console.error('Erro inesperado ao enviar skin:', err);
    return res.status(500).json({ message: 'Erro interno ao enviar skin' });
  }
});

// Iniciar servidor
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend rodando em http://localhost:${PORT}`);
});
