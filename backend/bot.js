const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamCommunity = require('steamcommunity');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
  steam: client,
  community: community,
  language: 'pt',
});

// Login do bot Steam
const logOnOptions = {
  accountName: process.env.BOT_USERNAME,
  password: process.env.BOT_PASSWORD,
  twoFactorCode: SteamTotp.generateAuthCode(process.env.BOT_SHARED_SECRET),
};

client.logOn(logOnOptions);

client.on('loggedOn', () => {
  console.log('✅ Bot Steam logado com sucesso');
  client.setPersona(SteamUser.EPersonaState.Online);
});

client.on('webSession', (sessionID, cookies) => {
  manager.setCookies(cookies);
  community.setCookies(cookies);
  community.startConfirmationChecker(30000, process.env.BOT_IDENTITY_SECRET);
  console.log('🔐 Sessão web iniciada e confirmação automática ativada');
});

// ROTA: Listar inventário do BOT
app.get('/bot/inventario', async (req, res) => {
  manager.getInventoryContents(730, 2, true, (err, inventory) => {
    if (err) {
      console.error('❌ Erro ao obter inventário do bot:', err);
      return res.status(500).json({ message: 'Erro ao listar inventário do bot' });
    }

    const tradableItems = inventory
      .filter(item => item.tradable)
      .map(item => ({
        nome: item.market_hash_name,
        assetid: item.assetid,
        icon_url: `https://steamcommunity-a.akamaihd.net/economy/image/${item.icon_url}`,
        tradable: item.tradable,
      }));

    res.status(200).json(tradableItems);
  });
});

// Sessão expirada = relogar
community.on('sessionExpired', () => {
  console.log('⚠️ Sessão expirada. Reconectando...');
  client.logOn(logOnOptions);
});

// Aceita ofertas doações automaticamente (sem receber nada)
manager.on('newOffer', offer => {
  console.log(`📦 Nova troca recebida de ${offer.partner.getSteamID64()}`);
  if (offer.itemsToGive.length > 0 && offer.itemsToReceive.length === 0) {
    offer.accept(err => {
      if (err) console.log('❌ Erro ao aceitar troca:', err);
      else console.log('✅ Troca aceita automaticamente!');
    });
  }
});

// Iniciar servidor Express do bot
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🔁 Bot API rodando em http://localhost:${PORT}`);
});

// Exportar para usar em outros arquivos se quiser
module.exports = { client, manager, community };
