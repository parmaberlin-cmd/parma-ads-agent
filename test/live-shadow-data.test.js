const test = require("node:test");
const assert = require("node:assert/strict");
const { getDateRange, googleConfigured, metaConfigured, sanitizeMetaIssues } = require("../live-shadow-data");

test("live shadow collectors fail closed when credentials are absent", () => {
  assert.equal(googleConfigured({}), false);
  assert.equal(metaConfigured({}), false);
});

test("live shadow collectors detect complete credential presence without exposing values", () => {
  assert.equal(googleConfigured({ GOOGLE_CLIENT_ID:"x", GOOGLE_CLIENT_SECRET:"x", GOOGLE_DEVELOPER_TOKEN:"x", GOOGLE_REFRESH_TOKEN:"x", GOOGLE_CUSTOMER_ID:"x" }), true);
  assert.equal(metaConfigured({ META_ACCESS_TOKEN:"x", META_AD_ACCOUNT_ID:"x" }), true);
});

test("date range uses completed days only", () => {
  const range = getDateRange(2, new Date("2026-08-21T12:00:00Z"));
  assert.deepEqual(range, { start:"2026-08-19", end:"2026-08-20" });
});

test("Meta issue diagnostics fail closed for missing or malformed issue lists", () => {
  assert.deepEqual(sanitizeMetaIssues(), []);
  assert.deepEqual(sanitizeMetaIssues(null), []);
  assert.deepEqual(sanitizeMetaIssues({ error_message: "not-an-array" }), []);
});

test("Meta issue diagnostics normalize and sanitize diagnostic text", () => {
  const [issue] = sanitizeMetaIssues([{
    level: "ERROR",
    error_code: 12345,
    error_summary: "Delivery\nproblem\tfor creative",
    error_message: "First line\r\nSecond line",
  }]);
  assert.deepEqual(issue, {
    level: "ERROR",
    code: "12345",
    summary: "Delivery problem for creative",
    message: "First line Second line",
  });
});

test("Meta issue diagnostics cap issue count and diagnostic lengths", () => {
  const issues = Array.from({ length: 25 }, (_, index) => ({
    level: "L".repeat(60),
    error_code: index,
    error_summary: "S".repeat(250),
    error_message: "M".repeat(400),
  }));
  const sanitized = sanitizeMetaIssues(issues);
  assert.equal(sanitized.length, 20);
  assert.equal(sanitized[0].level.length, 40);
  assert.equal(sanitized[0].summary.length, 180);
  assert.equal(sanitized[0].message.length, 300);
});
