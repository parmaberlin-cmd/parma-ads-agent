const legacy = require('./meta-paused-draft');

function installLegacyMetaWriteGuard() {
  const original = legacy.createPausedReservationDraft;
  if (original?.__legacyMetaWriteGuarded === true) return { original, guarded: original };
  const guarded = async function guardedLegacyCreatePausedReservationDraft() {
    const error = new Error('legacy_meta_direct_write_disabled_use_safe_orchestrator');
    error.code = 'LEGACY_META_WRITE_DISABLED';
    throw error;
  };
  guarded.__legacyMetaWriteGuarded = true;
  legacy.createPausedReservationDraft = guarded;
  return { original, guarded };
}

module.exports = { installLegacyMetaWriteGuard };
