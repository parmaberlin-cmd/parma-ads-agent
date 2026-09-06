'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildControlTower}=require('../control-tower');

function baseState(){return {runner:{status:'RUNNING',kill_switch:false,heartbeat_at:'2026-09-06T08:00:00.000Z',last_error:null},objectives:[]};}

test('Control Tower exposes specialist ownership, auth and live shadow source health',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parma-tower-'));
 fs.writeFileSync(path.join(dir,'parma-shadow-history.json'),JSON.stringify([{id:'x',generated_at:'2026-09-06T08:00:00.000Z',source_health:{google:true,ga4:true,meta:true}}]));
 const state=baseState();state.objectives.push({id:'o',status:'READY',current_task_id:null,next_action:'select_next_task',created_at:'2026-09-06T07:59:00.000Z',updated_at:'2026-09-06T07:59:00.000Z',tasks:[{id:'read',kind:'google_ads.read_campaign',status:'PENDING',attempts:0,max_attempts:3,depends_on:[],retry:{next_attempt_at:null,backoff_ms:0},created_at:'2026-09-06T07:59:00.000Z',updated_at:'2026-09-06T07:59:00.000Z'}]});
 const tower=buildControlTower({runtimeState:state,env:{RAILWAY_VOLUME_MOUNT_PATH:dir}});
 assert.equal(tower.schema,'parma.control_tower.v1');assert.equal(tower.next_task.specialist,'google_ads');assert.equal(tower.next_task.authorization.write,'not_applicable');assert.equal(tower.next_task.authorization.spend,'not_applicable');assert.equal(tower.source_health.shadow.meta,true);assert.ok(tower.action_registry.some(x=>x.kind==='instagram.publish'&&x.implemented===false));
});

test('Control Tower exposes exact resumable blocker action',()=>{
 const state=baseState();state.objectives.push({id:'blocked',status:'BLOCKED_EXTERNAL',current_task_id:'read',next_action:'external_unblock',created_at:'x',updated_at:'y',tasks:[{id:'read',kind:'orderbird.read_revenue',status:'BLOCKED_EXTERNAL',attempts:1,max_attempts:3,depends_on:[],retry:{next_attempt_at:null,backoff_ms:0},stop_reason:'provider_or_capability_blocked',updated_at:'y'}]});
 const tower=buildControlTower({runtimeState:state,env:{}});assert.equal(tower.blocked_external.length,1);const row=tower.blocked_external[0];assert.equal(row.specialist,'orderbird');assert.equal(row.required_action.action,'restore_provider_or_capability_then_retry');assert.deepEqual(row.required_action.resume_options,['retry']);assert.equal(row.resume_supported,true);
});
