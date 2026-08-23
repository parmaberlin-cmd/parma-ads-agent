const test=require("node:test");
const assert=require("node:assert/strict");
const {simulateShadowDays,summarizeSimulation}=require("../shadow-simulation");
const {buildShadowAgentReport}=require("../agent-shadow");

test("multi-day simulation remains read-only through changing evidence",()=>{const days=[
 {now:"2026-08-20T12:00:00Z",conversions:{google_ads_conversions:null,booking_completed:null},access:{google_ok:false,ga4_ok:false}},
 {now:"2026-08-21T12:00:00Z",conversions:{google_ads_conversions:4,booking_completed:4},access:{google_ok:true,ga4_ok:true},search_terms:[{search_term:"bio pizza",matched_keyword:"pizza",clicks:5,cost_eur:4,conversions:2}]},
 {now:"2026-08-22T12:00:00Z",conversions:{google_ads_conversions:5,booking_completed:5},access:{google_ok:true,ga4_ok:true},search_terms:[{search_term:"jobs",matched_keyword:"pizza",clicks:10,cost_eur:12,conversions:0}]}
];const rows=simulateShadowDays({days,buildReport:buildShadowAgentReport});const summary=summarizeSimulation(rows);assert.equal(summary.days,3);assert.equal(summary.all_read_only,true);assert.equal(summary.autonomous_write_days,0);assert.ok(summary.days_with_priorities>=1);});
