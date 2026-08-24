const fs = require('node:fs');
const { buildFinalReadinessAudit, assertAuditSafe } = require('../final-readiness-audit');
const { assertPublicPayloadSafe } = require('../public-output-safety');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

try {
  const summary = readJson(process.env.SHADOW_SUMMARY_FILE || 'shadow.json');
  const meta = readJson(process.env.META_PREFLIGHT_FILE || 'meta.json');
  const audit = buildFinalReadinessAudit({ summary, metaPreflight: meta });
  assertAuditSafe(audit);
  assertPublicPayloadSafe(audit);
  process.stdout.write(`${JSON.stringify(audit)}\n`);
  process.exitCode = audit.software_complete ? 0 : 1;
} catch {
  process.stderr.write(`${JSON.stringify({ success:false, mode:'independent_readiness_audit', error:'final_readiness_audit_failed', writes_allowed:false, execution_authorized:false, spend_authorized:false })}\n`);
  process.exitCode = 1;
}