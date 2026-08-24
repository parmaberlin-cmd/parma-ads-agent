const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('live Meta issue path requests all delivery levels and remains GET-only', () => {
  const source = fs.readFileSync('live-shadow-data.js', 'utf8');
  const meta = source.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
  const pagination = source.split('async function collectMetaPages')[1].split('async function collectMetaShadowData')[0];
  assert.match(meta, /campaigns[^\n]+issues_info/);
  assert.match(meta, /adsets[^\n]+issues_info/);
  assert.match(meta, /ads[^\n]+issues_info/);
  assert.match(meta, /buildMetaIssueReport/);
  assert.match(meta, /collectMetaPages/);
  assert.match(pagination, /client\.get/);
  assert.doesNotMatch(`${pagination}\n${meta}`, /client\.(post|put|patch|delete)/);
});