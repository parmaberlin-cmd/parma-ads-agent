function code(value, fallback = 'unknown') {
  if (value == null) return fallback;
  const normalized = String(value).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);
  return normalized || fallback;
}

function add(list, blocker, detail = null) {
  list.push({ blocker: code(blocker), detail: detail == null ? null : code(detail) });
}

function buildFinalReadinessAudit({ summary = {}, metaPreflight = {}, now = new Date() } = {}) {
  const external = [];
  const timeBased = [];
  const software = [];
  const health = summary.source_health || {};
  const googleDiagnostic = summary.source_diagnostics?.google || {};
  const history = summary.history || {};
  const promotion = summary.promotion || {};
  const tracking = summary.tracking || {};

  if (health.google !== true) {
    const reason = code(googleDiagnostic.reason || googleDiagnostic.category, 'google_unavailable');
    if (['developer_token_invalid','basic_access_required','developer_token_rejected','oauth_refresh_required','account_access_required'].includes(reason)) add(external, 'google_live_access', reason);
    else add(software, 'google_live_access_unclassified', reason);
  }
  if (health.ga4 !== true) add(external, 'ga4_live_access', summary.source_errors?.ga4 || 'unavailable');
  if (health.meta !== true) add(external, 'meta_live_access', summary.source_errors?.meta || 'unavailable');

  const reservationStart = tracking.reservation_start;
  const configured = reservationStart && typeof reservationStart === 'object' ? reservationStart.configured === true : reservationStart === true;
  const observed = reservationStart && typeof reservationStart === 'object' ? reservationStart.observed === true : reservationStart === true;
  if (!configured) add(software, 'ga4_reservation_start_not_configured');
  else if (!observed) add(timeBased, 'ga4_reservation_start_not_observed');

  if (metaPreflight.read_only_ready !== true && metaPreflight.ready !== true) add(external, 'meta_read_only_preflight_not_ready', metaPreflight.blockers?.[0]);
  if (metaPreflight.write_ready === true) add(software, 'meta_write_gate_unexpectedly_ready');

  if (history.storage?.healthy !== true) add(software, 'shadow_history_integrity_unhealthy', history.storage?.reason || 'unknown');
  if (history.storage?.durable !== true) add(external, 'shadow_history_not_durable', history.storage?.source || history.storage?.path_class);
  const runs = Number(history.total_runs || 0);
  if (!Number.isFinite(runs) || runs < 14) add(timeBased, 'insufficient_shadow_runs', String(Number.isFinite(runs) ? runs : 0));

  const promotionBlockers = Array.isArray(promotion.blockers) ? promotion.blockers : [];
  for (const blocker of promotionBlockers) {
    const text = String(blocker || '');
    if (/google|ga4|meta|history:storage|history:integrity/i.test(text)) continue;
    if (/regression_suite_not_verified/i.test(text)) add(external, 'runtime_build_validation_flag', text);
    else if (/insufficient|history:/i.test(text)) add(timeBased, 'promotion_history_gate', text);
    else add(software, 'promotion_gate', text);
  }

  if (summary.writes_allowed !== false) add(software, 'public_shadow_write_contract_invalid');
  if (summary.data_quality?.integrity_ok !== true) add(software, 'data_integrity_not_green');

  const softwareComplete = software.length === 0;
  return {
    generated_at: now.toISOString(),
    mode: 'independent_readiness_audit',
    software_complete: softwareComplete,
    autonomous_read_only_ready: softwareComplete && health.ga4 === true && health.meta === true,
    supervised_promotion_ready: promotion.promotion_ready === true && softwareComplete && external.length === 0 && timeBased.length === 0,
    blockers: { external, time_based: timeBased, software },
    next_actions: {
      autonomous: software.map((item) => item.blocker),
      external: external.map((item) => item.blocker),
      wait_for_evidence: timeBased.map((item) => item.blocker),
    },
    write_test_authorized: false,
    external_write_authorized: false,
    execution_authorized: false,
    activation_authorized: false,
    spend_authorized: false,
    writes_allowed: false,
  };
}

function assertAuditSafe(audit = {}) {
  for (const key of ['write_test_authorized','external_write_authorized','execution_authorized','activation_authorized','spend_authorized','writes_allowed']) {
    if (audit[key] !== false) throw new Error(`final audit safety contract violated: ${key}`);
  }
  return true;
}

module.exports = { code, buildFinalReadinessAudit, assertAuditSafe };