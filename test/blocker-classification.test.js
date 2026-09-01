const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyBlocker, summarizeBlockers } = require('../blocker-classification');

test('external access never masquerades as software blocker', () => {
  assert.equal(classifyBlocker({code:'EXT-WIX',reason:'correct Wix account access required'}), 'external_access');
  assert.equal(classifyBlocker({reason:'Meta UI account access required'}), 'external_access');
});

test('permission, data and software blockers remain distinct', () => {
  assert.equal(classifyBlocker({reason:'explicit merge/deploy approval required'}), 'permission_gate');
  assert.equal(classifyBlocker({reason:'attribution maturity insufficient'}), 'data_or_maturity');
  assert.equal(classifyBlocker({reason:'test failed due to regression'}), 'software');
});

test('summarizes blocker classes without inventing resolution', () => {
  const out = summarizeBlockers([
    {reason:'correct Wix account access required'},
    {reason:'explicit spend approval required'},
    {reason:'timezone alignment unknown'},
    {reason:'syntax regression'},
  ]);
  assert.deepEqual(out.summary, {software:1,data_or_maturity:1,external_access:1,permission_gate:1,unknown:0});
});
