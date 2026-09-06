'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runRuntimeSelfTest}=require('../runtime-self-test');
const {authorizeAutonomy}=require('../autonomy-policy');

test('runtime self-test is read-only autonomous and correctable only on first retry_once attempt',async()=>{
 const auth=authorizeAutonomy({name:'runtime.self_test'},{});assert.equal(auth.allowed,true);assert.equal(auth.action_class,'read_only');
 const first=await runRuntimeSelfTest({task:{attempts:1,input:{mode:'retry_once'}}});assert.equal(first.validated,false);assert.equal(first.correctable,true);assert.equal(first.evidence.writes_attempted,0);assert.equal(first.evidence.spend_attempted,0);
 const second=await runRuntimeSelfTest({task:{attempts:2,input:{mode:'retry_once'}}});assert.equal(second.validated,true);assert.equal(second.evidence.writes_attempted,0);
});

test('runtime self-test hold is bounded to 60 seconds in evidence',async()=>{
 const result=await runRuntimeSelfTest({task:{attempts:1,input:{mode:'hold',hold_ms:-1}}});assert.equal(result.validated,true);assert.equal(result.evidence.hold_ms,0);
});

test('runtime self-test invalid mode fails closed without correction loop',async()=>{
 const result=await runRuntimeSelfTest({task:{attempts:1,input:{mode:'provider_write'}}});assert.equal(result.validated,false);assert.equal(result.correctable,false);assert.equal(result.evidence.writes_attempted,0);assert.equal(result.evidence.spend_attempted,0);
});
