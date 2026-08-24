const FORBIDDEN_KEYS = new Set([
  'access_token','refresh_token','developer_token','client_secret','api_key','x_api_key','authorization','password','secret','token',
  'campaign_id','adset_id','ad_id','creative_id','page_id','instagram_user_id','source_instagram_media_id','customer_id','login_customer_id','ad_account_id',
]);

const CREDENTIAL_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i,
  /\bya29\.[A-Za-z0-9._-]{10,}/i,
  /\b1\/\/[A-Za-z0-9._-]{10,}/,
  /\bEAA[A-Za-z0-9]{12,}\b/,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
];

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/[-\s]/g, '_');
}

function scanString(value, path, findings) {
  for (const pattern of CREDENTIAL_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      findings.push(`${path}:credential_like_value`);
      break;
    }
  }
  if (/\b\d{10,}\b/.test(value)) findings.push(`${path}:id_like_numeric_value`);
}

function scanPublicPayload(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPublicPayload(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') scanString(value, path, findings);
    return findings;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (FORBIDDEN_KEYS.has(normalized)) findings.push(`${path}.${key}:forbidden_key`);
    scanPublicPayload(child, `${path}.${key}`, findings);
  }
  return findings;
}

function assertPublicPayloadSafe(payload) {
  const findings = scanPublicPayload(payload);
  if (findings.length) {
    const error = new Error('public payload safety contract violated');
    error.findings = findings.slice(0, 10);
    throw error;
  }
  return payload;
}

function safePublicJson(res, payload) {
  try {
    return res.json(assertPublicPayloadSafe(payload));
  } catch {
    return res.status(500).json({ success: false, status: 'blocked', error: 'public_output_safety_blocked', writes_allowed: false });
  }
}

module.exports = {
  FORBIDDEN_KEYS,
  CREDENTIAL_VALUE_PATTERNS,
  normalizeKey,
  scanString,
  scanPublicPayload,
  assertPublicPayloadSafe,
  safePublicJson,
};