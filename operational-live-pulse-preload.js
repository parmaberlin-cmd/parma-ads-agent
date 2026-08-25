const realExpress = require('express');
const { collectOperationalLivePulse } = require('./operational-live-pulse');
const { safePublicJson } = require('./public-output-safety');

const CACHE_MS = 5 * 60 * 1000;
const pulseState = { result: null, expires_at: 0, promise: null, last_error: null };

function authorized(req, env = process.env) {
  const supplied = req.headers['x-api-key'] || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return Boolean(env.PARMA_AGENT_API_KEY && supplied === env.PARMA_AGENT_API_KEY);
}

function publicPeriod(period = {}) {
  return {
    ...(period.date ? { date: period.date } : {}),
    ...(period.start ? { start: period.start } : {}),
    ...(period.end ? { end: period.end } : {}),
    google: period.google ? { ...period.google, campaigns: undefined } : null,
    meta: period.meta ? { ...period.meta, campaigns: undefined } : null,
    ga4: period.ga4 || null,
    signals: period.signals || {},
  };
}

function publicPulse(result = {}) {
  return {
    generated_at: result.generated_at || null,
    timezone: result.timezone || 'Europe/Berlin',
    mode: 'read_only_live_pulse',
    today: publicPeriod(result.today),
    last_7d: publicPeriod(result.last_7d),
    writes_allowed: false,
    execution_allowed: false,
    spend_allowed: false,
  };
}

async function getPulse({ env = process.env, now = new Date(), force = false } = {}) {
  if (!force && pulseState.result && Date.now() < pulseState.expires_at) return pulseState.result;
  if (pulseState.promise) return pulseState.promise;
  pulseState.promise = collectOperationalLivePulse({ env, now })
    .then((result) => {
      pulseState.result = result;
      pulseState.expires_at = Date.now() + CACHE_MS;
      pulseState.last_error = null;
      return result;
    })
    .catch((error) => {
      pulseState.last_error = String(error?.message || error).slice(0, 80);
      throw error;
    })
    .finally(() => { pulseState.promise = null; });
  return pulseState.promise;
}

function wrappedExpress(...args) {
  const app = realExpress(...args);

  app.get('/health/agent-live-pulse', async (req, res) => {
    try {
      const result = await getPulse();
      return safePublicJson(res, { success: true, ...publicPulse(result) });
    } catch {
      return safePublicJson(res.status(503), { success: false, status: 'unavailable', mode: 'read_only_live_pulse', error: 'live_pulse_collection_failed', writes_allowed: false });
    }
  });

  app.get('/tools/agent/live-pulse', async (req, res) => {
    if (!authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
      const result = await getPulse({ force: req.query?.refresh === 'true' });
      return res.json({ success: true, ...result });
    } catch {
      return res.status(503).json({ success: false, status: 'unavailable', mode: 'read_only_live_pulse', error: 'live_pulse_collection_failed', writes_allowed: false });
    }
  });

  return app;
}
Object.assign(wrappedExpress, realExpress);
require.cache[require.resolve('express')].exports = wrappedExpress;

module.exports = { CACHE_MS, pulseState, authorized, publicPeriod, publicPulse, getPulse, wrappedExpress };