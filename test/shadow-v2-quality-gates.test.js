const test=require('node:test');const assert=require('node:assert/strict');const q=require('../shadow-v2-quality-gates');
test('stale data blocks decisions',()=>{assert.equal(q.freshnessGate({generatedAt:'2026-01-01T00:00:00Z',now:Date.parse('2026-01-03T00:00:00Z')}).pass,false)});
test('weak samples block optimization',()=>{assert.equal(q.sampleGate({impressions:100,clicks:5,bookings:1}).pass,false)});
test('unhealthy required source blocks',()=>{assert.equal(q.sourceGate({meta:{access_ok:true},ga4:{access_ok:false}}).pass,false)});
test('impossible metrics fail sanity',()=>{assert.equal(q.metricSanityGate({impressions:10,clicks:20,spend:1,bookings:0}).pass,false)});
test('attribution mismatch blocks',()=>{assert.equal(q.attributionGate({metaBookings:10,ga4Bookings:4}).pass,false)});
test('all gates must pass',()=>{const now=Date.parse('2026-08-23T12:00:00Z');const g=q.decisionGate({freshness:{generatedAt:'2026-08-23T11:00:00Z',now},sources:{meta:{access_ok:true},ga4:{access_ok:true}},metrics:{impressions:1000,clicks:40,spend:20,bookings:4},conversions:{metaBookings:4,ga4Bookings:4}});assert.equal(g.allowed,true);assert.equal(g.writes_allowed,false);assert.equal(q.confidenceScore(g).optimization_allowed,true)});
test('recommendation remains non-writing even when evidence is high',()=>{const r=q.safeRecommendation({gate:{allowed:true,failed:[]},action:'increase_budget',reason:'productive'});assert.equal(r.requires_approval,true);assert.equal(r.writes_allowed,false)});
test('blocked recommendation becomes observe only',()=>{const r=q.safeRecommendation({gate:{allowed:false,failed:['sample']},action:'increase_budget'});assert.equal(r.action,'observe_only');assert.equal(r.requires_approval,false)});
