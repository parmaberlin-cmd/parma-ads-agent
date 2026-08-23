const test=require('node:test');
const assert=require('node:assert/strict');
const {safeConversionConfidence,safeBudgetSimulation,safeOutcomeLearning,safeBudgetGuardrail,assertNonExecutable}=require('../intelligence-safety-gates');

test('missing conversion sources are blocked instead of coerced to zero',()=>{
 const result=safeConversionConfidence({metaBookings:2});
 assert.equal(result.confidence,'blocked');
 assert.equal(result.optimization_allowed,false);
 assert.equal(result.reason,'missing_or_invalid_conversion_source');
 assert.equal(result.writes_allowed,false);
});

test('valid aligned conversion sources remain non-writing',()=>{
 const result=safeConversionConfidence({metaBookings:10,ga4Bookings:9});
 assert.equal(result.confidence,'high');
 assert.equal(result.optimization_allowed,true);
 assert.equal(result.writes_allowed,false);
 assert.equal(assertNonExecutable(result),true);
});

test('budget simulation rejects invalid/missing economics',()=>{
 for(const input of [{},{currentBudget:6,conversionRate:-1,cpc:.5},{currentBudget:6,conversionRate:.1,cpc:0},{currentBudget:6,conversionRate:1.2,cpc:.5},{currentBudget:6,conversionRate:.1,cpc:.5,changes:[-1.1]}]){
  const result=safeBudgetSimulation(input);
  assert.equal(result.valid,false);
  assert.deepEqual(result.scenarios,[]);
  assert.equal(result.execution_allowed,false);
  assert.equal(result.writes_allowed,false);
 }
});

test('valid simulations remain bounded non-executable scenarios',()=>{
 const result=safeBudgetSimulation({currentBudget:6,conversionRate:.1,cpc:.5,changes:[-.2,.2]});
 assert.equal(result.valid,true);
 assert.equal(result.scenarios.length,2);
 assert.ok(result.scenarios.every(x=>x.projected_budget>0&&x.projected_conversions>=0&&x.execution_allowed===false));
 assert.equal(assertNonExecutable(result),true);
});

test('missing outcome evidence cannot be learned as a zero baseline',()=>{
 const result=safeOutcomeLearning({after:10,metric:'bookings'});
 assert.equal(result.evaluable,false);
 assert.equal(result.delta,null);
 assert.equal(result.improved,null);
 assert.equal(result.writes_allowed,false);
});

test('budget guardrails remain non-executable even when evidence passes',()=>{
 const result=safeBudgetGuardrail({currentBudget:6,proposedBudget:7,bookings:5,confidence:'high'});
 assert.equal(result.allowed,true);
 assert.equal(result.execution_allowed,false);
 assert.equal(result.writes_allowed,false);
 assert.equal(assertNonExecutable(result),true);
});

test('adversarial nested output with an executable flag is rejected',()=>{
 assert.throws(()=>assertNonExecutable({safe:true,nested:{writes_allowed:true}}),/safety contract violated/);
});