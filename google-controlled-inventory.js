'use strict';
// Read-only orchestration. fetchPage must be wired by trusted server code, never by a request body.
const { z } = require('zod');
const id = z.string().regex(/^\d{1,20}$/);
const row = z.object({
  campaign_id: id, budget_id: id,
  daily_budget_micros: z.number().int().positive().safe(),
  status: z.enum(['ENABLED', 'PAUSED']), shared_budget: z.boolean(),
}).strict();
const pageSchema = z.object({
  customer_id: id, currency: z.literal('EUR'), time_zone: z.string().min(1).max(80),
  campaigns: z.array(row).max(1000),
  next_page_token: z.string().min(1).max(4096).nullable(),
}).strict();
const MAX_PAGES = 100, MAX_ROWS = 10000, MAX_DURATION_MS = 60000;
const fail = code => { throw new Error(code); };
const codes = new Set(['invalid_inventory_input', 'inventory_timeout', 'invalid_inventory_page',
  'inventory_account_mismatch', 'inventory_metadata_changed', 'inventory_pagination_cycle',
  'inventory_limit_exceeded', 'inventory_duplicate_campaign', 'inventory_empty',
  'inventory_changed_during_collection', 'inventory_budget_inconsistent', 'inventory_read_failed']);

async function collectControlledInventory(input = {}) {
  const result = { mode: 'read_only_inventory', success: false, writes_allowed: false,
    spend_allowed: false, execution_allowed: false, snapshot: null, blockers: [] };
  const { customerId, fetchPage } = input && typeof input === 'object' ? input : {};
  if (!id.safeParse(customerId).success || typeof fetchPage !== 'function') {
    result.blockers.push('invalid_inventory_input'); return result;
  }
  const started = Date.now();
  const controller = new AbortController();
  async function scan() {
    const campaigns = [], ids = new Set(), tokens = new Set(), budgets = new Map();
    let token = null, metadata = null;
    for (let count = 0; count < MAX_PAGES; count++) {
      const remaining = MAX_DURATION_MS - (Date.now() - started);
      if (remaining <= 0) fail('inventory_timeout');
      let timer, raw;
      try {
        raw = await Promise.race([
          Promise.resolve().then(() => fetchPage({ customerId, pageToken: token, signal: controller.signal })),
          new Promise((_, reject) => { timer = setTimeout(() => {
            controller.abort(); reject(new Error('inventory_timeout'));
          }, remaining); }),
        ]);
      } catch (error) {
        if (controller.signal.aborted) fail('inventory_timeout');
        fail('inventory_read_failed');
      } finally { clearTimeout(timer); }
      const parsed = pageSchema.safeParse(raw);
      if (!parsed.success) fail('invalid_inventory_page');
      const page = parsed.data;
      if (page.customer_id !== customerId) fail('inventory_account_mismatch');
      try { new Intl.DateTimeFormat('en', { timeZone: page.time_zone }); }
      catch { fail('invalid_inventory_page'); }
      const currentMetadata = JSON.stringify([page.customer_id, page.currency, page.time_zone]);
      if (metadata !== null && metadata !== currentMetadata) fail('inventory_metadata_changed');
      metadata = currentMetadata;
      for (const campaign of page.campaigns) {
        if (ids.has(campaign.campaign_id)) fail('inventory_duplicate_campaign');
        ids.add(campaign.campaign_id);
        const existing = budgets.get(campaign.budget_id);
        if (existing && (existing.daily_budget_micros !== campaign.daily_budget_micros ||
            !existing.shared_budget || !campaign.shared_budget)) fail('inventory_budget_inconsistent');
        budgets.set(campaign.budget_id, campaign);
        campaigns.push(campaign);
        if (campaigns.length > MAX_ROWS) fail('inventory_limit_exceeded');
      }
      token = page.next_page_token;
      if (token === null) {
        if (!campaigns.length) fail('inventory_empty');
        campaigns.sort((a, b) => a.campaign_id.localeCompare(b.campaign_id));
        return { metadata, time_zone: page.time_zone, campaigns };
      }
      if (tokens.has(token)) fail('inventory_pagination_cycle');
      tokens.add(token);
    }
    fail('inventory_limit_exceeded');
  }
  try {
    const first = await scan(), second = await scan();
    if (JSON.stringify(first) !== JSON.stringify(second)) fail('inventory_changed_during_collection');
    if (Date.now() - started >= MAX_DURATION_MS) fail('inventory_timeout');
    result.snapshot = { customer_id: customerId, currency: 'EUR',
      captured_at: new Date(started).toISOString(), account_inventory_complete: true,
      campaigns: first.campaigns.map(c => ({ ...c, conversion_integrity_trusted: false })) };
    result.time_zone = first.time_zone;
    result.success = true;
    result.consistency = 'two_matching_reads_not_atomic';
  } catch (error) {
    result.blockers.push(codes.has(error.message) ? error.message : 'inventory_read_failed');
  } finally { controller.abort(); }
  return result;
}
module.exports = { collectControlledInventory };
