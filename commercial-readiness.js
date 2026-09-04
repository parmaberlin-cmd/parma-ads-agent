function readiness(input = {}) {
  const software = input.software_tests_green === true && input.readers_implemented === true;
  const data = input.measurement_verified === true && input.data_mature === true;
  const external = input.required_external_access_available === true;
  const permission = input.required_permission_granted === true;
  return {
    software: software ? 'ready' : 'not_ready',
    data: data ? 'ready' : 'not_ready',
    external_access: external ? 'ready' : 'blocked_external',
    permission: permission ? 'ready' : 'blocked_permission',
    commercial_optimization: software && data ? 'evidence_ready' : 'fail_closed',
    execution_ready: software && data && external && permission,
    rule:'A missing external access or permission gate must not downgrade verified software capability; it only blocks the dependent execution path.'
  };
}
module.exports = { readiness };
