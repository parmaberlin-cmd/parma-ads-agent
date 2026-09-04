function sanitizeError(error) {
  if (!error) return null;
  const text = String(error.message || error);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/(access_token|refresh_token|client_secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

function assessGa4Health({ ga4_ok = false, google_ok = false, ga4_error = null, conversion_sources_disagree = false, funnel_complete = false } = {}) {
  const healthy = ga4_ok === true;
  const blockers = [];
  if (!healthy) blockers.push('ga4_unhealthy');
  if (conversion_sources_disagree) blockers.push('conversion_sources_disagree');
  if (!funnel_complete) blockers.push('funnel_incomplete');
  return {
    source: 'ga4',
    healthy,
    google_healthy: google_ok === true,
    sanitized_error: sanitizeError(ga4_error),
    conversion_sources_disagree: Boolean(conversion_sources_disagree),
    funnel_complete: Boolean(funnel_complete),
    optimization_allowed: healthy && !conversion_sources_disagree && funnel_complete,
    writes_allowed: false,
    blockers
  };
}

module.exports = { sanitizeError, assessGa4Health };
