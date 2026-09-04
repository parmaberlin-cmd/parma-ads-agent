'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AutonomousRuntime,readState,writeState,acquireFileLock,releaseFileLock,withLockedState}=require('../autonomous-runtime');

function tempFile(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parma-auto-'));return path.join(dir,'state.json');}
async function drain(runtime,n=5){for(let i=0;i<n;i++)await runtime.tick();}

test('restart recovers durable objective and completes it',async()=>{
 const file=tempFile(); const r1=new AutonomousRuntime({file,handlers:{run_diagnostics:async()=>({validated:true,evidence:{ok:true}})}}); r1.submit({objective:'restart',tasks:[{id:'a',kind:'run_diagnostics'}]});
 const r2=new AutonomousRuntime({file,handlers:{run_diagnostics:async()=>({validated:true,evidence:{ok:true}})}}); await drain(r2,2); const s=readState(file); assert.equal(s.objectives[0].status,'DONE'); assert.equal(s.objectives[0].tasks[0].status,'DONE');
});

test('expired in-flight lease is recovered after crash',async()=>{
 const file=tempFile(); let ms=1_700_000_000_000; const now=()=>ms; const seed=new AutonomousRuntime({file,now,handlers:{}}); seed.submit({objective:'crash',tasks:[{id:'a',kind:'run_diagnostics'}]}); const s=readState(file,now); const t=s.objectives[0].tasks[0]; t.status='RUNNING';t.lease={owner:'dead-worker',expires_at:new Date(ms-1).toISOString()};s.objectives[0].status='RUNNING';s.objectives[0].current_task_id='a';writeState(s,file,now);
 const recovered=new AutonomousRuntime({file,now,handlers:{run_diagnostics:async()=>({validated:true,evidence:{recovered:true}})}}); await drain(recovered,2); const out=readState(file,now); assert.equal(out.objectives[0].status,'DONE'); assert.ok(out.audit.some(x=>x.type==='task_lease_recovered'));
});

test('transient error persists retry/backoff then succeeds',async()=>{
 const file=tempFile(); let ms=1_700_000_000_000; let calls=0; const now=()=>ms;
 const r=new AutonomousRuntime({file,now,handlers:{run_diagnostics:async()=>{calls++;if(calls===1){const e=new Error('temporary');e.status=503;throw e;}return{validated:true,evidence:{ok:true}};}}});
 r.submit({objective:'retry',tasks:[{id:'a',kind:'run_diagnostics',max_attempts:3}]}); await r.tick(); let t=readState(file).objectives[0].tasks[0]; assert.equal(t.status,'RETRY_WAIT'); assert.equal(t.attempts,1); ms+=1000; await r.tick(); t=readState(file).objectives[0].tasks[0]; assert.equal(t.status,'DONE'); assert.equal(t.attempts,2);
});

test('correctable validation failure auto-corrects and revalidates',async()=>{
 const file=tempFile(); let ms=1_700_000_000_000; let calls=0; const now=()=>ms; const r=new AutonomousRuntime({file,now,handlers:{run_diagnostics:async()=>{calls++;return calls===1?{validated:false,correctable:true,evidence:{phase:'fix'}}:{validated:true,evidence:{phase:'revalidated'}};}}});
 r.submit({objective:'repair',tasks:[{id:'a',kind:'run_diagnostics'}]}); await r.tick(); assert.equal(readState(file).objectives[0].tasks[0].status,'RETRY_WAIT'); ms+=1000; await r.tick(); assert.equal(readState(file).objectives[0].tasks[0].status,'DONE'); assert.equal(calls,2);
});

test('idempotency key prevents duplicate execution',async()=>{
 const file=tempFile(); let calls=0; const r=new AutonomousRuntime({file,handlers:{run_diagnostics:async()=>{calls++;return{validated:true,evidence:{ok:true}};}}});
 r.submit({objective:'idem',tasks:[{id:'a',kind:'run_diagnostics',idempotency_key:'same'},{id:'b',kind:'run_diagnostics',idempotency_key:'same',depends_on:['a']}]}); await drain(r,4); const s=readState(file); assert.equal(calls,1); assert.equal(s.objectives[0].tasks[1].status,'DONE'); assert.ok(s.audit.some(x=>x.type==='task_idempotent_skip'));
});

test('atomic lock rejects concurrent state mutation',()=>{
 const file=tempFile(); const lock=acquireFileLock(file,{leaseMs:60000}); assert.equal(lock.ok,true); const second=withLockedState(file,()=>{throw new Error('must not run')},{leaseMs:60000}); assert.equal(second.locked,false); releaseFileLock(lock.lock);
});

test('task lease prevents two workers executing same task',async()=>{
 const file=tempFile(); let release; const gate=new Promise(r=>{release=r}); let calls=0;
 const handler=async()=>{calls++;await gate;return{validated:true,evidence:{ok:true}}}; const a=new AutonomousRuntime({file,handlers:{run_diagnostics:handler},leaseMs:60000}); const b=new AutonomousRuntime({file,handlers:{run_diagnostics:handler},leaseMs:60000}); a.submit({objective:'concurrency',tasks:[{id:'a',kind:'run_diagnostics'}]});
 const first=a.tick(); await new Promise(r=>setImmediate(r)); await b.tick(); assert.equal(calls,1); release(); await first;
});

test('delegation policy routes RED action to NEEDS_HUMAN',async()=>{
 const file=tempFile(); const r=new AutonomousRuntime({file,handlers:{activate_campaign:async()=>({validated:true})}}); r.submit({objective:'red',tasks:[{id:'a',kind:'activate_campaign'}]}); await r.tick(); const o=readState(file).objectives[0]; assert.equal(o.status,'NEEDS_HUMAN'); assert.equal(o.stop_reason,'human_approval_mandatory');
});

test('missing provider capability becomes BLOCKED_EXTERNAL',async()=>{
 const file=tempFile(); const r=new AutonomousRuntime({file,handlers:{}}); r.submit({objective:'blocked',tasks:[{id:'a',kind:'collect_metrics'}]}); await r.tick(); const o=readState(file).objectives[0]; assert.equal(o.status,'BLOCKED_EXTERNAL'); assert.equal(o.tasks[0].stop_reason,'provider_or_capability_blocked');
});

test('kill switch prevents claims',async()=>{
 const file=tempFile(); let calls=0; const r=new AutonomousRuntime({file,handlers:{run_diagnostics:async()=>{calls++;return{validated:true}}}}); r.submit({objective:'kill',tasks:[{id:'a',kind:'run_diagnostics'}]}); r.setKillSwitch(true); await r.tick(); assert.equal(calls,0); assert.equal(readState(file).runner.status,'STOPPED');
});

test('persisted evidence redacts secret-shaped fields',async()=>{
 const file=tempFile(); const r=new AutonomousRuntime({file,handlers:{run_diagnostics:async()=>({validated:true,evidence:{api_key:'do-not-store',note:'ok'}})}}); r.submit({objective:'redact',tasks:[{id:'a',kind:'run_diagnostics'}]}); await r.tick(); const e=readState(file).objectives[0].tasks[0].evidence[0]; assert.equal(e.api_key,'[redacted]'); assert.equal(e.note,'ok');
});
