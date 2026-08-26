const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

for (const name of ["test.yml", "meta-draft-preflight.yml", "meta-draft-inventory.yml", "meta-issue-report.yml", "final-readiness-audit.yml"]) {
  test(`${name} installs from the committed lockfile without lifecycle scripts`, () => {
    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8");
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.doesNotMatch(workflow, /npm install\b/);
  });
}
