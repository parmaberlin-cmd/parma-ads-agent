'use strict';

const { validateOnlyCanary, executeCanary } = require('./google-ads-canary-runner');

const STARTUP_MODES = new Set(['VALIDATE_ONLY', 'EXECUTE_CANARY']);

function sanitizedCanaryResult(result = {}) {
  return {
    event: 'google_ads_canary_startup_result',
    status: result.status || 'BLOCKED',
    mode: result.mode || null,
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    customer_id: result.customer_id || null,
    campaign_id: result.campaign_id || null,
    keyword: result.keyword || null,
    writes_executed: result.writes_executed ?? 0,
    provider_write: result.provider_write === true,
    financial_exposure_eur: result.financial_exposure_eur ?? 0,
    execution_authorized: result.execution_authorized === true,
    spend_allowed: false,
    activation_authorized: false,
    automatic_rollback_verified: result.automatic_rollback_verified === true,
    rollback_verified: result.rollback_verified === true,
    real_google_ads_mutation_attempted: result.real_google_ads_mutation_attempted === true,
  };
}

async function runStartupCanary({ env = process.env, log = entry => console.log(JSON.stringify(entry)) } = {}) {
  const mode = env.GOOGLE_ADS_CANARY_STARTUP_MODE;
  env.GOOGLE_ADS_CANARY_STARTUP_MODE = '';
  if (!STARTUP_MODES.has(mode)) return { status: 'disabled', writes_executed: 0, provider_write: false };
  const result = mode === 'VALIDATE_ONLY'
    ? await validateOnlyCanary({ env })
    : await executeCanary({ env });
  const safe = sanitizedCanaryResult(result);
  log(safe);
  return safe;
}

if (STARTUP_MODES.has(process.env.GOOGLE_ADS_CANARY_STARTUP_MODE)) {
  setImmediate(() => {
    runStartupCanary().catch(() => console.error(JSON.stringify({
      event: 'google_ads_canary_startup_result',
      status: 'BLOCKED',
      blockers: ['startup_canary_failed'],
      writes_executed: 0,
      provider_write: false,
      financial_exposure_eur: 0,
      spend_allowed: false,
      activation_authorized: false,
    })));
  });
}

module.exports = { STARTUP_MODES, sanitizedCanaryResult, runStartupCanary };
