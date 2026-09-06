'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

function temp(name){return path.join(fs.mkdtempSync(path.join(os.tmpdir(),'parma-runtime-startup-')),name);}
function withEnv(overrides,fn){
  const keys=Object.keys(overrides);
  const prior=new Map(keys.map(k=>[k,process.env[k]]));
  for(const [k,v] of Object.entries(overrides))process.env[k]=String(v);
  const restore=()=>{for(const k of keys){if(prior.get(k)==null)delete process.env[k];else process.env[k]=prior.get(k);}};
  try{
    const value=fn();
    if(value&&typeof value.then==='function')return value.finally(restore);
    restore();
    return value;
  }catch(error){
    restore();
    throw error;
  }
}
function loadServiceFresh(){
  for(const id of Object.keys(require.cache)){if(id.endsWith(`${path.sep}autonomous-runtime-service.js`))delete require.cache[id];}
  return require('../autonomous-runtime-service');
}

test('startup path creates managed recurring schedule when missing',()=>{
  const recurringFile=temp('recurring.json');
  const runtimeFile=temp('runtime.json');
  withEnv({
    RECURRING_OBJECTIVE_STATE_PATH:recurringFile,
    AUTONOMOUS_RUNTIME_STATE_PATH:runtimeFile,
    AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',
    AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770',
    AUTONOMOUS_BUSINESS_LOOP_HOUR:'8',
    AUTONOMOUS_BUSINESS_LOOP_MINUTE:'0',
    AUTONOMOUS_RUNTIME_TICK_MS:'60000',
    RECURRING_OBJECTIVE_SCAN_MS:'60000',
  },()=>{
    const service=loadServiceFresh();
    service.startAutonomousRuntime();
    const recurring=require('../recurring-objective-scheduler').read(recurringFile);
    const schedule=recurring.schedules.find(x=>x.id==='autonomous-business-loop-google-cycle');
    assert.ok(schedule);
    assert.equal(schedule.objective_template.tasks[0].kind,'google_ads.cycle_plan');
    assert.equal(service.scheduler.snapshot().bootstrap.status,'healthy');
    service.scheduler.stop();
    service.runtime.stop();
  });
});

test('corrupted recurring state does not crash startup and remains observable as degraded',async()=>{
  const recurringFile=temp('recurring.json');
  const runtimeFile=temp('runtime.json');
  fs.mkdirSync(path.dirname(recurringFile),{recursive:true});
  fs.writeFileSync(recurringFile,'{not-json\n');
  await withEnv({
    RECURRING_OBJECTIVE_STATE_PATH:recurringFile,
    AUTONOMOUS_RUNTIME_STATE_PATH:runtimeFile,
    AUTONOMOUS_BUSINESS_LOOP_ENABLED:'true',
    AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID:'23276824770',
    AUTONOMOUS_RUNTIME_TICK_MS:'60000',
    RECURRING_OBJECTIVE_SCAN_MS:'60000',
  },async()=>{
    const service=loadServiceFresh();
    assert.doesNotThrow(()=>service.startAutonomousRuntime());
    await service.runtime.tick();
    const snap=service.scheduler.snapshot();
    assert.equal(service.runtime.snapshot().runner.status,'RUNNING');
    assert.equal(snap.bootstrap.status,'missing');
    assert.equal(snap.bootstrap.reconciled,false);
    assert.equal(snap.bootstrap.reason,'bootstrap_reconcile_failed');
    assert.equal(typeof snap.bootstrap.evidence?.error,'string');
    assert.equal(typeof snap.state_error,'string');
    assert.ok(service.scheduler.timer);
    const tower=require('../control-tower').buildControlTower({
      runtimeState:require('../autonomous-runtime').readState(runtimeFile),
      schedulerSnapshot:snap,
      env:process.env,
    });
    assert.equal(tower.recurring_bootstrap.status,'missing');
    service.scheduler.stop();
    service.runtime.stop();
  });
});
