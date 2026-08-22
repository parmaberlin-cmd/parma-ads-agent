const test = require("node:test");
const assert = require("node:assert/strict");
const { getDateRange, googleConfigured, metaConfigured, cleanGoogleDiagnostic } = require("../live-shadow-data");

test("live shadow collectors fail closed when credentials are absent", () => { assert.equal(googleConfigured({}), false); assert.equal(metaConfigured({}), false); });
test("live shadow collectors detect complete credential presence without exposing values", () => { assert.equal(googleConfigured({ GOOGLE_CLIENT_ID:"x", GOOGLE_CLIENT_SECRET:"x", GOOGLE_DEVELOPER_TOKEN:"x", GOOGLE_REFRESH_TOKEN:"x", GOOGLE_CUSTOMER_ID:"x" }), true); assert.equal(metaConfigured({ META_ACCESS_TOKEN:"x", META_AD_ACCOUNT_ID:"x" }), true); });
test("date range uses completed days only", () => { assert.deepEqual(getDateRange(2, new Date("2026-08-21T12:00:00Z")), { start:"2026-08-19", end:"2026-08-20" }); });
test("Google collector diagnostics classify developer-token failures without credentials", () => { const diagnostic=cleanGoogleDiagnostic({message:"Developer token is not approved for production access"}); assert.equal(diagnostic.category,"developer_token"); assert.equal(diagnostic.error,"google_read_failed"); assert.equal(Object.prototype.hasOwnProperty.call(diagnostic,"token"),false); });
test("Google collector diagnostics classify account permission failures", () => { const diagnostic=cleanGoogleDiagnostic({message:"USER_PERMISSION_DENIED for customer"}); assert.equal(diagnostic.category,"account_access"); });
