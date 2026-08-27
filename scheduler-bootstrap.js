const axios = require('axios');

function clampRefreshMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(15, Math.min(1440, Math.round(parsed)));
}

function buildRefreshUrl(env = process.env) {
  const port = Number(env.PORT || 3000);
  return `http://127.0.0.1:${port}/tools/agent/shadow/refresh`;
}

function startReadonlyShadowScheduler({ env = process.env, client = axios } = {}) {
  const apiKey = env.PARMA_AGENT_API_KEY;
  if (!apiKey) {
    console.warn(JSON.stringify({
      event: 'shadow_scheduler',
      enabled: false,
      reason: 'api_key_missing',
      writes_allowed: false,
    }));
    return null;
  }

  const intervalMinutes = clampRefreshMinutes(env.SHADOW_REFRESH_INTERVAL_MINUTES || 60);
  const intervalMs = intervalMinutes * 60 * 1000;
  const url = buildRefreshUrl(env);

  async function tick() {
    try {
      const response = await client.post(url, null, {
        headers: { 'x-api-key': apiKey },
        timeout: 30000,
        validateStatus: () => true,
      });
      const ok = response.status === 202;
      console.log(JSON.stringify({
        event: 'shadow_scheduler_tick',
        success: ok,
        status_code: response.status,
        refresh_status: response.data?.status || null,
        interval_minutes: intervalMinutes,
        writes_allowed: false,
      }));
    } catch {
      console.error(JSON.stringify({
        event: 'shadow_scheduler_tick',
        success: false,
        error: 'refresh_request_failed',
        interval_minutes: intervalMinutes,
        writes_allowed: false,
      }));
    }
  }

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  console.log(JSON.stringify({
    event: 'shadow_scheduler',
    enabled: true,
    interval_minutes: intervalMinutes,
    writes_allowed: false,
  }));

  return { timer, tick, intervalMinutes, url };
}

require('./operational-live-pulse-preload');
require('./google-campaign-intelligence-preload');
require('./bootstrap');
startReadonlyShadowScheduler();

module.exports = { clampRefreshMinutes, buildRefreshUrl, startReadonlyShadowScheduler };
