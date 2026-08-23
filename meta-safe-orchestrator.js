const { runMetaPausedPreflight } = require('./meta-preflight');
const { resumePausedReservationDraft } = require('./meta-draft-recovery');
const { AUTONOMY_LEVELS, authorizeExecution, createExecutionJournal, stableKey } = require('./safe-execution');

async function executePausedMetaDraftSafely({ transport, adAccountId, draft, approvalToken, existing = {}, killSwitch = false, autonomyLevel = AUTONOMY_LEVELS.SAFE_WRITE, journal = createExecutionJournal() } = {}) {
  const preflight = runMetaPausedPreflight({ draft, knownPartial: existing });
  const gatePreflight = { ok: preflight.ready };
  const authorization = authorizeExecution({ level: autonomyLevel, preflight: gatePreflight, killSwitch });
  const operationKey = stableKey({ adAccountId, draft, existing, mode: 'paused_draft_only' });

  journal.record({ event: 'meta_safe_write_requested', operation_key: operationKey, preflight_ready: preflight.ready, authorization: authorization.reason });

  if (!authorization.allowed) {
    journal.record({ event: 'meta_safe_write_blocked', operation_key: operationKey, reason: authorization.reason, blockers: preflight.level_2_payload?.blockers || [] });
    return { success: false, blocked: true, reason: authorization.reason, operation_key: operationKey, preflight, journal: journal.snapshot(), activates_spend: false };
  }

  const result = await resumePausedReservationDraft({ transport, adAccountId, draft, approvalToken, existing });
  journal.record({ event: 'meta_safe_write_completed', operation_key: operationKey, created: result.created, reused: result.reused, activates_spend: false });

  return { ...result, operation_key: operationKey, preflight, journal: journal.snapshot(), activates_spend: false };
}

module.exports = { executePausedMetaDraftSafely };
