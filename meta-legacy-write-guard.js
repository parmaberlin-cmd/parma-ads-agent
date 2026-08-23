const legacy = require('./meta-paused-draft');

function installLegacyMetaWriteGuard() {
  const original = legacy.createPausedReservationDraft;
  legacy.createPausedReservationDraft = async function guardedLegacyCreatePausedReservationDraft() {
    const error = new Error('legacy_meta_direct_write_disabled_use_safe_orchestrator');
    error.code = 'LEGACY_META_WRITE_DISABLED';
    throw error;
  };
  return { original, guarded: legacy.createPausedReservationDraft };
}

module.exports = { installLegacyMetaWriteGuard };
