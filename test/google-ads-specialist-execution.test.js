'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {preflightAction,buildExecutionDryRun}=require('../google-ads-specialist-execution');

const now=Date.parse('2026-09-04T20:30:00.000Z');
const read={campaign_id:'23276824770',account_budget_context:{enabled_budgets:[{budget_id:'15148237814',daily_budget_eur:3.5,campaign_ids:['23276824770']}]}};
const baseAction={action_id:'a1',campaign_id:'23276824770',action_type:'budget_adjustment',target:'campaign:23276824770:daily_budget',current_value:{daily_budget_eur:3.5},proposed_value:{daily_budget_eur:6},reason:'x',evidence_refs:['read_campaign.overview.daily_budget_eur'],expected_effect:'x',risk_level:'HIGH',delegation_class:'spend_change',rollback_possible:true,confidence:.9,conversion_signal_used:'NONE',status:'NEEDS_HUMAN'};
const proposal={mode:'proposal_only',campaign_id:'23276824770',evidence_fingerprint:'fp1',budget_cage:{cap_eur:10,before_total_eur:7.5,target_campaign_before_eur:3.5,target_campaign_proposed_eur:6,proposed_total_eur:10,hard_daily_cost_cap:false,validated:true},actions:[baseAction]};
const completed='2026-09-04T20:29:00.000Z';
function run(action=baseAction,opts={}){return preflightAction(action,{proposal:opts.proposal||proposal,readEvidence:opts.readEvidence||read,proposalCompletedAt:opts.completed||completed,taskInput:opts.taskInput||{},killSwitch:opts.killSwitch||false,now:opts.now||now});}

test('rejects stale proposal',()=>assert.equal(run(baseAction,{completed:'2026-09-04T20:20:00.000Z'}).reason,'proposal_stale_or_future'));
test('rejects aggregate configured budget above 10 EUR',()=>{const p=structuredClone(proposal);p.budget_cage.proposed_total_eur=10.01;assert.equal(run(baseAction,{proposal:p}).reason,'budget_cap_exceeded');});
test('NEEDS_HUMAN is not inferred authorized',()=>{const r=run();assert.equal(r.status,'NEEDS_HUMAN');assert.equal(r.reason,'persisted_authorization_required');});
test('rejects RED / Primary Conversion action',()=>{const a={...baseAction,action_id:'red',action_type:'primary_conversion_change',target:'Primary Conversion'};const p={...proposal,actions:[a]};const r=preflightAction(a,{proposal:p,readEvidence:read,proposalCompletedAt:completed,now});assert.equal(r.status,'REJECTED');});
test('duplicate dry-run execution is idempotently replayed',()=>{const first=buildExecutionDryRun({proposal,readEvidence:read,proposalCompletedAt:completed,now});const second=buildExecutionDryRun({proposal,readEvidence:read,proposalCompletedAt:completed,now,executionLedger:[first.evidence.execution_key]});assert.equal(second.evidence.replayed,true);assert.equal(second.evidence.mutations_executed,0);});
test('rejects mismatched campaign',()=>assert.equal(run(baseAction,{readEvidence:{...read,campaign_id:'999'}}).reason,'campaign_account_mismatch'));
test('kill switch rejects preflight action',()=>assert.equal(run(baseAction,{killSwitch:true}).reason,'kill_switch_active'));
test('missing rollback is rejected when required',()=>{const a={...baseAction,rollback_possible:false};const p={...proposal,actions:[a]};const r=preflightAction(a,{proposal:p,readEvidence:read,proposalCompletedAt:completed,now});assert.equal(r.reason,'rollback_required_missing');});
test('read-after-write failure simulation fails closed',()=>{const a={...baseAction,status:'AUTO_EXECUTABLE'};const p={...proposal,actions:[a]};const r=preflightAction(a,{proposal:p,readEvidence:read,proposalCompletedAt:completed,taskInput:{simulateReadAfterWriteFailure:true},now});assert.equal(r.reason,'read_after_write_failure_simulated');});
test('action absent from proposal is rejected',()=>assert.equal(run({...baseAction,action_id:'other'}).reason,'action_not_in_proposal'));
test('dry run never calls provider validate-only or write',()=>{const r=buildExecutionDryRun({proposal,readEvidence:read,proposalCompletedAt:completed,now});assert.equal(r.validated,true);assert.equal(r.evidence.mutations_executed,0);assert.equal(r.evidence.provider_validate_only_called,false);assert.equal(r.evidence.provider_write_called,false);});
