const test=require("node:test");
const assert=require("node:assert/strict");
const {buildDashboardModel}=require("../dashboard-model");

test("dashboard model stays read-only and surfaces source health",()=>{const d=buildDashboardModel({input:{now:"2026-08-23T10:00:00Z",live_sources:{google:{access_ok:true},ga4:{access_ok:false},meta:{access_ok:true}},current:{spend:12,clicks:20},conversions:{google_ads_conversions:3,booking_completed:null}},report:{mode:"shadow",conversion_integrity:{status:"unverified"},funnel:{status:"attention_required"},waste:{estimated_waste_eur:4},opportunities:[{}],search_term_recommendations:[{}],daily_manager:{primary_priorities:[],authorization_required:false},safety_gate:{reasons:["ga4_unavailable"]}}});assert.equal(d.writes_allowed,false);assert.equal(d.health.google,"ok");assert.equal(d.health.ga4,"blocked");assert.equal(d.safety.automation_allowed,false);});
