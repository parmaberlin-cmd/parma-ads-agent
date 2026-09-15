'use strict';

// Service-side hook: starts the unattended commercial job worker inside the
// always-on Railway process. Enabled only by an explicit opt-in
// (GOOGLE_ADS_UNATTENDED_JOBS=enabled); otherwise this module is inert, so a
// deployment cannot start executing jobs by accident.
//
// The worker never performs a provider write unless a signed, unexpired job with
// a matching plan digest is present on the persistent volume, and every action
// still passes the existing control-plane gates.
const { startUnattendedWorker, unattendedJobsEnabled } = require('./google-ads-unattended-runner');

function startUnattendedStartup({ env = process.env, log = entry => console.log(JSON.stringify(entry)), ...options } = {}) {
  const enabled = env.GOOGLE_ADS_UNATTENDED_JOBS === 'enabled';
  if (!enabled) {
    log({ event: 'google_ads_unattended_worker', enabled: false, reason: unattendedJobsEnabled(env) ? 'not_opted_in' : 'disabled_by_flag', provider_write: false, writes_executed: 0 });
    return null;
  }
  try {
    const worker = startUnattendedWorker({ env, log, ...options });
    log({ event: 'google_ads_unattended_worker', enabled: true, interval_ms: options.intervalMs || 15000, provider_write: false, writes_executed: 0 });
    return worker;
  } catch (error) {
    log({ event: 'google_ads_unattended_worker', enabled: false, reason: String(error?.message || error).split('\n')[0], provider_write: false, writes_executed: 0 });
    return null;
  }
}

if (require.main !== module && process.env.GOOGLE_ADS_UNATTENDED_JOBS === 'enabled') {
  setImmediate(() => { startUnattendedStartup(); });
}

module.exports = { startUnattendedStartup };
