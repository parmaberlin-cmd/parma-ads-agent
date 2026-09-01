const test = require('node:test');
const assert = require('node:assert/strict');
const { selectNextAutonomousAction } = require('../next-action-engine');
const now = new Date('2026-09-01T12:00:00Z');
const task = (patch = {}) => ({ id: 'WORK-1', status: 'READY', autonomous: true, operation: 'test', permission_class: 'GREEN', priority: 'P1', blocker_type: 'software', ...patch });
const select = items => selectNextAutonomousAction(items, { now });
for (const status of ['DONE', 'DONE_TO_ACCESS_BOUNDARY', 'DONE_TO_DEPLOY_BOUNDARY', 'DONE_TO_WRITE_BOUNDARY', 'IN_PROGRESS', 'BLOCKED_EXTERNAL', 'BLOCKED_PERMISSION', 'CANCELLED', 'SUPERSEDED', 'UNKNOWN', undefined]) {
  test(`does not reopen or steal ${status} tasks`, () => assert.equal(select([task({ status })]).selected, null));
}
for (const operation of ['deploy', 'publish', 'activate', 'increase_budget', 'change_tracking', 'change_credentials', undefined]) {
  test(`operation ${operation} is not implied by blanket autonomy`, () => assert.equal(select([task({ operation })]).selected, null));
}
for (const patch of [{ autonomous: 'true' }, { autonomous: undefined }, { permission_class: 'RED' }, { priority: 'P9' }, { blocked_by: 'access' }, { depends_on: ['MISSING'] }, { not_before: '2026-09-02T00:00:00Z' }, { not_before: 'invalid' }]) {
  test(`incomplete prerequisite is rejected: ${JSON.stringify(patch)}`, () => assert.equal(select([task(patch)]).selected, null));
}
test('dependencies must be DONE; reaching a boundary is not completing the dependency', () => {
  assert.equal(select([task({ depends_on: ['DEP'] }), task({ id: 'DEP', status: 'DONE_TO_ACCESS_BOUNDARY' })]).selected, null);
  assert.equal(select([task({ depends_on: ['DEP'] }), task({ id: 'DEP', status: 'DONE' })]).selected.id, 'WORK-1');
});
test('cycles and duplicate IDs cannot cause looping or ambiguity', () => {
  assert.equal(select([task(), task()]).selected, null);
  assert.equal(select([task({ depends_on: ['WORK-2'] }), task({ id: 'WORK-2', depends_on: ['WORK-1'] })]).selected, null);
});
test('unchanged failed attempt is not retried; new evidence enables read-only reevaluation', () => {
  const last_attempt = { result: 'failed', evidence_revision: 'v1' };
  assert.equal(select([task({ last_attempt, evidence_revision: 'v1' })]).selected, null);
  assert.equal(select([task({ last_attempt, evidence_revision: 'v2' })]).selected.id, 'WORK-1');
});
test('a bounded due retry applies only to an explicitly retryable read', () => {
  const last_attempt = { result: 'failed', retryable: true, retry_after: '2026-09-01T11:00:00Z', attempt_count: 1, max_attempts: 2 };
  assert.equal(select([task({ last_attempt })]).selected, null);
  assert.equal(select([task({ operation: 'read', last_attempt })]).selected.id, 'WORK-1');
  assert.equal(select([task({ operation: 'read', last_attempt: { ...last_attempt, attempt_count: 2 } })]).selected, null);
  assert.equal(select([task({ operation: 'read', last_attempt: { ...last_attempt, error_category: 'permission' } })]).selected, null);
});
test('empty and fully completed queues do not unnecessarily ask the user to proceed', () => {
  for (const items of [[], [task({ status: 'DONE' })]]) {
    const r = select(items); assert.equal(r.status, 'queue_complete'); assert.equal(r.stopped_for_user, false);
  }
});
test('unrelated work proceeds despite external gates and prioritization is deterministic', () => {
  const r = select([task({ id: 'EXT', status: 'BLOCKED_EXTERNAL', priority: 'P0' }), task({ id: 'WORK-B' }), task({ id: 'WORK-A' })]);
  assert.equal(r.selected.id, 'WORK-A'); assert.equal(r.stopped_for_user, false);
  assert.equal(r.execution_authorized, false); assert.equal(r.writes_allowed, false);
});
