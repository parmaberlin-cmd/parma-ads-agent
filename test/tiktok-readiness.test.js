const test = require('node:test');
const assert = require('node:assert/strict');
const { assessTikTokReadiness } = require('../tiktok-readiness');

test('TikTok integration stays blocked until core channels and Shadow history are stable', () => {
  const result = assessTikTokReadiness({
    google: { stable: true },
    meta: { stable: true },
    ga4: { stable: false },
    shadow: { history_ready: true },
    autonomy: { candidate_for_supervised_low_risk: true },
  });
  assert.equal(result.ready_to_integrate, false);
  assert.ok(result.blockers.includes('ga4_stable'));
  assert.equal(result.api_calls_allowed, false);
});

test('even a ready TikTok integration cannot write or spend by default', () => {
  const result = assessTikTokReadiness({
    google: { stable: true },
    meta: { stable: true },
    ga4: { stable: true },
    shadow: { history_ready: true },
    autonomy: { candidate_for_supervised_low_risk: true },
  });
  assert.equal(result.ready_to_integrate, true);
  assert.equal(result.campaign_writes_allowed, false);
  assert.equal(result.spend_allowed, false);
});