const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeError, assessGa4Health } = require('../ga4-health-guard');

test('GA4 unhealthy is surfaced even while Google remains healthy', () => {
  const x = assessGa4Health({ ga4_ok:false, google_ok:true, funnel_complete:true });
  assert.equal(x.healthy, false);
  assert.equal(x.google_healthy, true);
  assert.equal(x.optimization_allowed, false);
  assert.equal(x.writes_allowed, false);
});

test('GA4 error is sanitized', () => {
  const text = sanitizeError('OAuth failed refresh_token=super-secret access_token=also-secret');
  assert.equal(text.includes('super-secret'), false);
  assert.equal(text.includes('also-secret'), false);
  assert.match(text, /REDACTED/);
});

test('source disagreement blocks conversion optimization', () => {
  const x = assessGa4Health({ ga4_ok:true, google_ok:true, conversion_sources_disagree:true, funnel_complete:true });
  assert.equal(x.optimization_allowed, false);
  assert.ok(x.blockers.includes('conversion_sources_disagree'));
});

test('incomplete funnel blocks conversion optimization', () => {
  const x = assessGa4Health({ ga4_ok:true, google_ok:true, funnel_complete:false });
  assert.equal(x.optimization_allowed, false);
  assert.ok(x.blockers.includes('funnel_incomplete'));
});
