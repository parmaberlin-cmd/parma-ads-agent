const express = require('express');
const axios = require('axios');
const path = require('node:path');
const { OAuth2Client } = require('google-auth-library');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { mcpAuthRouter, createOAuthMetadata } = require('@modelcontextprotocol/sdk/server/auth/router.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const { z } = require('zod');
const { apiKeysMatch } = require('./api-key-auth');
const { createReadOnlyTools, listTools } = require('./mcp-readonly-tools');
const { ParmaOAuthProvider, COOKIE, COOKIE_OPTIONS } = require('./mcp-oauth-provider');
const { FileTokenStore } = require('./mcp-auth-store');

function configuration(env) {
  if (env.PARMA_MCP_ENABLED !== 'true') return null;
  const required = ['PARMA_MCP_PUBLIC_ORIGIN', 'PARMA_MCP_OWNER_EMAIL', 'PARMA_MCP_CLIENT_ID',
    'PARMA_MCP_CLIENT_SECRET', 'PARMA_MCP_REDIRECT_URI', 'PARMA_MCP_GOOGLE_CLIENT_ID',
    'PARMA_MCP_GOOGLE_CLIENT_SECRET', 'PARMA_MCP_STATE_DIR', 'PARMA_MCP_STORE_KEY', 'PARMA_AGENT_API_KEY'];
  if (required.some(key => typeof env[key] !== 'string' || !env[key] || env[key] !== env[key].trim())) throw new Error('mcp_configuration_incomplete');
  const origin = new URL(env.PARMA_MCP_PUBLIC_ORIGIN), redirect = new URL(env.PARMA_MCP_REDIRECT_URI);
  if (origin.protocol !== 'https:' || origin.origin !== env.PARMA_MCP_PUBLIC_ORIGIN ||
      redirect.origin !== 'https://chatgpt.com' || redirect.search || redirect.hash || redirect.username || redirect.password ||
      !(/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(redirect.pathname) || redirect.pathname === '/connector_platform_oauth_redirect') ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.PARMA_MCP_OWNER_EMAIL) ||
      env.PARMA_MCP_CLIENT_SECRET.length < 32 || env.PARMA_MCP_STORE_KEY.length < 43 ||
      !path.isAbsolute(env.PARMA_MCP_STATE_DIR) || path.basename(env.PARMA_MCP_STATE_DIR) !== 'mcp-auth' ||
      env.PARMA_MCP_SINGLE_REPLICA_CONFIRMED !== 'true') throw new Error('mcp_configuration_invalid');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('mcp_configuration_invalid');
  return {
    origin: origin.origin, issuer: `${origin.origin}/`, resource: `${origin.origin}/mcp`,
    ownerEmail: env.PARMA_MCP_OWNER_EMAIL, clientId: env.PARMA_MCP_CLIENT_ID,
    clientSecret: env.PARMA_MCP_CLIENT_SECRET, redirectUri: env.PARMA_MCP_REDIRECT_URI,
    googleClientId: env.PARMA_MCP_GOOGLE_CLIENT_ID, googleClientSecret: env.PARMA_MCP_GOOGLE_CLIENT_SECRET,
    googleCallback: `${origin.origin}/mcp/oauth/google/callback`, stateDir: env.PARMA_MCP_STATE_DIR,
    storeKey: env.PARMA_MCP_STORE_KEY, port, apiKey: env.PARMA_AGENT_API_KEY,
  };
}

