const test = require('node:test');
const assert = require('node:assert/strict');
const legacy = require('../meta-paused-draft');
const { installLegacyMetaWriteGuard } = require('../meta-legacy-write-guard');

test('legacy direct Meta draft creation is blocked before transport writes', async () => {
  let posts = 0;
  installLegacyMetaWriteGuard();
  await assert.rejects(
    legacy.createPausedReservationDraft({ transport: { post: async () => { posts += 1; } } }),
    (error) => error?.code === 'LEGACY_META_WRITE_DISABLED'
  );
  assert.equal(posts, 0);
});
