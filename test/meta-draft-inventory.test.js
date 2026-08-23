const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Meta draft inventory is manual, GET-only and sanitized", () => {
  const script = fs.readFileSync("scripts/run-meta-draft-inventory.js", "utf8");
  const workflow = fs.readFileSync(".github/workflows/meta-draft-inventory.yml", "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:|pull_request:|schedule:|repository_dispatch:/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /node scripts\/run-meta-draft-inventory\.js/);

  assert.match(script, /method:\s*"GET"/);
  assert.match(script, /assertPublicPayloadSafe/);
  assert.match(script, /writes_allowed:\s*false/);
  assert.doesNotMatch(script, /\.post\(|\.delete\(|createPaused|write_gate|approval_token/i);
  assert.doesNotMatch(script, /targeting|creative\{/i);
  assert.doesNotMatch(script, /campaign_id\s*:/i);
  assert.doesNotMatch(script, /adset_id\s*:/i);
  assert.doesNotMatch(script, /ad_id\s*:/i);
});
