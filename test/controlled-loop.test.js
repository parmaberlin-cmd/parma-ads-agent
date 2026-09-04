'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveStandingAuthorization}=require('../standing-delegation-policy');
const {executeAuthorized}=require('../google-ads-controlled-gateway');
const {planNext}=require('../autonomous-cycle-planner');

const beforeExpiry=Date.parse('2026-09-04T21:30:00.000Z');
const authorizedNegative={action_id:'neg1',campaign_id:'23853417314',action_type:'negative_keyword_addition',proposed_value:{term:'sly restaurant berlin',match_type:'EXACT'}};

test('standing delegation is narrow and expires',()=>{
  assert.ok(resolveStandingAuthorization(authorizedNegative,{now:beforeExpiry}));
  assert.equal(resolveStandingAuthorization({...authorizedNegative,campaign_id:'23276824770'},{now:beforeExpiry}),null);
  assert.equal(resolveStandingAuthorization({...authorizedNegative,proposed_value:{term:'dominos',match_type:'EXACT'}},{now:beforeExpiry}),null);
  assert.equal(resolveStandingAuthorization(authorizedNegative,{now:Date.parse('2026-09-04T22:00:00.000Z')}),null);
});

test('controlled gateway applies only internal auto action in verify-only with zero mutations',async()=>{
  const preflight={schema:'google_ads.execution_preflight.v1',execution_key:'k1',actions:[
    {action_id:'guard',campaign_id:'23276824770',action_type:'protect_high_intent_local_terms',status:'AUTO_EXECUTABLE'},
    {action_id:'budget',campaign_id:'23276824770',action_type:'budget_adjustment',status:'NEEDS_HUMAN',reason:'persisted_authorization_required'},
    {action_id:'red',campaign_id:'23276824770',action_type:'primary_conversion_change',status:'REJECTED',reason:'red_action_forbidden'},
  ]};
  const r=await executeAuthorized({preflight,mode:'verify_only',now:beforeExpiry});
  assert.equal(r.validated,true);assert.equal(r.evidence.mutations_executed,0);
  assert.equal(r.evidence.executed[0].status,'APPLIED_INTERNAL_GUARDRAIL');
  assert.equal(r.evidence.needs_human.length,1);assert.equal(r.evidence.rejected.length,1);
});

test('controlled gateway fail-closes on kill switch',async()=>{
  const r=await executeAuthorized({preflight:{schema:'google_ads.execution_preflight.v1',execution_key:'k',actions:[]},killSwitch:true});
  assert.equal(r.validated,true);assert.equal(r.evidence.reason,'kill_switch_active');assert.equal(r.evidence.mutations_executed,0);
});

test('controlled gateway idempotently skips historical execution key',async()=>{
  const preflight={schema:'google_ads.execution_preflight.v1',execution_key:'k2',actions:[{action_id:'guard',campaign_id:'23276824770',action_type:'protect_high_intent_local_terms',status:'AUTO_EXECUTABLE'}]};
  const first=await executeAuthorized({preflight,mode:'verify_only'});const key=first.evidence.executed[0].execution_key;
  const second=await executeAuthorized({preflight,mode:'verify_only',historicalKeys:[key]});
  assert.equal(second.evidence.executed[0].status,'IDEMPOTENT_REPLAY');assert.equal(second.evidence.mutations_executed,0);
});

function objective(tasks=[]){return {tasks};}
test('cycle planner starts with live READ and then advances stage-by-stage',()=>{
  const campaignId='23276824770';
  let r=planNext(objective(),{campaignId});assert.equal(r.evidence.stage,'READ');assert.equal(r.next_tasks[0].kind,'google_ads.read_campaign');
  r=planNext(objective([{id:`cycle-read-${campaignId}`,kind:'google_ads.read_campaign',status:'DONE'}]),{campaignId});assert.equal(r.evidence.stage,'PROPOSE');
  r=planNext(objective([{id:`cycle-read-${campaignId}`,kind:'google_ads.read_campaign',status:'DONE'},{id:`cycle-propose-${campaignId}`,kind:'google_ads.propose_changes',status:'DONE'}]),{campaignId});assert.equal(r.evidence.stage,'CLASSIFY_PREFLIGHT');
  r=planNext(objective([{id:`cycle-read-${campaignId}`,kind:'google_ads.read_campaign',status:'DONE'},{id:`cycle-propose-${campaignId}`,kind:'google_ads.propose_changes',status:'DONE'},{id:`cycle-preflight-${campaignId}`,kind:'google_ads.execution_preflight',status:'DONE'}]),{campaignId});assert.equal(r.evidence.stage,'EXECUTE_AUTHORIZED');assert.equal(r.next_tasks[0].input.mode,'verify_only');
});

test('cycle planner never treats booking_completed as reservation ground truth',()=>{
  const r=planNext(objective([{id:'cycle-read-23276824770',kind:'google_ads.read_campaign',status:'DONE'}]),{campaignId:'23276824770'});
  assert.match(r.next_tasks[0].input.context.conversion_integrity,/booking_completed_untrusted_as_reservation/);
});
