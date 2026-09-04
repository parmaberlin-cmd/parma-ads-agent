'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {runControlledBudgetJob}=require('../google-controlled-runner');
test('runner disabled without explicit startup activation',async()=>assert.equal((await runControlledBudgetJob({env:{}})).status,'disabled'));
test('runner unconfigured kill switch blocks before credentials',async()=>{const r=await runControlledBudgetJob({env:{GOOGLE_CONTROLLED_BUDGET_JOB:'true'}});assert.equal(r.status,'blocked');assert.equal(r.writes_executed,false);});
test('runner active kill switch blocks before credentials',async()=>{const r=await runControlledBudgetJob({env:{GOOGLE_CONTROLLED_BUDGET_JOB:'true',GOOGLE_ADS_WRITE_KILL_SWITCH:'true'}});assert.equal(r.status,'blocked');assert.equal(r.writes_executed,false);});
