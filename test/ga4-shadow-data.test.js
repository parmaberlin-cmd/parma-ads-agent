const test = require("node:test");
const assert = require("node:assert/strict");
const { ga4Configured, parseGa4Date, sourceMediumFilters } = require("../ga4-shadow-data");

test("GA4 collector fails closed when property configuration is missing", () => {
  assert.equal(ga4Configured({}), false);
});

test("GA4 collector recognizes required configuration without exposing values", () => {
  assert.equal(ga4Configured({ GA4_PROPERTY_ID:"x", GOOGLE_CLIENT_ID:"x", GOOGLE_CLIENT_SECRET:"x", GOOGLE_REFRESH_TOKEN:"x" }), true);
});

test("GA4 date parser converts analytics date format", () => {
  assert.equal(parseGa4Date("20260820"), "2026-08-20T12:00:00.000Z");
  assert.equal(parseGa4Date("bad"), null);
});

test("GA4 funnel attribution uses google cpc session filters only when requested", () => {
  assert.deepEqual(sourceMediumFilters(false), []);
  const filters = sourceMediumFilters(true);
  assert.equal(filters.length, 2);
  assert.equal(filters[0].filter.fieldName, "sessionSource");
  assert.equal(filters[0].filter.stringFilter.value, "google");
  assert.equal(filters[1].filter.fieldName, "sessionMedium");
  assert.equal(filters[1].filter.stringFilter.value, "cpc");
});
