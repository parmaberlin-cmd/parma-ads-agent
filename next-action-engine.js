const { timestamp } = require('./report-memory');
const TYPE_WEIGHT = { software: 4, data_maturity: 3 };
const PRIORITY_WEIGHT = { P0: 30, P1: 20, P2: 10, P3: 0 };
const READONLY_OPERATIONS = new Set(['read', 'analyze', 'test', 'document', 'propose']);
const COMPLETE = new Set(['DONE', 'CANCELLED', 'SUPERSEDED']);

function selectNextAutonomousAction(items = [], { now = new Date() } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const counts = new Map();
  for (const item of rows) if (typeof item?.id === 'string') counts.set(item.id, (counts.get(item.id) || 0) + 1);
  const byId = new Map(rows.filter(x => x && typeof x.id === 'string').map(x => [x.id, x]));
  const at = now.getTime();
  const excluded = [], candidates = [];
  function block(item, reason) { excluded.push({ id: typeof item?.id === 'string' && /^[A-Z][A-Z0-9_-]{0,63}$/.test(item.id) ? item.id : null, reason }); }
  for (const item of rows) {
    if (!item || typeof item.id !== 'string' || !/^[A-Z][A-Z0-9_-]{0,63}$/.test(item.id)) { block(item, 'invalid_item'); continue; }
    if (counts.get(item.id) !== 1) { block(item, 'duplicate_id'); continue; }
    if (COMPLETE.has(item.status)) { block(item, 'completed'); continue; }
    if (/^DONE_TO_/.test(item.status || '')) { block(item, 'completed_to_boundary'); continue; }
    if (['BLOCKED_EXTERNAL', 'BLOCKED_PERMISSION'].includes(item.status) || ['external_access', 'permission_gate'].includes(item.blocker_type)) { block(item, 'external_or_permission_gate'); continue; }
    if (!['READY', 'TODO'].includes(item.status)) { block(item, item.status === 'IN_PROGRESS' ? 'already_owned' : 'status_not_ready'); continue; }
    if (item.autonomous !== true || !READONLY_OPERATIONS.has(item.operation) || item.permission_class !== 'GREEN') { block(item, 'readonly_delegation_unverified'); continue; }
    if (!Object.hasOwn(PRIORITY_WEIGHT, item.priority)) { block(item, 'priority_invalid'); continue; }
    if (item.blocked_by) { block(item, 'unresolved_blocker'); continue; }
    if (item.depends_on !== undefined && (!Array.isArray(item.depends_on) || item.depends_on.some(id => counts.get(id) !== 1 || byId.get(id)?.status !== 'DONE'))) { block(item, 'dependency_not_completed'); continue; }
    if (item.not_before !== undefined && (timestamp(item.not_before) === null || !Number.isFinite(at) || timestamp(item.not_before) > at)) { block(item, 'not_due'); continue; }
    const attempt = item.last_attempt;
    if (attempt && ['failed', 'blocked'].includes(attempt.result)) {
      if (['permission', 'authentication'].includes(attempt.error_category)) { block(item, 'external_or_permission_gate'); continue; }
      const newEvidence = typeof item.evidence_revision === 'string' && item.evidence_revision !== '' && typeof attempt.evidence_revision === 'string' && item.evidence_revision !== attempt.evidence_revision;
      const bounded = Number.isInteger(attempt.attempt_count) && attempt.attempt_count >= 1 && Number.isInteger(attempt.max_attempts) && attempt.max_attempts <= 3 && attempt.attempt_count < attempt.max_attempts;
      const retryDue = item.operation === 'read' && bounded && attempt.retryable === true && timestamp(attempt.retry_after) !== null && timestamp(attempt.retry_after) <= at;
      if (!newEvidence && !retryDue) { block(item, 'unchanged_failed_attempt'); continue; }
    }
    candidates.push({ item, score: PRIORITY_WEIGHT[item.priority] + (TYPE_WEIGHT[item.blocker_type] ?? 2) });
  }
  candidates.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const selected = candidates[0]?.item || null;
  const activeExclusions = excluded.filter(x => x.reason !== 'completed');
  return {
    selected, eligible_count: candidates.length,
    status: selected ? 'work_available' : activeExclusions.length ? 'waiting_for_prerequisite' : 'queue_complete',
    stopped_for_user: !selected && activeExclusions.some(x => ['external_or_permission_gate', 'completed_to_boundary'].includes(x.reason)),
    excluded,
    rule: 'Select delegated read-only work; never execute, reopen completed work, claim another owner, or repeat an unchanged failed attempt.',
    writes_allowed: false, execution_authorized: false,
  };
}

module.exports = { selectNextAutonomousAction, READONLY_OPERATIONS };
