const test = require("node:test");
const assert = require("node:assert/strict");
const { AUTONOMY_LEVELS, validateMetaDraftPlan, authorizeExecution, classifyPartialCreation, buildRollbackPlan, stableKey } = require("../safe-execution");

const validPlan = { status:"PAUSED", destination_url:"https://www.parmaberlin.de/reservations", creative_verified:true, instagram_account_verified:true, daily_budget_eur:6, duration_days:14, placements:["instagram_reels","instagram_stories"] };

test("valid paused Meta plan passes preflight deterministically", () => { const a=validateMetaDraftPlan(validPlan); const b=validateMetaDraftPlan(validPlan); assert.equal(a.ok,true); assert.equal(a.plan_key,b.plan_key); });
test("active or unverified plan fails preflight", () => { const result=validateMetaDraftPlan({...validPlan,status:"ACTIVE",creative_verified:false}); assert.equal(result.ok,false); assert.ok(result.errors.includes("draft_status_must_be_paused")); assert.ok(result.errors.includes("creative_must_be_verified")); });
test("kill switch blocks every write", () => { const preflight=validateMetaDraftPlan(validPlan); assert.equal(authorizeExecution({level:AUTONOMY_LEVELS.SAFE_WRITE,preflight,killSwitch:true}).allowed,false); });
test("safe writes can proceed after preflight but spend writes require human approval", () => { const preflight=validateMetaDraftPlan(validPlan); assert.equal(authorizeExecution({level:AUTONOMY_LEVELS.SAFE_WRITE,preflight}).allowed,true); assert.equal(authorizeExecution({level:AUTONOMY_LEVELS.SPEND_WRITE,preflight}).allowed,false); assert.equal(authorizeExecution({level:AUTONOMY_LEVELS.SPEND_WRITE,preflight,humanApproval:true}).allowed,true); });
test("partial creations expose resume stage and reverse rollback order", () => { const created={campaign:"c",adset:"s"}; assert.deepEqual(classifyPartialCreation(created),{partial:true,complete:false,created_stages:["campaign","adset"],next_stage:"creative"}); assert.deepEqual(buildRollbackPlan(created).map(x=>x.stage),["adset","campaign"]); });
test("idempotency key changes when plan changes", () => { assert.notEqual(stableKey(validPlan),stableKey({...validPlan,daily_budget_eur:7})); });
