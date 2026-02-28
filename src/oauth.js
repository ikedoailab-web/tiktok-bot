require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const TikTokClient = require('./tiktokClient');
const logger = require('./logger');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function main() {
  const client = new TikTokClient({
    clientKey: requiredEnv('TIKTOK_CLIENT_KEY'),
    clientSecret: requiredEnv('TIKTOK_CLIENT_SECRET'),
    redirectUri: requiredEnv('TIKTOK_REDIRECT_URI'),
    scopes: process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload',
    apiBase: process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com',
    tokensFile: process.env.TOKENS_FILE || './tokens.json'
  });

  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = client.getAuthUrl(state);
  const callback = new URL(requiredEnv('TIKTOK_REDIRECT_URI'));

  const app = express();
  app.get(callback.pathname, async (req, res) => {
    try {
      if (req.query.state !== state) {
        throw new Error('Invalid OAuth state');
      }

      if (!req.query.code) {
        throw new Error('OAuth code not provided');
      }

      await client.exchangeCodeForToken(req.query.code);
      res.send('OAuth success. You can close this tab.');
      logger.info('OAuth completed and tokens saved.');
      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      logger.error('OAuth failed', { error: err.message });
      res.status(500).send(`OAuth failed: ${err.message}`);
    }
  });

  app.listen(Number(callback.port || 3000), callback.hostname, () => {
    logger.info('OAuth callback server started', {
      redirectUri: requiredEnv('TIKTOK_REDIRECT_URI')
    });
    logger.info('Open this URL in your browser to authorize:', { authUrl });
  });
}

main().catch((err) => {
  logger.error('Fatal OAuth script error', { error: err.message });
  process.exit(1);
});
