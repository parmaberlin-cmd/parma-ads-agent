'use strict';

const { PersonalOsHandoffOutbox } = require('./personal-os-handoff-outbox');
const { assertPublicPayloadSafe } = require('./public-output-safety');

const SAFE_ERRORS = new Set([
  'handoff_outbox_directory_unavailable',
  'handoff_outbox_directory_invalid',
  'handoff_signer_identity_invalid',
  'handoff_signing_key_unavailable',
  'handoff_signing_key_invalid',
  'handoff_outbox_integrity_failed',
]);

function installPersonalOsHandoffRoute({ app, requireApiKey, env = process.env, now, nonce }) {
  app.get('/control/personal-os/handoffs', requireApiKey, (req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    try {
      const outbox = PersonalOsHandoffOutbox.fromEnv(env, { now, nonce });
      if (!outbox) {
        return res.status(503).json({
          success: false,
          status: 'BLOCKED',
          blocker: 'personal_os_handoff_outbox_disabled',
          provider_writes: 0,
          spend_changed: false,
          published: false,
        });
      }
      const rawLimit = req.query?.limit;
      const limit = rawLimit === undefined ? 20 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          status: 'REJECTED',
          reason: 'limit_must_be_integer_1_to_100',
          provider_writes: 0,
        });
      }
      const handoffs = outbox.listSigned(limit);
      const payload = {
        success: true,
        status: 'READ_ONLY',
        count: handoffs.length,
        handoffs,
        authority_granted: false,
        provider_writes: 0,
        spend_changed: false,
        published: false,
      };
      assertPublicPayloadSafe(payload);
      return res.status(200).json(payload);
    } catch (error) {
      const blocker = SAFE_ERRORS.has(error?.message)
        ? error.message
        : 'personal_os_handoff_outbox_failed_closed';
      return res.status(503).json({
        success: false,
        status: 'BLOCKED',
        blocker,
        provider_writes: 0,
        spend_changed: false,
        published: false,
      });
    }
  });
}

module.exports = { installPersonalOsHandoffRoute };
