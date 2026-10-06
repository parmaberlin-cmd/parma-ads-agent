'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCommercialHandoffTool } = require('../mcp-commercial-tools');
const { UnattendedJobStore, jobIntegrityKey } = require('../google-ads-unattended-job-store');

const CUSTOMER='7376153998', CAMPAIGN='23276824770';
function plan() {
  return {
    schema:'google_ads.commercial_plan.v1', plan_id:'mcp-handoff-test', customer_id:CUSTOMER, spend_allowed:false,
    actions:[{
      action:{type:'negative_add',campaign_id:CAMPAIGN,campaign_resource_name:`customers/${CUSTOMER}/campaigns/${CAMPAIGN}`,text:'synthetic intent',match_type:'PHRASE'},
      readback:{kind:'CAMPAIGN_NEGATIVE',text:'synthetic intent',match_type:'PHRASE'},
      before_state:{present:false,count:0,text:'synthetic intent',match_type:'PHRASE'},
      proposed_after_state:{present:true,count:1,text:'synthetic intent',match_type:'PHRASE'},
      change_id:'mcp-change-1',objective_id:'mcp-handoff',reason:'Explicitly authorized test plan.',
      evidence:[{type:'operator_approval',reference:'mcp-test'}],confidence:1,
    }],
  };
}
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-handoff-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const env={ADS_JOB_PATH:path.join(dir,'jobs'),ADS_AUDIT_INTEGRITY_KEY:'k'.repeat(40)};
  return {env,dir};
}
test('authorized MCP handoff queues a signed job but performs no provider write', async t => {
  const {env}=fixture(t); const now=()=>Date.parse('2026-09-24T15:00:00Z');
  const submit=createCommercialHandoffTool({env,now,authorize:async (_auth,ctx)=>ctx.scope==='parma.write'});
  const result=await submit({confirm_authorized:true,job_id:'mcp-job-1',plan:plan()},{token:'opaque'});
  assert.equal(result.status,'QUEUED'); assert.equal(result.provider_write,false); assert.equal(result.writes_executed,0);
  const store=new UnattendedJobStore({directory:env.ADS_JOB_PATH,integrityKey:jobIntegrityKey(env),now});
  const jobs=store.listIncoming(); assert.equal(jobs.length,1); assert.equal(jobs[0].job.job_id,'mcp-job-1');
  assert.equal(jobs[0].job.authorization.spend_allowed,false); assert.equal(jobs[0].job.authorization.activation_allowed,false);
});
test('MCP handoff fails closed without explicit authorization or for spend/activation', async t => {
  const {env}=fixture(t); const submit=createCommercialHandoffTool({env,authorize:async()=>true});
  assert.equal((await submit({plan:plan()},{token:'opaque'})).blocker,'explicit_authorization_required');
  const spending=plan(); spending.spend_allowed=true;
  assert.equal((await submit({confirm_authorized:true,plan:spending},{token:'opaque'})).status,'BLOCKED');
  const activation=plan(); activation.actions[0].action={type:'campaign_update',campaign_id:CAMPAIGN,resource_name:`customers/${CUSTOMER}/campaigns/${CAMPAIGN}`,status:'ENABLED'};
  activation.actions[0].readback={kind:'RESOURCE_STATUS',resource_name:`customers/${CUSTOMER}/campaigns/${CAMPAIGN}`};
  assert.equal((await submit({confirm_authorized:true,plan:activation},{token:'opaque'})).blocker,'activation_not_allowed_via_mcp');
});
test('MCP handoff requires parma.write authorization and valid commercial plan', async t => {
  const {env}=fixture(t); const denied=createCommercialHandoffTool({env,authorize:async()=>false});
  assert.equal((await denied({confirm_authorized:true,plan:plan()},{token:'opaque'})).blocker,'unauthorized');
  const submit=createCommercialHandoffTool({env,authorize:async()=>true});
  assert.equal((await submit({confirm_authorized:true,plan:{customer_id:CUSTOMER,spend_allowed:false,actions:[]}},{token:'opaque'})).blocker,'malformed_commercial_plan');
});
