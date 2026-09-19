const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const runner = path.join(__dirname, "../scripts/check-direct-orders.js");
const fixture = path.join(__dirname, "../docs/diagnostics/direct-order-observation-2026-09-01.json");
const run = (...args) => spawnSync(process.execPath, [runner, ...args], { encoding: "utf8" });

test("offline runner reports observation without enabling writes", () => {
  const result = run(fixture);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.writes_allowed, false);
  assert.equal(output.spend_authorized, false);
  assert.equal(output.executable, false);
  assert.equal(output.measurement.status, "unverified");
});
test("runner does not reflect missing private paths", () => {
  const marker = "DO_NOT_EXPOSE_PRIVATE_PATH";
  const result = run(path.join(__dirname, marker));
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes(marker), false);
});
test("runner rejects malformed JSON without printing contents", () => {
  const result = run(__filename);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes("SyntaxError"), false);
});
test("runner rejects missing and surplus arguments", () => {
  assert.equal(run().status, 1);
  assert.equal(run(fixture, "extra").status, 1);
});
