const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/google-live-access.yml'), 'utf8');
const route = fs.readFileSync(path.join(root, 'google-campaign-intelligence-route.js'), 'utf8');
const version = Number(route.match(/reader_version\s*:\s*(\d+)/)[1]);
const predicate = workflow.match(/complete=\$\(jq -r '([^']+)' intelligence\.json/)[1];
const fields = ['overview', 'ad_groups', 'rsa_ads', 'rsa_analysis', 'conversion_actions'];
const gates = ['writes_allowed', 'execution_allowed', 'spend_allowed'];
const valid = Object.fromEntries([
  ['success', true], ['reader_version', version],
  ...fields.map(field => [field, []]), ...gates.map(gate => [gate, false]),
]);

function accepts(payload) {
  const result = spawnSync('jq', ['-r', predicate], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() === 'true';
}

test('live workflow accepts the current reader version and rejects stale or unknown versions', () => {
  assert.equal(accepts(valid), true);
  for (const reader_version of [3, version + 1, undefined]) {
    assert.equal(accepts({ ...valid, reader_version }), false);
  }
});

test('live workflow requires every structural field and explicit closed gates', () => {
  assert.equal(accepts({ ...valid, success: false }), false);
  for (const field of fields) {
    for (const value of [undefined, null, {}]) assert.equal(accepts({ ...valid, [field]: value }), false);
  }
  for (const gate of gates) {
    for (const value of [true, undefined, null, 'false']) assert.equal(accepts({ ...valid, [gate]: value }), false);
  }
});
