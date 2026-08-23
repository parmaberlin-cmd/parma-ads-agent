const test = require("node:test");
const assert = require("node:assert/strict");
const { assessAgentReadiness, assertReadinessIsInformational } = require("../agent-readiness");

function strongInput() {
  return {
    dataQuality: { sources_fresh: true, google_ready: true, meta_ready: true, ga4_ready: true },
    conversionIntegrity: { trusted: true },
    safety: {
      zero_write_default: true,
      kill_switch_enforced: true,
      idempotency_enforced: true,
      human_approval_for_spend: true,
      safe_orchestrator_mandatory: true,
    },
    reliability: {
      last_known_good: true,
      concurrent_refresh_guard: true,
      fail_closed: true,
      regression_suite_green: true,
      post_action_verification_ready: true,
    },
    intelligence: {
      daily_manager: true,
      anomaly_detection: true,
      search_term_analysis: true,
      funnel_diagnostics: true,
      decision_journal: true,
    },
    operations: { google_live: true, ga4_live: true, meta_live: true, runtime_health: true },
  };
}

test("fully evidenced system reaches 100 without authorizing execution", () => {
  const readiness = assessAgentReadiness(strongInput());
  assert.equal(readiness.score, 100);
  assert.equal(readiness.stage, "supervised_candidate");
  assert.equal(readiness.supervised_write_candidate, true);
  assert.equal(readiness.execution_authorized, false);
  assert.equal(readiness.writes_allowed, false);
  assert.equal(assertReadinessIsInformational(readiness), true);
});

test("missing source freshness blocks promotion even with strong safety", () => {
  const input = strongInput();
  input.dataQuality.sources_fresh = false;
  const readiness = assessAgentReadiness(input);
  assert.ok(readiness.hard_blockers.includes("source_freshness_unverified"));
  assert.equal(readiness.supervised_write_candidate, false);
  assert.equal(readiness.execution_authorized, false);
});

test("untrusted conversions block supervised promotion", () => {
  const input = strongInput();
  input.conversionIntegrity.trusted = false;
  const readiness = assessAgentReadiness(input);
  assert.ok(readiness.hard_blockers.includes("conversion_integrity_untrusted"));
  assert.equal(readiness.supervised_write_candidate, false);
});

test("missing kill switch is a hard safety blocker", () => {
  const input = strongInput();
  input.safety.kill_switch_enforced = false;
  const readiness = assessAgentReadiness(input);
  assert.ok(readiness.hard_blockers.includes("kill_switch_not_enforced"));
  assert.equal(readiness.supervised_write_candidate, false);
});

test("weak incomplete system remains in foundation", () => {
  const readiness = assessAgentReadiness({
    safety: { zero_write_default: true, fail_closed: true },
    reliability: { fail_closed: true },
  });
  assert.ok(readiness.score < 60);
  assert.equal(readiness.stage, "foundation");
  assert.equal(readiness.shadow_operation_allowed, false);
  assert.equal(readiness.execution_authorized, false);
});
