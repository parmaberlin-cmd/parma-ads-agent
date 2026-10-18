'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeObjective}=require('../autonomous-runtime');
const {ingressReplayVerified}=require('../autonomous-runtime-service');

test('ingress idempotent replay requires matching persisted objective',()=>{
 const payload={id:'ingress-1',objective:'safe read',tasks:[{id:'a',kind:'run_diagnostics'}]};
 const existing=normalizeObjective(payload);
 assert.equal(ingressReplayVerified(payload,{getObjective:()=>existing}),true);
 assert.equal(ingressReplayVerified({...payload,objective:'modified'},{getObjective:()=>existing}),false);
 assert.equal(ingressReplayVerified({...payload,tasks:[{id:'a',kind:'generate_report'}]},{getObjective:()=>existing}),false);
});

test('ingress idempotent replay fails closed when original submission did not persist',()=>{
 const payload={id:'ingress-lost',objective:'safe read',tasks:[{id:'a',kind:'run_diagnostics'}]};
 assert.equal(ingressReplayVerified(payload,{getObjective:()=>null}),false);
 assert.equal(ingressReplayVerified(payload,{getObjective:()=>{throw Error('corrupt state');}}),false);
});