const allowedRoots = {
  '/health/agent-shadow-summary': ['success', 'status', 'refreshing', 'refresh_failed', 'generated_at', 'mode',
    'writes_allowed', 'data_quality', 'source_health', 'source_diagnostics', 'tracking', 'funnel',
    'conversion_integrity', 'history', 'promotion', 'anomalies', 'primary_priorities'],
  '/tools/google/test': ['success', 'connected', 'account'],
  intelligence: ['success', 'source', 'mode', 'reader_version', 'campaign_id', 'period_days', 'date_range',
    'exact_date_range', 'overview', 'ad_groups', 'search_terms', 'keywords', 'devices', 'hours', 'geography',
    'rsa_ads', 'rsa_analysis', 'conversion_actions', 'writes_allowed', 'execution_allowed', 'spend_allowed'],
};
function createLocalReader(config, client = axios) {
  return async ({ method, path: endpoint, query }) => {
    const intelligence = /^\/tools\/google\/campaign\/\d{1,20}\/intelligence$/.test(endpoint);
    if (method !== 'GET' || (!intelligence && !Object.hasOwn(allowedRoots, endpoint)) ||
        !query || Object.keys(query).some(key => key !== 'days') ||
        (intelligence && (!Number.isInteger(query.days) || query.days < 1 || query.days > 90)) ||
        (!intelligence && Object.keys(query).length)) throw new Error('read_not_allowed');
    const response = await client.get(`http://127.0.0.1:${config.port}${endpoint}`, {
      params: query, headers: { 'x-api-key': config.apiKey }, proxy: false, maxRedirects: 0,
      timeout: 30000, maxContentLength: 2 * 1024 * 1024, responseType: 'json',
      validateStatus: status => status >= 200 && status < 300,
    });
    if (!response.data || response.data.success !== true) throw new Error('upstream_read_failed');
    return Object.fromEntries((allowedRoots[intelligence ? 'intelligence' : endpoint])
      .filter(key => Object.hasOwn(response.data, key)).map(key => [key, response.data[key]]));
  };
}

function cookieValue(req) {
  const matches = String(req.headers.cookie || '').split(';').map(s => s.trim())
    .filter(s => s.startsWith(`${COOKIE}=`));
  return matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : '';
}
function securityHeaders(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
  next();
}

