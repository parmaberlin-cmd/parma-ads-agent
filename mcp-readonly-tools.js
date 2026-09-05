// Preparation only: not mounted by server.js. OAuth and MCP transport are separate gates.
const { CREDENTIAL_VALUE_PATTERNS } = require('./public-output-safety');

const DEFINITIONS = [
  ['parma_shadow_health', 'Read sanitized shadow health', {}],
  ['parma_google_test', 'Test the configured Google Ads reader without writes', {}],
  ['parma_campaign_intelligence', 'Read search terms, keywords, devices, hours and geography', {
    campaign_id: { type: 'string', pattern: '^[0-9]{1,20}$' },
    days: { type: 'integer', minimum: 0, maximum: 90, default: 30, description: '0 means today; 1 means yesterday; 2-90 are historical windows ending yesterday' },
  }],
];

function listTools() {
  return DEFINITIONS.map(([name, description, properties]) => ({
    name, description,
    inputSchema: {
      type: 'object', properties: structuredClone(properties), additionalProperties: false,
      ...(name === 'parma_campaign_intelligence' ? { required: ['campaign_id'] } : {}),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }));
}

function failure(code) {
  const data = { success: false, error: code, writes_allowed: false, spend_allowed: false };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

function target(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  if (name === 'parma_campaign_intelligence') {
    if (Object.keys(args).some(key => !['campaign_id', 'days'].includes(key))) return null;
    const days = args.days === undefined ? 30 : args.days;
    if (typeof args.campaign_id !== 'string' || !/^\d{1,20}$/.test(args.campaign_id)) return null;
    if (!Number.isInteger(days) || days < 0 || days > 90) return null;
    return { path: `/tools/google/campaign/${args.campaign_id}/intelligence`, query: { days } };
  }
  if (Object.keys(args).length) return null;
  if (name === 'parma_shadow_health') return { path: '/health/agent-shadow-summary', query: {} };
  if (name === 'parma_google_test') return { path: '/tools/google/test', query: {} };
  return null;
}

function assertSafeOutput(value, secrets, depth = 0) {
  if (depth > 40) throw new Error('output blocked');
  if (typeof value === 'string') {
    if (CREDENTIAL_VALUE_PATTERNS.some(pattern => pattern.test(value)) ||
        secrets.some(secret => value.includes(secret))) throw new Error('output blocked');
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (/^(accesstoken|refreshtoken|developertoken|clientsecret|apikey|xapikey|authorization|password|secret|token|cookie|setcookie|credentials)$/.test(normalized)) {
        throw new Error('output blocked');
      }
      assertSafeOutput(child, secrets, depth + 1);
    }
  }
}

function createReadOnlyTools({ authorize, read, knownSecrets = [] } = {}) {
  if (typeof authorize !== 'function' || typeof read !== 'function') {
    throw new TypeError('Verified authorization and GET-only reader adapters are required');
  }
  if (!Array.isArray(knownSecrets) || knownSecrets.some(s => typeof s !== 'string' || !s)) {
    throw new TypeError('Invalid secret redaction configuration');
  }
  const secrets = [...knownSecrets];
  return {
    listTools,
    async callTool(name, args = {}, authContext) {
      const destination = target(name, args);
      if (!destination) return failure('unsupported_tool_or_arguments');
      try {
        // Only an exact true from a trusted server-side verifier authorizes a read.
        if (await authorize(authContext, {
          scope: 'parma.read', campaignId: args.campaign_id || null, tool: name,
        }) !== true) return failure('unauthorized');
      } catch { return failure('unauthorized'); }
      let payload;
      try { payload = await read({ method: 'GET', ...destination }); }
      catch { return failure('upstream_read_failed'); }
      try {
        const serialized = JSON.stringify(payload);
        if (!serialized || Buffer.byteLength(serialized) > 2 * 1024 * 1024) return failure('upstream_output_blocked');
        const data = JSON.parse(serialized);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return failure('upstream_output_blocked');
        assertSafeOutput(data, secrets);
        // Do not forward arbitrary provider error messages or credential-bearing response envelopes.
        if (data.success === false) return failure('upstream_read_failed');
        const result = { data, writes_allowed: false, spend_allowed: false };
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch { return failure('upstream_output_blocked'); }
    },
  };
}

module.exports = { createReadOnlyTools, listTools };
