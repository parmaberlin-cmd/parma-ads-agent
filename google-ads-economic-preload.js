'use strict';

// Service-side hook for the economic (spend) budget job worker.
//
// Enabled by default because it is inert without a signed, capped, allowlisted
// job on the persistent volume: no job means no read of Google Ads and no
// write at all. Set GOOGLE_ADS_ECONOMIC_JOBS=disabled to turn it off.
// This avoids requiring a Railway variable change to activate the capability.
const { startEconomicWorker } = require('./google-ads-economic-budget-job');

function startEconomicStartup({ env = process.env, log = entry => console.log(JSON.stringify(entry)), ...options } = {}) {
  if (env.GOOGLE_ADS_ECONOMIC_JOBS === 'disabled') {
    log({ event: 'economic_job_worker', enabled: false, reason: 'disabled_by_flag', provider_write: false, writes_executed: 0 });
    return null;
  }
  try {
    const worker = startEconomicWorker({ env, log, ...options });
    log({ event: 'economic_job_worker', enabled: true, interval_ms: options.intervalMs || 15000, provider_write: false, writes_executed: 0 });
    return worker;
  } catch (error) {
    log({ event: 'economic_job_worker', enabled: false, reason: String((error && error.message) || error).split('\n')[0], provider_write: false, writes_executed: 0 });
    return null;
  }
}

if (require.main !== module) {
  setImmediate(() => { startEconomicStartup(); });
}

module.exports = { startEconomicStartup };
