const { randomBytes, createHash } = require('node:crypto');
const { InvalidGrantError, InvalidTokenError, InvalidRequestError, InvalidScopeError } = require('@modelcontextprotocol/sdk/server/auth/errors.js');

const opaque = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const challenge = value => createHash('sha256').update(value).digest('base64url');
const COOKIE = '__Host-parma-mcp-flow';
const COOKIE_OPTIONS = { secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600000 };
const credential = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

class ParmaOAuthProvider {
  constructor({ config, store, google, now = () => Date.now() }) {
    this.config = config;
    this.store = store;
    this.google = google;
    this.now = now;
    this.pending = new Map();
    this.codes = new Map();
    this.clientsStore = { getClient: async id => id === config.clientId ? {
      client_id: config.clientId, client_secret: config.clientSecret,
      client_name: 'Parma private ChatGPT connector', redirect_uris: [config.redirectUri],
      token_endpoint_auth_method: 'client_secret_post', grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], scope: 'parma.read',
    } : undefined };
  }
  checkClient(client) {
    if (client?.client_id !== this.config.clientId) throw new InvalidGrantError('Invalid grant');
  }
  checkResource(resource) {
    if (resource?.href !== this.config.resource) throw new InvalidRequestError('Invalid resource');
  }
  checkScopes(scopes) {
    if (!Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== 'parma.read') throw new InvalidScopeError('Only parma.read is supported');
  }
  cleanup() {
    for (const map of [this.pending, this.codes]) {
      for (const [key, row] of map) if (row.expires <= this.now()) map.delete(key);
    }
    if (this.pending.size + this.codes.size >= 250) throw new InvalidRequestError('Too many pending requests');
  }
  async authorize(client, params, res) {
    this.checkClient(client);
    this.checkResource(params.resource);
    this.checkScopes(params.scopes);
    if (params.redirectUri !== this.config.redirectUri || !credential(params.codeChallenge) ||
        typeof params.state !== 'string' || !params.state || params.state.length > 1024) {
      throw new InvalidRequestError('Invalid authorization request');
    }
    this.cleanup();
    const state = opaque(), cookie = opaque(), nonce = opaque(), verifier = opaque();
    this.pending.set(hash(state), {
      state: params.state, redirectUri: params.redirectUri, clientId: client.client_id,
      codeChallenge: params.codeChallenge, resource: params.resource.href,
      cookieHash: hash(cookie), nonce, verifier, stage: 'google', expires: this.now() + 600000,
    });
    res.cookie(COOKIE, cookie, COOKIE_OPTIONS);
    res.redirect(this.google.generateAuthUrl({
      scope: ['openid', 'email'], state, nonce, code_challenge: challenge(verifier),
      code_challenge_method: 'S256', prompt: 'select_account', access_type: 'online',
    }));
  }
  flow(state, cookie, stage) {
    if (!credential(state) || !credential(cookie)) throw new InvalidGrantError('Invalid authorization session');
    const row = this.pending.get(hash(state));
    if (!row || row.expires <= this.now() || row.cookieHash !== hash(cookie) || row.stage !== stage) {
      throw new InvalidGrantError('Invalid authorization session');
    }
    return row;
  }
  async finishGoogle({ state, cookie, code }) {
    const row = this.flow(state, cookie, 'google');
    if (typeof code !== 'string' || !code || code.length > 4096) throw new InvalidGrantError('Invalid Google response');
    row.stage = 'verifying'; // Consume callback before the async token exchange, preventing races/replay.
    try {
      const { tokens } = await this.google.getToken({ code, codeVerifier: row.verifier, redirect_uri: this.config.googleCallback });
      const ticket = await this.google.verifyIdToken({ idToken: tokens.id_token, audience: this.config.googleClientId });
      const identity = ticket.getPayload();
      if (!identity || identity.email_verified !== true || identity.email !== this.config.ownerEmail ||
          identity.nonce !== row.nonce || typeof identity.sub !== 'string' || !identity.sub ||
          !['accounts.google.com', 'https://accounts.google.com'].includes(identity.iss) ||
          identity.aud !== this.config.googleClientId || !Number.isFinite(identity.exp) || identity.exp * 1000 <= this.now()) {
        throw new InvalidGrantError('Owner identity verification failed');
      }
      row.subject = identity.sub;
      row.csrf = opaque();
      row.stage = 'consent';
      delete row.verifier;
      delete row.nonce;
      return { csrf: row.csrf };
    } catch {
      this.pending.delete(hash(state));
      throw new InvalidGrantError('Owner identity verification failed');
    }
  }
  consent({ state, cookie, csrf, approved }) {
    const row = this.flow(state, cookie, 'consent');
    if (!credential(csrf) || row.csrf !== csrf) throw new InvalidGrantError('Invalid consent');
    this.pending.delete(hash(state));
    const destination = new URL(row.redirectUri);
    destination.searchParams.set('state', row.state);
    destination.searchParams.set('iss', this.config.issuer);
    if (!approved) { destination.searchParams.set('error', 'access_denied'); return destination.href; }
    const code = opaque();
    this.codes.set(hash(code), { ...row, expires: this.now() + 60000 });
    destination.searchParams.set('code', code);
    return destination.href;
  }
  authorizationCode(client, code) {
    this.checkClient(client);
    if (!credential(code)) throw new InvalidGrantError('Invalid grant');
    const row = this.codes.get(hash(code));
    if (!row || row.clientId !== client.client_id || row.expires <= this.now()) throw new InvalidGrantError('Invalid grant');
    return row;
  }
  async challengeForAuthorizationCode(client, code) { return this.authorizationCode(client, code).codeChallenge; }
  async exchangeAuthorizationCode(client, code, verifier, redirectUri, resource) {
    const row = this.authorizationCode(client, code);
    // PKCE is validated by the SDK token handler before this method is invoked.
    this.checkResource(resource);
    if (redirectUri !== row.redirectUri) throw new InvalidGrantError('Invalid grant');
    this.codes.delete(hash(code));
    return this.issue({ subject: row.subject, family: opaque(), familyExpires: this.now() + 30 * 86400000 });
  }
  validRecord(row, type) {
    return row && row.type === type && row.expires > this.now() &&
      row.clientId === this.config.clientId && row.ownerEmail === this.config.ownerEmail &&
      row.resource === this.config.resource && row.issuer === this.config.issuer && row.scope === 'parma.read' &&
      typeof row.subject === 'string' && row.subject.length > 0;
  }
  issue({ subject, family, familyExpires }, state = this.store.snapshot()) {
    for (const [key, row] of Object.entries(state.tokens)) if (row.expires <= this.now()) delete state.tokens[key];
    if (Object.keys(state.tokens).length > 2000) throw new InvalidGrantError('Authorization capacity reached');
    const access = opaque(), refresh = opaque();
    const common = { subject, family, familyExpires, clientId: this.config.clientId, ownerEmail: this.config.ownerEmail,
      resource: this.config.resource, issuer: this.config.issuer, scope: 'parma.read' };
    state.tokens[hash(access)] = { ...common, type: 'access', expires: Math.min(this.now() + 3600000, familyExpires) };
    state.tokens[hash(refresh)] = { ...common, type: 'refresh', expires: familyExpires, used: false };
    this.store.save(state); // Persist before returning tokens; failure never grants access.
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer',
      expires_in: Math.floor((state.tokens[hash(access)].expires - this.now()) / 1000), scope: 'parma.read' };
  }
  async exchangeRefreshToken(client, token, scopes, resource) {
    this.checkClient(client);
    this.checkResource(resource);
    if (scopes !== undefined) this.checkScopes(scopes);
    if (!credential(token)) throw new InvalidGrantError('Invalid grant');
    const state = this.store.snapshot(), row = state.tokens[hash(token)];
    if (!this.validRecord(row, 'refresh')) throw new InvalidGrantError('Invalid grant');
    if (row.used) {
      for (const [key, other] of Object.entries(state.tokens)) if (other.family === row.family) delete state.tokens[key];
      this.store.save(state);
      throw new InvalidGrantError('Refresh token replay; reconnect');
    }
    row.used = true;
    // One current access token per refresh family; old refresh hashes remain replay tombstones.
    for (const [key, other] of Object.entries(state.tokens)) if (other.family === row.family && other.type === 'access') delete state.tokens[key];
    return this.issue(row, state);
  }
  async verifyAccessToken(token) {
    if (!credential(token)) throw new InvalidTokenError('Invalid token');
    const row = this.store.snapshot().tokens[hash(token)];
    if (!this.validRecord(row, 'access')) throw new InvalidTokenError('Invalid token');
    return { token, clientId: row.clientId, scopes: ['parma.read'], expiresAt: row.expires / 1000,
      resource: new URL(row.resource), extra: { subject: row.subject } };
  }
  async revokeToken(client, { token }) {
    this.checkClient(client);
    if (!credential(token)) return;
    const state = this.store.snapshot(), row = state.tokens[hash(token)];
    if (!row || row.clientId !== client.client_id) return;
    for (const [key, other] of Object.entries(state.tokens)) if (other.family === row.family) delete state.tokens[key];
    this.store.save(state);
  }
}

module.exports = { ParmaOAuthProvider, COOKIE, COOKIE_OPTIONS, hash, challenge };
