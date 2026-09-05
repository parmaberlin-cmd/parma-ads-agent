const test = require("node:test");
const assert = require("node:assert/strict");
const { getDateRange, googleConfigured, metaConfigured, googleDiagnosticReason, cleanGoogleDiagnostic } = require("../live-shadow-data");

test("live shadow collectors fail closed when credentials are absent", () => {
  assert.equal(googleConfigured({}), false);
  assert.equal(metaConfigured({}), false);
});

test("live shadow collectors detect complete credential presence without exposing values", () => {
  assert.equal(googleConfigured({ GOOGLE_CLIENT_ID:"x", GOOGLE_CLIENT_SECRET:"x", GOOGLE_DEVELOPER_TOKEN:"x", GOOGLE_REFRESH_TOKEN:"x", GOOGLE_CUSTOMER_ID:"x" }), true);
  assert.equal(metaConfigured({ META_ACCESS_TOKEN:"x", META_AD_ACCOUNT_ID:"x" }), true);
  assert.equal(metaConfigured({ META_USER_ACCESS_TOKEN:"ads-token", META_AD_ACCOUNT_ID:"x" }), true);
});

test("date range uses completed days only", () => {
  const range = getDateRange(2, new Date("2026-08-21T12:00:00Z"));
  assert.deepEqual(range, { start:"2026-08-19", end:"2026-08-20" });
});

test("developer token diagnostics distinguish access-level gating from invalid token", () => {
  assert.equal(googleDiagnosticReason('developer_token','developer token not approved for Basic Access',null),'basic_access_required');
  assert.equal(googleDiagnosticReason('developer_token','developer token is not valid',null),'developer_token_invalid');
});

test("Google diagnostic remains sanitized and structured", () => {
  const result=cleanGoogleDiagnostic({message:'Developer token is not valid'});
  assert.equal(result.category,'developer_token');
  assert.equal(result.reason,'developer_token_invalid');
  assert.equal(result.error,'google_read_failed');
});
