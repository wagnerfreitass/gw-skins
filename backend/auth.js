const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const session = require('express-session');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new SteamStrategy({
  returnURL: process.env.STEAM_RETURN_URL,
  realm: process.env.STEAM_REALM,
  apiKey: process.env.STEAM_API_KEY
}, async (identifier, profile, done) => {
  const steamId = profile.id;
  const nome = profile.displayName;
  const foto_url = profile.photos[2].value;

  try {
    // Verifica se o usuário já existe
    const existingUser = await pool.query('SELECT * FROM users WHERE steam_id = $1', [steamId]);

    if (existingUser.rows.length === 0) {
      // Cria novo usuário
      await pool.query(`
        INSERT INTO users (steam_id, nome, foto_url, carteira)
        VALUES ($1, $2, $3, $4)
      `, [steamId, nome, foto_url, 0.00]);
    }

    // Busca o usuário atualizado
    const { rows } = await pool.query('SELECT * FROM users WHERE steam_id = $1', [steamId]);
    const userDB = rows[0];

    const user = {
      id: rows[0].id,            
      steam_id: userDB.steam_id,
      nome: userDB.nome,
      foto_url: userDB.foto_url
    };

    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

function setupAuth(app) {
  app.use(session({
    secret: 'chave_secreta_steam',
    resave: false,
    saveUninitialized: true
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  // Iniciar login
  app.get('/auth/steam', passport.authenticate('steam'));

  // Retorno da Steam
  app.get('/auth/steam/return',
    passport.authenticate('steam', { failureRedirect: '/' }),
    (req, res) => {
      const payload = {
        id: req.user.id,               // UUID
        steam_id: req.user.steam_id,
        nome: req.user.nome,
        foto_url: req.user.foto_url
      };

      const token = jwt.sign(req.user, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.redirect(`http://localhost:4200/login?token=${token}`);
    }
  );
}

module.exports = setupAuth;
