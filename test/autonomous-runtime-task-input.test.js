'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { normalizeObjective }=require('../autonomous-runtime');

test('runtime persists sanitized task input for specialist capabilities',()=>{
  const o=normalizeObjective({id:'obj',objective:'x',tasks:[{id:'proposal',kind:'google_ads.propose_changes',input:{context:{daily_budget_cap_eur:10,late_night_strategy:true,weather_context:'rain then improving'}}}]},()=>0);
  assert.equal(o.tasks[0].input.context.daily_budget_cap_eur,10);
  assert.equal(o.tasks[0].input.context.late_night_strategy,true);
  assert.equal(o.tasks[0].input.context.weather_context,'rain then improving');
});
