'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validSchedule,ALLOWED_RECURRING_KINDS}=require('../recurring-objective-scheduler');
const {authorizeAutonomy}=require('../autonomy-policy');
const {ACTIONS}=require('../action-registry');

test('recurring scheduler rejects controlled external guardrail actions',()=>{
 const kind='google_ads.monitor_lunch_campaign';
 assert.equal(ALLOWED_RECURRING_KINDS.has(kind),false);
 assert.equal(authorizeAutonomy({name:kind}).standing_delegation_required,true);
 const schedule={id:'no-guardrail-write',enabled:true,cadence:{type:'interval',minutes:60},objective_template:{objective:'guardrail',tasks:[{id:'a',kind}]}};
 assert.equal(validSchedule(schedule),false);
});
