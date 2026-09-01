const { createHash } = require('node:crypto');

// Non-secret account/property identifier -> internal comparison key, never a credential.
function reportingScope(source, identifier, definition) {
  if (!['google', 'ga4'].includes(source) || typeof identifier !== 'string' || !/^\d+$/.test(identifier) || !definition) return null;
  return `scope:${createHash('sha256').update(JSON.stringify([source, identifier, definition])).digest('hex')}`;
}
module.exports = { reportingScope };
