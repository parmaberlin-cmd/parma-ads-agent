const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFinalReadinessAudit, assertAuditSafe } = require("../final-readiness-audit");

function healthySummary() {
  return {
    writes_allowed: false,
    source_health: { google: true, ga4: true, meta: true },
    tracking: { reservation_start: { configured: true, observed: false } },
    data_quality: { integrity_ok: true },
    history: { total_runs: 30, storage: { healthy: true, durable: true } },
    promotion: {
      promotion_ready: false,
      blockers: ["readiness:conversion_integrity_untrusted"],
    },
  };
}

test("missing conversion evidence is time-based rather than unfinished software", () => {
  const audit = buildFinalReadinessAudit({
    summary: healthySummary(),
    metaPreflight: { read_only_ready: true, write_ready: false },
  });
  assert.equal(audit.software_complete, true);
  assert.ok(audit.blockers.time_based.some((item) => item.blocker === "conversion_integrity_evidence"));
  assert.equal(assertAuditSafe(audit), true);
});

test("unsafe public write state remains a software blocker", () => {
  const summary = healthySummary();
  summary.writes_allowed = true;
  const audit = buildFinalReadinessAudit({ summary, metaPreflight: { read_only_ready: true, write_ready: false } });
  assert.equal(audit.software_complete, false);
  assert.ok(audit.blockers.software.some((item) => item.blocker === "public_shadow_write_contract_invalid"));
});
