const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeMetaIssues } = require("../live-shadow-data");

test("Meta issue diagnostics fail closed for missing or malformed issue lists", () => {
  assert.deepEqual(sanitizeMetaIssues(), []);
  assert.deepEqual(sanitizeMetaIssues(null), []);
  assert.deepEqual(sanitizeMetaIssues({ error_message:"not-an-array" }), []);
});

test("Meta issue diagnostics normalize and sanitize diagnostic text", () => {
  const [issue] = sanitizeMetaIssues([{ level:"ERROR", error_code:12345, error_summary:"Delivery\nproblem\tfor creative", error_message:"First line\r\nSecond line" }]);
  assert.deepEqual(issue, { level:"ERROR", code:"12345", summary:"Delivery problem for creative", message:"First line Second line" });
});

test("Meta issue diagnostics cap issue count and diagnostic lengths", () => {
  const issues = Array.from({ length:25 }, (_, index) => ({ level:"L".repeat(60), error_code:index, error_summary:"S".repeat(250), error_message:"M".repeat(400) }));
  const sanitized = sanitizeMetaIssues(issues);
  assert.equal(sanitized.length, 20);
  assert.equal(sanitized[0].level.length, 40);
  assert.equal(sanitized[0].summary.length, 180);
  assert.equal(sanitized[0].message.length, 300);
});
