const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class TikTokClient {
  constructor({
    clientKey,
    clientSecret,
    redirectUri,
    scopes,
    apiBase,
    tokensFile
  }) {
    this.clientKey = clientKey;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scopes = scopes;
    this.apiBase = apiBase || 'https://open.tiktokapis.com';
    this.tokensFile = tokensFile || path.resolve(process.cwd(), 'tokens.json');
    this.tokens = null;
  }

  getAuthUrl(state) {
    const url = new URL(`${this.apiBase}/v2/auth/authorize/`);
    url.searchParams.set('client_key', this.clientKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCodeForToken(code) {
    const res = await fetch(`${this.apiBase}/v2/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
    }

    const tokenData = {
      ...data,
      expires_at: Date.now() + (data.expires_in || 0) * 1000
    };

    this.saveTokens(tokenData);
    return tokenData;
  }

  async refreshToken(refreshToken) {
    const res = await fetch(`${this.apiBase}/v2/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    }

    const tokenData = {
      ...this.loadTokens(),
      ...data,
      expires_at: Date.now() + (data.expires_in || 0) * 1000
    };

    this.saveTokens(tokenData);
    return tokenData;
  }

  loadTokens() {
    if (this.tokens) {
      return this.tokens;
    }

    if (!fs.existsSync(this.tokensFile)) {
      return null;
    }

    const raw = fs.readFileSync(this.tokensFile, 'utf8');
    this.tokens = JSON.parse(raw);
    return this.tokens;
  }

  saveTokens(tokens) {
    fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2), 'utf8');
    this.tokens = tokens;
    logger.info('Saved token file', { tokensFile: this.tokensFile });
  }

  async ensureAccessToken() {
    const tokens = this.loadTokens();
    if (!tokens || !tokens.access_token) {
      throw new Error('No tokens found. Run `npm run oauth` first.');
    }

    const almostExpired = !tokens.expires_at || Date.now() > tokens.expires_at - 2 * 60 * 1000;
    if (almostExpired && tokens.refresh_token) {
      logger.info('Access token is expiring soon. Refreshing token.');
      const refreshed = await this.refreshToken(tokens.refresh_token);
      return refreshed.access_token;
    }

    return tokens.access_token;
  }

  async initVideoUpload({ title, privacyLevel, fileSize }) {
    const accessToken = await this.ensureAccessToken();
    const res = await fetch(`${this.apiBase}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({
        post_info: {
          title,
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: fileSize,
          chunk_size: fileSize,
          total_chunk_count: 1
        }
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Upload init failed: ${JSON.stringify(data)}`);
    }

    return data.data;
  }

  async uploadVideoToUrl(uploadUrl, fileBuffer) {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileBuffer.length)
      },
      body: fileBuffer
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Video upload failed: status=${res.status}, body=${text}`);
    }

    return text;
  }

  async fetchPublishStatus(publishId) {
    const accessToken = await this.ensureAccessToken();
    const res = await fetch(`${this.apiBase}/v2/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({ publish_id: publishId })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Status fetch failed: ${JSON.stringify(data)}`);
    }

    return data.data;
  }
}

module.exports = TikTokClient;
