'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {read,write,RecurringObjectiveScheduler}=require('../recurring-objective-scheduler');
const {reconcileRecurringBootstrap,desiredSchedule}=require('../recurring-objective-bootstrap');

function temp(){return path.join(fs.mkdtempSync(path.join(os.tmpdir(),'parma-recurring-bootstrap-')),'recurring.json');}

test('initial bootstrap creates the managed recurring schedule',()=>{
  const file=temp();
  const result=reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770'},now:Date.parse('2026-09-06T08:00:00.000Z')});
  const state=read(file);
  const schedule=state.schedules.find(x=>x.id==='autonomous-business-loop-google-cycle');
  assert.equal(result.status,'healthy');
  assert.equal(result.action,'created');
  assert.equal(schedule.objective_template.tasks[0].kind,'google_ads.cycle_plan');
  assert.equal(schedule.objective_template.tasks[0].input.campaign_id,'23276824770');
});

test('restart reconciliation is idempotent and preserves matching config',()=>{
  const file=temp();
  reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770'},now:Date.parse('2026-09-06T08:00:00.000Z')});
  const first=read(file);
  const result=reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770'},now:Date.parse('2026-09-06T08:01:00.000Z')});
  const second=read(file);
  assert.equal(result.status,'healthy');
  assert.equal(result.action,'preserved');
  assert.equal(second.schedules.length,1);
  assert.deepEqual(second.schedules[0],first.schedules[0]);
});

test('drift is detected and reconciled safely',()=>{
  const file=temp();
  reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770'},now:Date.parse('2026-09-06T08:00:00.000Z')});
  const drifted=read(file);
  drifted.schedules[0].cadence={type:'daily',hour:5,minute:0};
  fs.writeFileSync(file,JSON.stringify(drifted),{mode:0o600});
  const result=reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770',AUTONOMOUS_BUSINESS_LOOP_HOUR:'8',AUTONOMOUS_BUSINESS_LOOP_MINUTE:'0'},now:Date.parse('2026-09-06T08:05:00.000Z')});
  const updated=read(file);
  assert.equal(result.status,'drift');
  assert.equal(result.action,'updated');
  assert.ok(result.drift_fields.includes('cadence'));
  assert.deepEqual(updated.schedules[0].cadence,{type:'daily',hour:8,minute:0});
});

test('disabled configuration keeps schedule disabled and idempotent',()=>{
  const file=temp();
  reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true'},now:Date.parse('2026-09-06T08:00:00.000Z')});
  const disabled=reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'false'},now:Date.parse('2026-09-06T08:10:00.000Z')});
  const again=reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'false'},now:Date.parse('2026-09-06T08:11:00.000Z')});
  const state=read(file);
  assert.equal(disabled.status,'disabled');
  assert.equal(again.status,'disabled');
  assert.equal(state.schedules[0].enabled,false);
});

test('invalid campaign id reports missing and does not create schedules',()=>{
  const file=temp();
  const result=reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'bad-id'},now:Date.parse('2026-09-06T08:00:00.000Z')});
  const state=read(file);
  assert.equal(result.status,'missing');
  assert.equal(result.reason,'invalid_campaign_id');
  assert.equal(state.schedules.length,0);
});

test('default recurring objective is zero-write safe and begins with cycle planner',()=>{
  const desired=desiredSchedule({AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770'},Date.parse('2026-09-06T08:00:00.000Z'));
  const task=desired.schedule.objective_template.tasks[0];
  assert.equal(task.kind,'google_ads.cycle_plan');
  assert.equal(task.input.mode,undefined);
  assert.equal(task.input.campaign_id,'23276824770');
  assert.equal(desired.schedule.objective_template.tasks.length,1);
});

test('restart continuity keeps one managed schedule and avoids duplicate emission for same slot',()=>{
  const file=temp();
  reconcileRecurringBootstrap({file,env:{AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770'},now:Date.parse('2026-09-06T08:00:00.000Z')});
  let state=read(file);
  state.last_scan_at='2026-09-06T05:58:00.000Z';
  write(state,file);
  const submitted=[];
  const runtime={submit:objective=>{submitted.push(objective);return objective;}};
  const schedulerA=new RecurringObjectiveScheduler({runtime,file,now:()=>Date.parse('2026-09-06T06:01:00.000Z'),maxRecoveryMinutes:10});
  schedulerA.tick();
  const schedulerB=new RecurringObjectiveScheduler({runtime,file,now:()=>Date.parse('2026-09-06T06:01:00.000Z'),maxRecoveryMinutes:10});
  schedulerB.tick();
  state=read(file);
  assert.equal(state.schedules.length,1);
  assert.equal(submitted.length,1);
});
