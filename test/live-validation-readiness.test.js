const test = require('node:test');
const assert = require('node:assert/strict');
const { assessLiveValidationReadiness, nextExternalValidation } = require('../live-validation-readiness');

test('full live validation stays blocked while Google Basic Access is missing', () => {
  const result = assessLiveValidationReadiness({
    shadow: { deploy_success: true, read_only_verified: true },
    google: { basic_access: false, credentials_configured: true },
    ga4: { configured: true },
    meta: { preflight_ready: true },
  });
  assert.equal(result.full_shadow_live_ready, false);
  assert.equal(result.google_live_ready, false);
  assert.equal(nextExternalValidation(result), 'wait_for_google_basic_access');
});

test('Meta PAUSED readiness does not authorize the write itself', () => {
  const result = assessLiveValidationReadiness({ meta: { preflight_ready: true } });
  assert.equal(result.meta_paused_test_ready, true);
  assert.equal(result.meta_write_authorized, false);
  assert.equal(result.spend_authorized, false);
  assert.equal(result.activation_authorized, false);
});

test('all external gates can become validation-ready without authorizing writes', () => {
  const result = assessLiveValidationReadiness({
    shadow: { deploy_success: true, read_only_verified: true },
    google: { basic_access: true, credentials_configured: true },
    ga4: { configured: true },
    meta: { preflight_ready: true },
  });
  assert.equal(result.full_shadow_live_ready, true);
  assert.equal(result.meta_write_authorized, false);
});