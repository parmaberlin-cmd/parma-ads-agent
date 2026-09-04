const test = require('node:test');
const assert = require('node:assert/strict');
const { localIntentScore, customerIntentScore, queryValueScore } = require('../intent-value-scoring');

test('near-me intent is protected as strong local prior without claiming outcome', () => {
  const result = localIntentScore({ intent: 'near_me' });
  assert.ok(result.score >= 70);
  assert.equal(result.observed_outcome, false);
});

test('brand intent receives stronger customer prior than generic pizza', () => {
  assert.ok(customerIntentScore({ intent:'brand' }).score > customerIntentScore({ intent:'pizza_generic' }).score);
});

test('query value never authorizes advertising mutation', () => {
  const result = queryValueScore({ intent:'local_kreuzberg' });
  assert.equal(result.business_value_verified, false);
  assert.equal(result.optimization_permission, false);
});
