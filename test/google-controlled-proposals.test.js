const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareControlledProposal: prepare } = require('../google-controlled-proposals');
const now = Date.parse('2026-09-04T10:00:00Z');
function fixture() { return { now,
  action: { type: 'set_daily_budget', campaign_id: '1', amount_micros: 4000000 },
  policy: { campaign_ids: ['1'], allowed_actions: ['set_daily_budget','pause','resume','add_negative_keyword'],
    expires_at: '2026-09-05T00:00:00Z', max_account_daily_budget_micros: 8000000,
    max_campaign_daily_budget_micros: 5000000, max_budget_change_percent: 20, max_snapshot_age_seconds: 300 },
  snapshot: { customer_id: '123', currency: 'EUR', captured_at: '2026-09-04T10:00:00Z', account_inventory_complete: true,
    campaigns: [{ campaign_id: '1', budget_id: '10', daily_budget_micros: 3500000, status: 'ENABLED', shared_budget: false, conversion_integrity_trusted: true },
      { campaign_id: '2', budget_id: '20', daily_budget_micros: 4000000, status: 'PAUSED', shared_budget: false, conversion_integrity_trusted: true }] } }; }
test('valid proposal stays non-executable and includes paused campaign budgets', () => {
  const f = fixture(), copy = structuredClone(f), r = prepare(f);
  assert.equal(r.policy_fit, true); assert.equal(r.proposal.proposed_account_daily_budget_micros, 8000000);
  assert.equal(r.execution_allowed, false); assert.equal(r.writes_allowed, false); assert.equal(r.spend_allowed, false);
  assert.equal(r.requires_owner_approval, true); assert.deepEqual(f, copy);
  assert.equal(r.proposal_id, prepare(f).proposal_id);
  f.action.amount_micros++; assert.notEqual(r.proposal_id, prepare(f).proposal_id);
});
for (const [name, change] of [
  ['missing limits', f => delete f.policy], ['string money', f => f.action.amount_micros = '4000000'],
  ['extra approval cannot authorize', f => f.policy.approved = true], ['unsupported write', f => f.action.type = 'delete_campaign'],
  ['foreign campaign', f => f.policy.campaign_ids = ['9']], ['expired policy', f => f.policy.expires_at = '2026-09-04T09:00:00Z'],
  ['stale snapshot', f => f.now += 301000], ['future snapshot', f => f.now--],
  ['incomplete inventory', f => f.snapshot.account_inventory_complete = false], ['shared budget', f => f.snapshot.campaigns[0].shared_budget = true],
  ['reused budget', f => f.snapshot.campaigns[1].budget_id = '10'], ['duplicate campaign', f => f.snapshot.campaigns[1].campaign_id = '1'],
  ['untrusted conversion', f => f.snapshot.campaigns[0].conversion_integrity_trusted = false],
  ['account limit', f => f.policy.max_account_daily_budget_micros = 7900000], ['campaign limit', f => f.policy.max_campaign_daily_budget_micros = 3900000],
  ['percentage limit', f => f.policy.max_budget_change_percent = 10], ['kill switch', f => f.kill_switch = true],
  ['invalid clock', f => f.now = NaN], ['no change', f => f.action.amount_micros = 3500000],
]) test(`blocks ${name}`, () => { const f = fixture(); change(f); const r = prepare(f); assert.equal(r.policy_fit, false); assert.equal(r.execution_allowed, false); assert.ok(r.blockers.length); });
test('pause and exact negative proposals work without trusting conversions', () => {
  const f = fixture(); f.snapshot.campaigns[0].conversion_integrity_trusted = false;
  for (const action of [{type:'pause',campaign_id:'1'}, {type:'add_negative_keyword',campaign_id:'1',text:'test query',match_type:'EXACT'}]) {
    f.action = action; assert.equal(prepare(f).policy_fit, true);
  }
  f.action.match_type = 'BROAD'; assert.equal(prepare(f).policy_fit, false);
});
test('resume cannot bypass budget ceilings or conversion integrity', () => {
  const f = fixture(); f.action = {type:'resume',campaign_id:'1'};
  f.snapshot.campaigns[0].status = 'PAUSED';
  assert.equal(prepare(f).policy_fit, true);
  f.snapshot.campaigns[0].conversion_integrity_trusted = false;
  assert.ok(prepare(f).blockers.includes('conversion_integrity_untrusted'));
  f.snapshot.campaigns[0].conversion_integrity_trusted = true;
  f.policy.max_account_daily_budget_micros = 7000000;
  assert.ok(prepare(f).blockers.includes('account_budget_limit_exceeded'));
});
test('exact expiry is blocked and changed policy or snapshot changes proposal binding', () => {
  const f = fixture(), before = prepare(f).proposal_id;
  f.policy.max_budget_change_percent = 30;
  assert.notEqual(prepare(f).proposal_id, before);
  const policyChanged = prepare(f).proposal_id;
  f.snapshot.campaigns[0].status = 'PAUSED';
  assert.notEqual(prepare(f).proposal_id, policyChanged);
  f.now += 300000;
  assert.equal(prepare(f).policy_fit, false);
});
test('budget reductions remain proposals, not authority to spend or rollback money', () => {
  const f = fixture(); f.action.amount_micros = 3000000;
  f.snapshot.campaigns[0].conversion_integrity_trusted = false;
  const r = prepare(f); assert.equal(r.policy_fit, true); assert.equal(r.execution_allowed, false);
});
