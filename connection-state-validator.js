'use strict';

const FORBIDDEN_KEY_PATTERNS = [
  /(^|_)(access|refresh)?_?token$/i,
  /(^|_)api_?key$/i,
  /(^|_)client_?secret$/i,
  /(^|_)password$/i,
  /(^|_)passkey$/i,
  /(^|_)private_?key$/i,
  /(^|_)secret$/i,
];

function findForbiddenKeys(value, path = '$', hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (!value || typeof value !== 'object') return hits;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) hits.push(next);
    findForbiddenKeys(child, next, hits);
  }
  return hits;
}

function assertSecretFreeSharedState(value) {
  const hits = findForbiddenKeys(value);
  if (hits.length) {
    const error = new Error('shared_state_contains_forbidden_secret_shaped_keys');
    error.code = 'FORBIDDEN_SECRET_SHAPED_KEYS';
    error.paths = hits;
    throw error;
  }
  return true;
}

module.exports = { findForbiddenKeys, assertSecretFreeSharedState };
