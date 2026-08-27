const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("Google campaign intelligence route is registered before the 404 fallback", () => {
  const registration = server.indexOf("installGoogleCampaignIntelligenceRoute({");
  const fallback = server.indexOf("app.use((req, res) => {");

  assert.notEqual(registration, -1);
  assert.notEqual(fallback, -1);
  assert.ok(registration < fallback);
});

test("Google campaign intelligence route reuses the protected read-only dependencies", () => {
  assert.match(
    server,
    /installGoogleCampaignIntelligenceRoute\(\{[\s\S]*?app,[\s\S]*?requireApiKey,[\s\S]*?checkGoogleConfig,[\s\S]*?getGoogleCustomer,[\s\S]*?cleanGoogleError,[\s\S]*?\}\);/
  );
});

test("Google campaign intelligence response includes the complete reader diagnostics", () => {
  const route = fs.readFileSync(path.join(__dirname, "..", "google-campaign-intelligence-route.js"), "utf8");
  for (const field of ["overview", "ad_groups", "search_terms", "keywords", "devices", "hours", "geography", "rsa_ads", "rsa_analysis"]) {
    assert.ok(route.includes(field), `${field} missing from intelligence route`);
  }
  assert.ok(route.includes("writes_allowed:false"));
  assert.ok(route.includes("execution_allowed:false"));
  assert.ok(route.includes("spend_allowed:false"));
});
