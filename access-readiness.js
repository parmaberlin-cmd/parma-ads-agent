function assessExternalAccessReadiness({ googleBasicAccess=false, metaRuntimeAccess=false, ga4RuntimeAccess=false }={}) {
  const blockers=[];
  if(!googleBasicAccess) blockers.push({code:"GOOGLE_BASIC_ACCESS_REQUIRED",scope:["real_search_terms","real_keywords","google_conversion_freshness"]});
  if(!metaRuntimeAccess) blockers.push({code:"META_RUNTIME_ACCESS_REQUIRED",scope:["live_paused_draft_validation","meta_live_structure_verification"]});
  if(!ga4RuntimeAccess) blockers.push({code:"GA4_RUNTIME_ACCESS_REQUIRED",scope:["real_funnel_validation","booking_started_presence"]});

  const offlineWorkRemaining = [
    "shadow_decision_logic",
    "daily_report_format",
    "decision_journal",
    "safety_tests",
    "simulation_tests",
  ];

  return {
    can_continue_offline: true,
    external_validation_complete: blockers.length===0,
    mandatory_access_for_live_validation: blockers,
    offline_work_remaining: offlineWorkRemaining,
  };
}

function liveValidationBlocked(readiness) {
  return !readiness || readiness.external_validation_complete !== true;
}

module.exports={assessExternalAccessReadiness,liveValidationBlocked};
