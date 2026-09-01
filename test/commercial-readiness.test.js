const test = require('node:test');
const assert = require('node:assert/strict');
const { readiness } = require('../commercial-readiness');

test('external blocker does not erase software readiness', () => {
  const x = readiness({ software_tests_green:true, readers_implemented:true, measurement_verified:false, data_mature:true, required_external_access_available:false, required_permission_granted:false });
  assert.equal(x.software, 'ready');
  assert.equal(x.external_access, 'blocked_external');
  assert.equal(x.commercial_optimization, 'fail_closed');
});

test('execution requires all independent dimensions', () => {
  const x = readiness({ software_tests_green:true, readers_implemented:true, measurement_verified:true, data_mature:true, required_external_access_available:true, required_permission_granted:true });
  assert.equal(x.execution_ready, true);
});
