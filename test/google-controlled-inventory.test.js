'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectControlledInventory: collect } = require('../google-controlled-inventory');
const { prepareControlledProposal: prepare } = require('../google-controlled-proposals');
const campaign = (id = '1') => ({ campaign_id: id, budget_id: `${id}0`,
  daily_budget_micros: 3500000, status: 'ENABLED', shared_budget: false });
const page = (rows = [campaign()], token = null) => ({ customer_id: '123', currency: 'EUR',
  time_zone: 'Europe/Berlin', campaigns: rows, next_page_token: token });
async function run(p) { return collect({ customerId: '123', fetchPage: async () => structuredClone(p) }); }
test('two paginated reads include paused campaigns, never infer trusted conversions', async () => {
  const calls = [], paused = { ...campaign('2'), status: 'PAUSED' };
  const r = await collect({ customerId: '123', fetchPage: async ({pageToken, signal}) => {
    assert.equal(signal.aborted, false); calls.push(pageToken);
    return pageToken === null ? page([campaign()], 'next') : page([paused]);
  } });
  assert.deepEqual(calls, [null, 'next', null, 'next']);
  assert.equal(r.success, true); assert.equal(r.snapshot.campaigns.length, 2);
  assert.equal(r.snapshot.campaigns[1].status, 'PAUSED');
  assert.ok(r.snapshot.campaigns.every(c => c.conversion_integrity_trusted === false));
  assert.equal(r.execution_allowed, false);
  const policy = { customer_id: '123', campaign_ids: ['1'], allowed_actions: ['pause', 'set_daily_budget'],
    expires_at: new Date(Date.now()+60000).toISOString(), max_account_daily_budget_micros: 9000000,
    max_campaign_daily_budget_micros: 5000000, max_budget_change_percent: 20, max_snapshot_age_seconds: 300 };
  const args = { policy, snapshot: r.snapshot, action: {type:'pause',campaign_id:'1'} };
  assert.equal(prepare(args).policy_fit, true);
  args.action = {type:'set_daily_budget',campaign_id:'1',amount_micros:4000000};
  assert.ok(prepare(args).blockers.includes('conversion_integrity_untrusted'));
});
for (const [name, change, code] of [
  ['foreign account', p => p.customer_id = '456', 'inventory_account_mismatch'],
  ['missing pagination', p => delete p.next_page_token, 'invalid_inventory_page'],
  ['currency', p => p.currency = 'USD', 'invalid_inventory_page'],
  ['timezone', p => p.time_zone = 'not/a/zone', 'invalid_inventory_page'],
  ['unsafe money', p => p.campaigns[0].daily_budget_micros = Number.MAX_SAFE_INTEGER+1, 'invalid_inventory_page'],
  ['unknown status', p => p.campaigns[0].status = 'UNKNOWN', 'invalid_inventory_page'],
  ['empty inventory', p => p.campaigns = [], 'inventory_empty'],
  ['duplicate', p => p.campaigns.push(campaign()), 'inventory_duplicate_campaign'],
  ['injected trust', p => p.campaigns[0].conversion_integrity_trusted = true, 'invalid_inventory_page'],
  ['shared mismatch', p => p.campaigns.push({...campaign('2'),budget_id:'10'}), 'inventory_budget_inconsistent'],
]) test(`rejects ${name}`, async () => {
  const p=page(); change(p); const r=await run(p);
  assert.equal(r.snapshot, null); assert.deepEqual(r.blockers,[code]); assert.equal(r.success,false);
});
test('rejects token cycles without exposing tokens', async () => {
  const r=await run(page([], 'PRIVATE_TOKEN'));
  assert.deepEqual(r.blockers,['inventory_pagination_cycle']);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));
});
test('rejects drift between scans', async () => {
  let n=0;
  const r=await collect({customerId:'123',fetchPage: async()=>page([{...campaign(),daily_budget_micros:3500000+n++}])});
  assert.deepEqual(r.blockers,['inventory_changed_during_collection']); assert.equal(r.snapshot,null);
});
test('row ordering changes do not masquerade as account drift', async () => {
  let n=0;
  const r=await collect({customerId:'123',fetchPage: async()=>page(n++ ? [campaign('2'),campaign()] : [campaign(),campaign('2')])});
  assert.equal(r.success,true);
});
test('metadata cannot change mid-pagination', async () => {
  const r=await collect({customerId:'123',fetchPage: async({pageToken})=>pageToken ?
    {...page([campaign('2')]),time_zone:'UTC'} : page([campaign()],'next')});
  assert.deepEqual(r.blockers,['inventory_metadata_changed']);
});
test('provider errors never escape and partial inventory is discarded', async () => {
  const r=await collect({customerId:'123',fetchPage: async({pageToken})=>{
    if(pageToken) throw new Error('SECRET_CREDENTIAL'); return page([campaign()],'next');
  }});
  assert.deepEqual(r.blockers,['inventory_read_failed']); assert.equal(r.snapshot,null);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('consistent shared budgets are represented but proposal evaluator blocks them', async () => {
  const r=await run(page([{...campaign(),shared_budget:true}, {...campaign('2'),budget_id:'10',shared_budget:true}]));
  assert.equal(r.success,true); assert.ok(r.snapshot.campaigns.every(c=>c.shared_budget));
});
test('invalid entry inputs fail closed', async () => {
  for(const input of [undefined,null,42,{}, {customerId:'123'}]) {
    const r=await collect(input); assert.deepEqual(r.blockers,['invalid_inventory_input']);
  }
});
test('bounded pagination stops a non-terminating reader', async () => {
  let calls=0;
  const r=await collect({customerId:'123',fetchPage:async()=>page([],String(++calls))});
  assert.equal(calls,100); assert.deepEqual(r.blockers,['inventory_limit_exceeded']);
});
