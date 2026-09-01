const test = require('node:test');
const assert = require('node:assert/strict');
const { batchHumanGates } = require('../human-gate-batching');

test('ordinary permission gates can be batched for convenience', () => {
  const x = batchHumanGates([{type:'publish',required:true},{type:'external_write',required:true}]);
  assert.equal(x.batchable.length, 2);
  assert.equal(x.prompt_count_target, 1);
});

test('spend and security gates remain independent', () => {
  const x = batchHumanGates([{type:'spend',required:true},{type:'security',required:true},{type:'publish',required:true}]);
  assert.equal(x.independent.length, 2);
  assert.equal(x.prompt_count_target, 3);
});
