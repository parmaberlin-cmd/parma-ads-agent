'use strict';

const { MODES, runCommercialOneShot } = require('./google-ads-commercial-runner');

let startupConsumed = false;

function sanitizedCommercialResult(result = {}) {
  return {
    event: 'google_ads_commercial_startup_result',
    status: result.status || 'BLOCKED',
    mode: result.mode || null,
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    plan_id: result.plan_id || null,
    plan_digest: result.plan_digest || null,
    customer_id: result.customer_id || null,
    action_count: result.action_count || 0,
    writes_executed: result.writes_executed || 0,
    provider_write: result.provider_write === true,
    provider_credentials_internal: result.provider_credentials_internal === true,
    spend_allowed: false,
    commercial_mutations: result.commercial_mutations || 0,
  };
}

async function runStartupCommercial({ env = process.env, log = entry => console.log(JSON.stringify(entry)), runner = runCommercialOneShot } = {}) {
  const mode = env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE;
  const executionAuthorized = env.GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED;
  const activationAuthorized = env.GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED;
  env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE = '';
  env.GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED = '';
  env.GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED = '';
  if (!MODES.has(mode)) return { status: 'DISABLED', writes_executed: 0, provider_write: false, spend_allowed: false };
  if (startupConsumed) return { status: 'BLOCKED', blockers: ['commercial_startup_already_consumed'], writes_executed: 0, provider_write: false, spend_allowed: false };
  startupConsumed = true;
  const safe = sanitizedCommercialResult(await runner({ env: { ...env, GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED: executionAuthorized, GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED: activationAuthorized }, mode }));
  log(safe);
  return safe;
}

if (MODES.has(process.env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE)) {
  setImmediate(() => runStartupCommercial().catch(() => console.error(JSON.stringify({
    event: 'google_ads_commercial_startup_result', status: 'BLOCKED', blockers: ['commercial_startup_failed'],
    writes_executed: 0, provider_write: false, spend_allowed: false, commercial_mutations: 0,
  }))));
}

module.exports = { sanitizedCommercialResult, runStartupCommercial };
