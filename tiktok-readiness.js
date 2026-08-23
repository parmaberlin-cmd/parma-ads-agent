function assessTikTokReadiness({ google = {}, meta = {}, ga4 = {}, shadow = {}, autonomy = {} } = {}) {
  const checks = {
    google_stable: google.stable === true,
    meta_stable: meta.stable === true,
    ga4_stable: ga4.stable === true,
    shadow_history_ready: shadow.history_ready === true,
    supervised_candidate: autonomy.candidate_for_supervised_low_risk === true,
  };
  const blockers = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    ready_to_integrate: blockers.length === 0,
    checks,
    blockers,
    api_calls_allowed: false,
    campaign_writes_allowed: false,
    spend_allowed: false,
  };
}

module.exports = { assessTikTokReadiness };