function installMcp(app, { env = process.env, store, google, read, now } = {}) {
  let config;
  try { config = configuration(env); }
  catch { return installHealth(app, false, 'configuration_blocked'); }
  if (!config) return installHealth(app, false, 'disabled');
  let provider;
  try {
    provider = new ParmaOAuthProvider({ config, now,
      store: store || new FileTokenStore(config.stateDir, config.storeKey),
      google: google || new OAuth2Client({ clientId: config.googleClientId, clientSecret: config.googleClientSecret,
        redirectUri: config.googleCallback, transporterOptions: { timeout: 15000, retry: false } }),
    });
  } catch { return installHealth(app, false, 'storage_blocked'); }

  const knownSecrets = Object.entries(env).filter(([key, value]) =>
    /TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|STORE_KEY/i.test(key) && typeof value === 'string' && value.length > 0).map(([, value]) => value);
  const tools = createReadOnlyTools({ read: read || createLocalReader(config), knownSecrets,
    authorize: async auth => {
      if (!auth?.token) return false;
      const verified = await provider.verifyAccessToken(auth.token);
      return verified.resource.href === config.resource && verified.clientId === config.clientId;
    },
  });
  const router = express.Router();
  // Global cap is deliberate: it does not trust arbitrary proxy headers or track user IPs.
  let windowStart = Date.now(), count = 0, active = 0;
  router.use((req, res, next) => {
    const allowed = req.path === '/mcp' || req.path.startsWith('/mcp/oauth/') ||
      ['/authorize', '/token', '/revoke', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp'].includes(req.path);
    if (!allowed) return next('router');
    if (req.headers.host !== new URL(config.origin).host ||
        (req.headers.origin && ![config.origin, 'https://chatgpt.com'].includes(req.headers.origin))) {
      return res.status(403).json({ error: 'request_origin_rejected' });
    }
    if (Date.now() - windowStart > 60000) { count = 0; windowStart = Date.now(); }
    if (++count > 120) return res.status(429).json({ error: 'rate_limited' });
    securityHeaders(req, res, next);
  });
  router.use(express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }));
  router.use(express.json({ limit: '32kb' }));
  router.use(['/token', '/revoke'], (req, res, next) => {
    if (req.method !== 'POST' || !apiKeysMatch(req.body?.client_secret, config.clientSecret) || req.body?.client_id !== config.clientId) {
      return res.status(401).json({ error: 'invalid_client' });
    }
    next();
  });
  const authOptions = { provider, issuerUrl: new URL(config.issuer), resourceServerUrl: new URL(config.resource),
    scopesSupported: ['parma.read'], resourceName: 'Parma Ads Agent — read only',
    // The outer global limiter avoids proxy-IP ambiguity on Railway.
    authorizationOptions: { rateLimit: false }, tokenOptions: { rateLimit: false }, revocationOptions: { rateLimit: false },
  };
  router.get('/.well-known/oauth-authorization-server', (req, res) => res.json({
    ...createOAuthMetadata(authOptions), token_endpoint_auth_methods_supported: ['client_secret_post'],
    authorization_response_iss_parameter_supported: true,
  }));
  router.use('/authorize', (req, res, next) => {
    const redirect = res.redirect.bind(res);
    res.redirect = (first, second) => {
      const status = typeof first === 'number' ? first : 302;
      const target = new URL(typeof first === 'number' ? second : first);
      const permitted = new URL(config.redirectUri);
      if (target.origin === permitted.origin && target.pathname === permitted.pathname) target.searchParams.set('iss', config.issuer);
      return redirect(status, target.href);
    };
    next();
  });
  router.use(mcpAuthRouter(authOptions));
  router.get('/mcp/oauth/google/callback', async (req, res) => {
    try {
      const state = req.query.state;
      const { csrf } = await provider.finishGoogle({ state, cookie: cookieValue(req), code: req.query.code });
      // Form POSTs under no-referrer can send Origin: null. Preserve the
      // origin without disclosing the callback path, code or state in Referer.
      // Keep the strict Origin, cookie and CSRF checks on the receiving route.
      res.set('Referrer-Policy', 'strict-origin');
      // Only cryptographically generated base64url values enter this HTML.
      res.type('html').send(`<!doctype html><html lang="it"><meta charset="utf-8"><title>Collega Parma Agent</title>
        <h1>Collega ChatGPT a Parma Agent</h1><p>Consenti esclusivamente la lettura di diagnostica e dati Google Ads.
        Nessuna modifica a campagne, budget o spesa.</p><form method="post" action="/mcp/oauth/consent">
        <input type="hidden" name="state" value="${state}"><input type="hidden" name="csrf" value="${csrf}">
        <button name="decision" value="allow">Consenti lettura</button><button name="decision" value="deny">Annulla</button></form></html>`);
    } catch { res.status(400).json({ error: 'google_identity_or_session_invalid' }); }
  });
  router.post('/mcp/oauth/consent', (req, res) => {
    try {
      if (req.headers.origin !== config.origin || !['allow', 'deny'].includes(req.body?.decision)) throw new Error('invalid');
      const destination = provider.consent({ state: req.body.state, csrf: req.body.csrf,
        cookie: cookieValue(req), approved: req.body.decision === 'allow' });
      const { maxAge, ...clearOptions } = COOKIE_OPTIONS;
      res.clearCookie(COOKIE, clearOptions);
      res.redirect(destination);
    } catch { res.status(400).json({ error: 'consent_session_invalid' }); }
  });
  const bearer = requireBearerAuth({ verifier: provider, requiredScopes: ['parma.read'],
    resourceMetadataUrl: `${config.origin}/.well-known/oauth-protected-resource/mcp` });
  router.all('/mcp', bearer, async (req, res) => {
    if (req.method !== 'POST') { res.set('Allow', 'POST'); return res.status(405).end(); }
    if (active >= 4) return res.status(429).json({ error: 'too_many_concurrent_reads' });
    if (Buffer.byteLength(JSON.stringify(req.body || {})) > 32768) return res.status(413).json({ error: 'body_too_large' });
    active++;
    const server = new McpServer({ name: 'parma-readonly', version: '0.1.0' });
    for (const definition of listTools()) {
      const inputSchema = definition.name === 'parma_campaign_intelligence'
        ? z.object({ campaign_id: z.string().regex(/^\d{1,20}$/), days: z.number().int().min(1).max(90).optional() }).strict()
        : z.object({}).strict();
      server.registerTool(definition.name, { description: definition.description, annotations: definition.annotations, inputSchema },
        async args => tools.callTool(definition.name, args, req.auth));
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true; active--; clearTimeout(timeout);
      void server.close().catch(() => {});
    };
    const timeout = setTimeout(() => { if (!res.writableEnded) res.destroy(); close(); }, 35000);
    timeout.unref();
    res.once('close', close);
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'mcp_request_failed' }); close(); }
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error?.type === 'entity.too.large' ? 413 : 400).json({ error: 'invalid_mcp_request' });
  });
  app.use(router);
  installHealth(app, true, 'configured_not_live_validated');
  return { enabled: true, provider };
}

function installHealth(app, enabled, status) {
  app.get('/health/mcp', (req, res) => res.json({ success: true, enabled, status, writes_allowed: false, spend_allowed: false }));
  return { enabled, status };
}

module.exports = { installMcp, configuration, createLocalReader };
