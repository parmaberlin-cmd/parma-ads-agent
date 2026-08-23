function assessLiveValidationReadiness({ google = {}, ga4 = {}, meta = {}, shadow = {} } = {}) {
  const gates = {
    shadow_deployed: shadow.deploy_success === true,
    shadow_read_only_verified: shadow.read_only_verified === true,
    google_basic_access: google.basic_access === true,
    google_credentials_configured: google.credentials_configured === true,
    ga4_configured: ga4.configured === true,
    meta_preflight_ready: meta.preflight_ready === true,
  };

  return {
    full_shadow_live_ready: gates.shadow_deployed && gates.shadow_read_only_verified && gates.ga4_configured && gates.meta_preflight_ready && gates.google_basic_access && gates.google_credentials_configured,
    google_live_ready: gates.google_basic_access && gates.google_credentials_configured,
    ga4_live_ready: gates.ga4_configured,
    meta_paused_test_ready: gates.meta_preflight_ready,
    blockers: Object.entries(gates).filter(([, ready]) => !ready).map(([name]) => name),
    meta_write_authorized: false,
    spend_authorized: false,
    activation_authorized: false,
  };
}

function nextExternalValidation(readiness = {}) {
  const blockers = new Set(readiness.blockers || []);
  if (blockers.has('shadow_deployed')) return 'wait_for_deploy';
  if (blockers.has('shadow_read_only_verified')) return 'verify_sanitized_shadow_health';
  if (blockers.has('meta_preflight_ready')) return 'run_meta_read_only_preflight';
  if (blockers.has('ga4_configured')) return 'configure_or_verify_ga4_read_access';
  if (blockers.has('google_basic_access')) return 'wait_for_google_basic_access';
  if (blockers.has('google_credentials_configured')) return 'verify_google_read_credentials';
  return 'full_shadow_live_validation';
}

module.exports = { assessLiveValidationReadiness, nextExternalValidation };