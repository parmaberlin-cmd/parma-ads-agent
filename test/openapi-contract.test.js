const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const openapi = fs.readFileSync(path.join(root, "openapi.yaml"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "bootstrap.js"), "utf8");
const safeCreate = fs.readFileSync(path.join(root, "meta-safe-create-route.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("OpenAPI version matches package version", () => {
  const match = openapi.match(/\n\s*version:\s*([^\s]+)\s*\n/);
  assert.ok(match, "OpenAPI info.version is missing");
  assert.equal(match[1], pkg.version);
});

test("Google campaign metric routes are declared in OpenAPI and implemented by the server", () => {
  const contracts = [
    {
      openapiPath: "/tools/google/campaign/{id}/metrics:",
      operationId: "operationId: getGoogleCampaignMetrics",
      expressPath: '"/tools/google/campaign/:id/metrics"',
    },
    {
      openapiPath: "/tools/campaign/{id}/metrics:",
      operationId: "operationId: getCampaignMetrics",
      expressPath: '"/tools/campaign/:id/metrics"',
    },
  ];
  for (const contract of contracts) {
    assert.match(openapi, new RegExp(contract.openapiPath.replace(/[{}]/g, "\\$&")));
    assert.ok(openapi.includes(contract.operationId), `${contract.operationId} missing`);
    assert.ok(server.includes(contract.expressPath), `${contract.expressPath} missing`);
  }
  assert.ok(server.includes("handleGoogleCampaignMetrics"), "shared Google campaign metric handler is missing");
});

test("Meta campaign metrics remain on a distinct namespace", () => {
  assert.ok(openapi.includes("/tools/meta/campaign/{id}/metrics:"));
  assert.ok(openapi.includes("operationId: getMetaCampaignMetrics"));
  assert.ok(server.includes('"/tools/meta/campaign/:id/metrics"'));
});

test("protected shadow refresh is declared in OpenAPI and wired through bootstrap", () => {
  assert.ok(openapi.includes("/tools/agent/shadow/refresh:"));
  assert.ok(openapi.includes("operationId: refreshLiveShadowAgentReport"));
  assert.ok(openapi.includes("- ApiKeyAuth: []"));
  assert.ok(bootstrap.includes('app.post("/tools/agent/shadow/refresh"'));
  assert.ok(bootstrap.includes("if (!authorized(req))"));
  assert.ok(bootstrap.includes("triggerShadowReport().catch(() => {})"));
  assert.ok(bootstrap.includes("collectFullLiveShadowInput"));
  assert.ok(bootstrap.includes('writes_allowed: false'));
});

test("sanitized runtime health endpoints are documented", () => {
  assert.ok(openapi.includes("/health/agent-shadow-summary:"));
  assert.ok(openapi.includes("operationId: getSanitizedShadowHealth"));
  assert.ok(openapi.includes("/health/meta-real-preflight-summary:"));
  assert.ok(openapi.includes("operationId: getSanitizedMetaPreflightHealth"));
  assert.ok(bootstrap.includes('/health/agent-shadow-summary'));
});

test("Meta paused create contract uses canonical approval_token and fail-closed responses", () => {
  assert.ok(openapi.includes("required: [starts_at, approval_token]"));
  assert.ok(openapi.includes("approval_token:"));
  assert.ok(openapi.includes('"423":'));
  assert.ok(safeCreate.includes("body.approval_token"));
  assert.ok(safeCreate.includes("conflicting_approval_tokens"));
  assert.ok(safeCreate.includes("approvalToken: approval.token"));
});

test("OpenAPI is served by the application", () => {
  assert.ok(server.includes('app.get("/openapi.yaml"'));
  assert.ok(server.includes('res.sendFile(path.join(__dirname, "openapi.yaml"))'));
});