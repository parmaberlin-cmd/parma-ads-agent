'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {upsertSchedule,read,write,RecurringObjectiveScheduler,TZ}=require('../recurring-objective-scheduler');
const {getSpecialist}=require('../specialist-registry');
const {validateEconomicGroundTruth,conversionPolicy}=require('../economic-ground-truth');
const {buildControlTower,latestBudgetCage}=require('../control-tower');

function temp(){return path.join(fs.mkdtempSync(path.join(os.tmpdir(),'parma-recurring-')),'state.json');}
const safeSchedule={id:'morning-health',enabled:true,cadence:{type:'daily',hour:23,minute:0},objective_template:{objective:'Morning read-only health',tasks:[{id:'diag',kind:'run_diagnostics'}]}};

test('recurring scheduler is Europe/Berlin, recovers missed slot and deduplicates it',()=>{
 const file=temp();upsertSchedule(safeSchedule,{file,now:Date.parse('2026-09-04T20:00:00Z')});const state=read(file);state.last_scan_at='2026-09-04T20:58:00.000Z';write(state,file);
 const submitted=[];const runtime={submit:o=>{submitted.push(o);return o;}};const scheduler=new RecurringObjectiveScheduler({runtime,file,now:()=>Date.parse('2026-09-04T21:01:00Z'),maxRecoveryMinutes:10});
 const first=scheduler.tick();assert.equal(first.length,1);assert.equal(submitted.length,1);assert.match(submitted[0].id,/recurring-morning-health-202609042300/);assert.equal(scheduler.snapshot().timezone,TZ);
 const second=scheduler.tick();assert.equal(second.length,0);assert.equal(submitted.length,1);
});

test('recurring scheduler rejects commercially invasive execution task',()=>{
 const file=temp();assert.throws(()=>upsertSchedule({...safeSchedule,id:'bad',objective_template:{objective:'bad',tasks:[{id:'x',kind:'google_ads.execute_authorized',input:{mode:'live'}}]}},{file}),/invalid_recurring_schedule/);
});

test('Orderbird specialist is declared but provider access is not fabricated',()=>{const s=getSpecialist('orderbird');assert.equal(s.status,'AWAITING_OFFICIAL_PROVIDER_PATH');assert.equal(s.read,false);assert.equal(s.write,false);});

test('economic ground truth contract is separate from marketing attribution',()=>{
 const base={schema:'economic_ground_truth.v1',provider:'orderbird',restaurant_id:'parma',business_date:'2026-09-04',currency:'EUR',gross_revenue:100,net_revenue:84,vat:16,captured_at:'2026-09-04T21:00:00.000Z',source_authority:'provider_supported_read_only'};
 assert.equal(validateEconomicGroundTruth(base).ok,true);assert.equal(validateEconomicGroundTruth({...base,marketing_attribution:{google:100}}).ok,false);
});

test('conversion integrity blocks booking signals from autonomous reservation optimization',()=>{assert.equal(conversionPolicy('booking_completed').allowed_for_autonomous_booking_optimization,false);assert.equal(conversionPolicy('table_reservation_completed').allowed_for_autonomous_booking_optimization,false);});

test('control tower surfaces human/block/retry state and guardrails',()=>{const state={runner:{status:'RUNNING',kill_switch:false,heartbeat_at:'2026-09-04T21:00:00Z',last_error:null},objectives:[{id:'o',status:'NEEDS_HUMAN',current_task_id:'h',next_action:'human_decision',tasks:[{id:'d',kind:'run_diagnostics',status:'DONE',completed_at:'2026-09-04T20:59:00Z',depends_on:[]},{id:'h',kind:'x',status:'NEEDS_HUMAN',stop_reason:'approval',depends_on:[]}]}]};const c=buildControlTower({runtimeState:state,schedulerSnapshot:{timezone:TZ,schedules:[]},env:{}});assert.equal(c.pending_needs_human.length,1);assert.equal(c.runner.kill_switch,false);assert.equal(c.guardrails.conversion_integrity.booking_completed.trust,'UNTRUSTED_AS_RESERVATION');});

test('control tower projects latest budget cage from real preflight task shape without throwing',()=>{
 const cageOld={ok:true,before_total_eur:7.5,proposed_total_eur:9,cap_eur:10};const cageNew={ok:true,before_total_eur:7.5,proposed_total_eur:10,cap_eur:10};
 const state={runner:{status:'RUNNING',kill_switch:false,heartbeat_at:'2026-09-04T21:00:00Z',last_error:null},objectives:[{id:'old',status:'DONE',tasks:[{id:'p',kind:'google_ads.execution_preflight',status:'DONE',completed_at:'2026-09-04T20:00:00Z',evidence:[{budget_cage:cageOld}],depends_on:[]}]},{id:'new',status:'DONE',tasks:[{id:'p2',kind:'google_ads.execution_preflight',status:'DONE',completed_at:'2026-09-04T21:00:00Z',evidence:[{budget_cage:cageNew}],depends_on:[]}]}]};
 assert.deepEqual(latestBudgetCage(state),cageNew);const c=buildControlTower({runtimeState:state,schedulerSnapshot:{timezone:TZ,schedules:[]},env:{}});assert.deepEqual(c.guardrails.budget_cage,cageNew);
});
