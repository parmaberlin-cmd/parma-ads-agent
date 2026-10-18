'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validSchedule,ALLOWED_RECURRING_KINDS}=require('../recurring-objective-scheduler');
const {authorizeAutonomy}=require('../autonomy-policy');

test('legacy guardrail monitor schedule remains valid but is not an autonomous read-only grant',()=>{
 const kind='google_ads.monitor_lunch_campaign';
 assert.equal(ALLOWED_RECURRING_KINDS.has(kind),true);
 const authorization=authorizeAutonomy({name:kind});
 assert.equal(authorization.standing_delegation_required,true);
 const schedule={id:'legacy-monitor',enabled:true,cadence:{type:'interval',minutes:60},objective_template:{objective:'monitor',tasks:[{id:'a',kind}]}};
 assert.equal(validSchedule(schedule),true);
});
