const test=require("node:test");
const assert=require("node:assert/strict");
const {buildFunnelSteps,detectFunnelBreaks,discoverUsableFunnel,analyzeFunnel}=require("../funnel-analysis");

test("funnel rates are computed between adjacent steps",()=>{const s=buildFunnelSteps({a:100,b:50,c:10},["a","b","c"]);assert.equal(s[1].from_previous_rate,0.5);assert.equal(s[2].from_previous_rate,0.2);});
test("funnel break detector ignores tiny samples",()=>{const issues=detectFunnelBreaks(buildFunnelSteps({a:4,b:0},["a","b"]));assert.equal(issues.length,0);});
test("critical funnel break is detected with enough traffic",()=>{const issues=detectFunnelBreaks(buildFunnelSteps({a:20,b:1},["a","b"]));assert.equal(issues[0].code,"FUNNEL_BREAK_CRITICAL");});
test("funnel discovery reports missing events rather than inventing them",()=>{const d=discoverUsableFunnel({booking_completed:2},["reservation_start","booking_completed"]);assert.equal(d.complete,false);assert.deepEqual(d.missing,["reservation_start"]);});
test("analysis marks incomplete tracking separately from poor conversion",()=>{const a=analyzeFunnel({counts:{booking_completed:2},eventNames:["reservation_start","booking_completed"]});assert.equal(a.status,"incomplete_tracking");});
