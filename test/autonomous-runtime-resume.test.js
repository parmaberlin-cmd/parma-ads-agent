'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AutonomousRuntime,readState}=require('../autonomous-runtime');
const {resumeObjective,requiredActionFor}=require('../autonomous-runtime-resume');
const {describeAction}=require('../action-registry');

function tempFile(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parma-resume-'));return path.join(dir,'state.json');}
async function drain(runtime,n=6){for(let i=0;i<n;i++)await runtime.tick();}

test('NEEDS_HUMAN persists one required action and can resume after external completion',async()=>{
 const file=tempFile();const r=new AutonomousRuntime({file,handlers:{activate_campaign:async()=>({validated:true}),generate_report:async()=>({validated:true,evidence:{ok:true}})}});
 r.submit({id:'human-resume',objective:'gate',tasks:[{id:'gate',kind:'activate_campaign'},{id:'report',kind:'generate_report',depends_on:['gate']}]});
 await r.tick();let o=readState(file).objectives[0];assert.equal(o.status,'NEEDS_HUMAN');
 const required=requiredActionFor(o.tasks[0],'NEEDS_HUMAN',o.tasks[0].stop_reason);assert.equal(required.type,'human_action');assert.deepEqual(required.resume_options,['retry','completed_externally']);
 const resumed=resumeObjective(r,{objective_id:'human-resume',task_id:'gate',mode:'completed_externally',note:'human action completed'});assert.equal(resumed.status,'READY');
 await drain(r,3);o=readState(file).objectives[0];assert.equal(o.status,'DONE');assert.equal(o.tasks[0].status,'DONE');assert.equal(o.tasks[1].status,'DONE');assert.ok(o.tasks[0].evidence.some(e=>e.schema==='runtime.objective_resume.v1'));
});

test('BLOCKED_EXTERNAL survives and retries without restarting objective',async()=>{
 const file=tempFile();let available=false;const r=new AutonomousRuntime({file,handlers:{collect_metrics:async()=>{if(!available){const e=new Error('provider unavailable');e.code='PROVIDER_DOWN';throw e;}return{validated:true,evidence:{ok:true}};}}});
 r.submit({id:'external-resume',objective:'wait provider',tasks:[{id:'read',kind:'collect_metrics',max_attempts:1}]});
 await r.tick();let o=readState(file).objectives[0];assert.equal(o.status,'BLOCKED_EXTERNAL');assert.equal(o.tasks[0].attempts,1);
 available=true;resumeObjective(r,{objective_id:'external-resume',task_id:'read',mode:'retry',note:'provider restored'});await drain(r,2);o=readState(file).objectives[0];assert.equal(o.status,'DONE');assert.equal(o.tasks[0].attempts,2);assert.ok(readState(file).audit.some(x=>x.type==='objective_resumed'));
});

test('BLOCKED_EXTERNAL cannot be falsely marked completed externally',async()=>{
 const file=tempFile();const r=new AutonomousRuntime({file,handlers:{}});r.submit({id:'blocked',objective:'blocked',tasks:[{id:'read',kind:'collect_metrics',max_attempts:1}]});await r.tick();
 assert.throws(()=>resumeObjective(r,{objective_id:'blocked',task_id:'read',mode:'completed_externally'}),/blocked_external_retry_only/);
});

test('action registry defines ownership and keeps future Instagram publish disabled',()=>{
 assert.equal(describeAction('google_ads.execute_authorized').specialist,'google_ads');
 assert.equal(describeAction('google_ads.execute_authorized').concurrency,'google_ads:account_mutation');
 const publish=describeAction('instagram.publish');assert.equal(publish.specialist,'meta');assert.equal(publish.implemented,false);assert.equal(publish.authorization,'explicit_instagram_content_delegation_required');
 assert.equal(describeAction('orderbird.read_revenue').implemented,false);
});
