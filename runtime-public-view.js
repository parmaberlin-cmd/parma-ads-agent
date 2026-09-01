const { googleRuntimeConfigDiagnostics } = require('./google-runtime-config-diagnostics');

function safeCode(value, fallback = null, max = 64) {
  if (value == null) return fallback;
  const normalized = String(value).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, max);
  return normalized || fallback;
}

function sourceErrorCode(source = {}, fallback = "unavailable") {
  if (source.access_ok === true) return null;
  const raw = String(source.error || fallback);
  if (/^[a-z0-9_.:-]{1,64}$/i.test(raw)) return raw;
  return fallback;
}

function publicGoogleDiagnostic(google = {}, env = process.env) {
  const diagnostic = google.diagnostic || google.search_intelligence_diagnostic || null;
  return {
    category: safeCode(diagnostic?.category, diagnostic ? "unknown" : null),
    reason: safeCode(diagnostic?.reason, diagnostic ? "unknown" : null),
    code: safeCode(diagnostic?.code, null),
    family: safeCode(diagnostic?.family, null),
    config: googleRuntimeConfigDiagnostics(env),
  };
}

function observedEvent(ga4 = {}, eventName) {
  const explicit = ga4.funnel?.completeness?.tracking?.[eventName];
  if (explicit && typeof explicit.observed === "boolean") return explicit.observed;
  const count = Number(ga4.funnel?.totals?.[eventName] || 0);
  return Number.isFinite(count) && count > 0;
}

function configuredEvent(ga4 = {}, eventName) {
  const explicit = ga4.funnel?.completeness?.tracking?.[eventName];
  if (explicit && typeof explicit.configured === "boolean") return explicit.configured;
  return Array.isArray(ga4.funnel?.event_names) && ga4.funnel.event_names.includes(eventName);
}

function publicTrackingView(ga4 = {}) {
  const names = ["reservation_page_view", "reservation_start", "booking_completed"];
  return Object.fromEntries(names.map((name) => [name, {
    configured: configuredEvent(ga4, name),
    observed: observedEvent(ga4, name),
  }]));
}

function safeAggregateCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function publicEventCandidates(ga4 = {}) {
  const rows = Array.isArray(ga4.event_inventory?.reservation_candidates) ? ga4.event_inventory.reservation_candidates : [];
  return rows.slice(0, 20).map((row) => ({
    event_name: safeCode(row.event_name, "unknown_event"),
    event_count: safeAggregateCount(row.event_count),
  }));
}

function publicCandidateAttribution(ga4 = {}) {
  const names = Array.isArray(ga4.candidate_attribution?.event_names) ? ga4.candidate_attribution.event_names : [];
  const totals = ga4.candidate_attribution?.totals || {};
  const googleCpc = ga4.candidate_attribution?.google_cpc || {};
  return names.slice(0, 20).map((name) => ({
    event_name: safeCode(name, "unknown_event"),
    total: safeAggregateCount(totals[name]),
    google_cpc: safeAggregateCount(googleCpc[name]),
  }));
}

function publicGa4Diagnostic(ga4 = {}) {
  if (ga4.access_ok === true) {
    return {
      configuration_complete: ga4.configuration_complete === true,
      funnel_configuration_complete: ga4.funnel?.completeness?.configuration_complete === true,
      funnel_observation_complete: ga4.funnel?.completeness?.observation_complete === true,
      booking_counts: {
        total: safeAggregateCount(ga4.total_booking_completed),
        google_cpc: safeAggregateCount(ga4.google_cpc_booking_completed),
      },
      booking_quality: {
        event_count: safeAggregateCount(ga4.booking_quality?.event_count),
        users: safeAggregateCount(ga4.booking_quality?.users),
        sessions: safeAggregateCount(ga4.booking_quality?.sessions),
        duplication_risk: ga4.booking_quality?.duplication_risk === true,
      },
      event_inventory_count: safeAggregateCount(ga4.event_inventory?.event_count),
      reservation_event_candidates: publicEventCandidates(ga4),
      reservation_candidate_attribution: publicCandidateAttribution(ga4),
    };
  }
  return {
    configuration_complete: ga4.configuration_complete === true,
    required_variable: safeCode(ga4.required_variable, null),
  };
}

function publicMetaDiagnostic(meta = {}) {
  if (meta.access_ok !== true) return null;
  const report = meta.overview?.issue_report || {};
  return {
    campaign_counts: meta.overview?.campaign_counts || {},
    affected_objects: Number(report.affected_objects || 0),
    issue_count: Number(report.issue_count || 0),
    issue_categories: report.issue_categories || report.categories || {},
    issue_reasons: report.issue_reasons || {},
    unknown_issue_codes: report.unknown_codes || {},
  };
}

function buildPublicSourceView(liveSources = {}, env = process.env) {
  const google = liveSources.google || {};
  const ga4 = liveSources.ga4 || {};
  const meta = liveSources.meta || {};
  return {
    source_health: {
      google: google.access_ok === true,
      ga4: ga4.access_ok === true,
      meta: meta.access_ok === true,
    },
    source_errors: {
      google: sourceErrorCode(google, "google_unavailable"),
      ga4: sourceErrorCode(ga4, "ga4_unavailable"),
      meta: sourceErrorCode(meta, "meta_unavailable"),
    },
    source_diagnostics: {
      google: publicGoogleDiagnostic(google, env),
      ga4: publicGa4Diagnostic(ga4),
      meta: publicMetaDiagnostic(meta),
    },
    tracking: publicTrackingView(ga4),
  };
}

module.exports = {
  safeCode,
  sourceErrorCode,
  publicGoogleDiagnostic,
  observedEvent,
  configuredEvent,
  publicTrackingView,
  safeAggregateCount,
  publicEventCandidates,
  publicCandidateAttribution,
  publicGa4Diagnostic,
  publicMetaDiagnostic,
  buildPublicSourceView,
};