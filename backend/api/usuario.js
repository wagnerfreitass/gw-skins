import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { steam_id } = req.query;

  if (!steam_id) {
    return res.status(400).json({ message: 'steam_id é obrigatório' });
  }

  const { data, error } = await supabase
    .from('users')
    .select('carteira')
    .eq('steam_id', steam_id)
    .single();

  if (error) {
    return res.status(500).json({ message: 'Erro ao buscar usuário', error });
  }

  return res.status(200).json({ carteira: data.carteira });
}
