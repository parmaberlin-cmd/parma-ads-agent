const test = require('node:test');
const assert = require('node:assert/strict');
const { executePausedMetaDraftSafely } = require('../meta-safe-orchestrator');
const { AUTONOMY_LEVELS } = require('../safe-execution');
const { APPROVAL_TOKEN } = require('../meta-paused-draft');

const validDraft = {
  campaign:{ name:'x', status:'PAUSED', objective:'OUTCOME_TRAFFIC', special_ad_categories:[] },
  adSet:{ name:'x', status:'PAUSED', lifetime_budget:8400, billing_event:'IMPRESSIONS', optimization_goal:'LINK_CLICKS', targeting:{ geo_locations:{ countries:['DE'] } }, dsa_beneficiary:'Parma', dsa_payor:'Parma' },
  creative:{ name:'x', object_id:'1', instagram_user_id:'2', source_instagram_media_id:'3' },
  ad:{ name:'x', status:'PAUSED' }
};

test('kill switch blocks before any transport write', async () => {
  let posts=0;
  const transport={ get:async()=>({status:'PAUSED'}), post:async()=>{posts+=1; return {id:'1'};} };
  const result=await executePausedMetaDraftSafely({transport,adAccountId:'act_1',draft:validDraft,approvalToken:APPROVAL_TOKEN,killSwitch:true});
  assert.equal(result.blocked,true);
  assert.equal(posts,0);
});

test('recommend level cannot write even when preflight is otherwise ready', async () => {
  let posts=0;
  const transport={ get:async()=>({status:'PAUSED'}), post:async()=>{posts+=1; return {id:'1'};} };
  const result=await executePausedMetaDraftSafely({transport,adAccountId:'act_1',draft:validDraft,approvalToken:APPROVAL_TOKEN,autonomyLevel:AUTONOMY_LEVELS.RECOMMEND});
  assert.equal(result.blocked,true);
  assert.equal(posts,0);
});
