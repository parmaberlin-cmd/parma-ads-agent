const test=require('node:test');const assert=require('node:assert/strict');const w=require('../autonomous-work-loop');
const state={tasks:[{id:'a',kind:'run_diagnostics',status:'pending'}]};
test('L1 safe read-only task proceeds without human prompt',()=>assert.equal(w.decide(state,{}).state,w.STATES.EXECUTE));
test('L1 unknown/write task fails closed to human',()=>assert.equal(w.decide({tasks:[{id:'x',kind:'activate_campaign'}]},{}).state,w.STATES.NEEDS_HUMAN));
test('L1 respects dependencies',()=>assert.equal(w.nextTask({tasks:[{id:'b',kind:'generate_report',depends_on:['a']},{id:'a',kind:'run_diagnostics',status:'done'}]}).id,'b'));
test('L2 stale/unhealthy evidence triggers live validation, not execution',()=>assert.equal(w.decide(state,{fresh_enough:false}).state,w.STATES.VALIDATE_L2));
test('L2 external blocker stops cleanly',()=>assert.equal(w.decide(state,{external_blocker:true}).state,w.STATES.BLOCKED_EXTERNAL));
test('post execution requires both validation levels',()=>{assert.equal(w.afterExecution({attempts:0,max_attempts:3},{level1_passed:true,level2_passed:false}).state,w.STATES.VALIDATE_L2);assert.equal(w.afterExecution({attempts:0,max_attempts:3},{level1_passed:true,level2_passed:true}).state,w.STATES.NEXT)});
test('bounded repair prevents infinite loops',()=>assert.equal(w.afterExecution({attempts:2,max_attempts:3},{level1_passed:false}).state,w.STATES.BLOCKED_EXTERNAL));

test('unfinished dependencies never report DONE',()=>{for(const tasks of [[{id:'a',depends_on:['missing']}],[{id:'a',depends_on:['b']},{id:'b',depends_on:['a']}],[{id:'a',status:'running'}]]) assert.equal(w.decide({tasks}).state,w.STATES.BLOCKED_EXTERNAL);assert.equal(w.decide({tasks:[{id:'a',status:'done'}]}).state,w.STATES.DONE)});
test('exhausted attempts cannot execute and invalid bounds stay finite',()=>{assert.equal(w.decide({tasks:[{id:'a',kind:'run_diagnostics',attempts:3,max_attempts:3}]}).state,w.STATES.BLOCKED_EXTERNAL);for(const n of [Infinity,NaN,-1,'bad']) assert.equal(w.normalizeTask({max_attempts:n}).max_attempts,3);assert.equal(w.normalizeTask({max_attempts:1000}).max_attempts,10)});
