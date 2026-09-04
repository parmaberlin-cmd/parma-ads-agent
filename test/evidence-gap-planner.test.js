const test = require('node:test');
const assert = require('node:assert/strict');
const { planEvidenceGaps } = require('../evidence-gap-planner');

test('external ground truth does not stop unrelated green evidence work', () => {
  const out = planEvidenceGaps({ reservation:{ semantic_identity:true } });
  assert.ok(out.autonomous_gaps.length > 0);
  assert.ok(out.external_gaps.some((g) => g.requirement === 'reservation_ground_truth'));
  assert.equal(out.human_gate_needed_now, false);
});

test('human gate is deferred until only external evidence remains', () => {
  const out = planEvidenceGaps({
    reservation:{ semantic_identity:true, exact_date_window:true, timezone:true, date_basis:true, counting_dedupe:true, maturity:true, cancellation_semantics:true },
    direct_order:{ public_path:true, mobile_continuity:true, completion_semantics:true, counting_dedupe:true, attribution:true, refund_semantics:true, economics:true },
    walk_in:{ local_action_observation:true, date_window:true, economics:true },
  });
  assert.equal(out.autonomous_gaps.length, 0);
  assert.equal(out.human_gate_needed_now, true);
  assert.equal(out.writes_allowed, false);
});
