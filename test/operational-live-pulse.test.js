const test=require('node:test');
const assert=require('node:assert/strict');
const {berlinDate,summarizeGoogle,summarizeMeta,summarizeGa4,deriveSignals}=require('../operational-live-pulse');
const {publicPulse}=require('../operational-live-pulse-preload');

test('Berlin date uses the business timezone',()=>{assert.equal(berlinDate(new Date('2026-08-25T22:30:00Z')),'2026-08-26');});

test('Google pulse aggregates primary status and reason codes without IDs',()=>{
 const result=summarizeGoogle({access_ok:true,totals:{spend_eur:6,impressions:1000,clicks:20,cpc_eur:.3,conversions:2},campaigns:[{campaign_id:'123456789012',campaign_name:'Dinner Search',status:'ENABLED',primary_status:'LIMITED',primary_status_reasons:['CAMPAIGN_BUDGET_CONSTRAINED','ADS_LIMITED_BY_POLICY'],channel_type:'SEARCH',daily_budget_eur:3.5,impressions:1000,clicks:20,cost_eur:6,average_cpc_eur:.3,conversions:2,search_rank_lost_impression_share:.25}]});
 assert.equal(result.active_campaigns,1);assert.equal(result.campaigns[0].campaign_id,undefined);assert.equal(result.delivery_diagnostics.primary_status_counts.LIMITED,1);assert.equal(result.delivery_diagnostics.primary_reason_counts.ADS_LIMITED_BY_POLICY,1);assert.equal(result.delivery_diagnostics.limited_by_budget,1);assert.equal(result.delivery_diagnostics.high_rank_loss,1);
});

test('Meta pulse keeps only actively delivering rows',()=>{
 const result=summarizeMeta({access_ok:true,overview:{totals:{spend_eur:4,impressions:500,reach_sum:400,clicks:10,ctr_percent:2,cpc_eur:.4,cpm_eur:8},campaign_counts:{active:1},campaigns:[{id:'999999999999',name:'Dinner Reel',status:'ACTIVE',delivery_status:'active',metrics:{spend_eur:4,impressions:500,reach:400,clicks:10,ctr_percent:2,cpc_eur:.4,cpm_eur:8,frequency:1.25}},{id:'8',name:'Old',status:'PAUSED',delivery_status:'paused'}]}});
 assert.equal(result.active_campaigns,1);assert.equal(result.campaigns.length,1);assert.equal(result.campaigns[0].id,undefined);
});

test('GA4 pulse reports booking quality and classified sources',()=>{
 const result=summarizeGa4({access_ok:true,total_booking_completed:3,google_cpc_booking_completed:1,booking_quality:{event_count:3,users:3,sessions:3,events_per_user:1,duplication_risk:false},booking_sources:{google_paid:1,direct:2},funnel:{totals:{reservation_page_view:10,reservation_start:4,booking_completed:3},rates:{page_to_start:.4,start_to_booking:.75,page_to_booking:.3},completeness:{configuration_complete:true,observation_complete:true}}});
 assert.equal(result.booking_completed,3);assert.equal(result.booking_quality.users,3);assert.equal(result.booking_sources.google_paid,1);assert.equal(result.funnel.reservation_start,4);
});

test('signals calculate paid attribution and delivery limitations',()=>{
 const signals=deriveSignals({google:{totals:{spend_eur:5,clicks:12},delivery_diagnostics:{not_eligible_or_limited:1}},meta:{totals:{spend_eur:0,clicks:0}},ga4:{booking_completed:4,booking_quality:{events_per_user:1},booking_sources:{google_paid:1,meta_paid:1,direct:2},funnel:{reservation_page_view:5,reservation_start:2}}});
 assert.equal(signals.ads_delivering,true);assert.equal(signals.google_delivery_limited,true);assert.equal(signals.paid_attributed_bookings,2);assert.equal(signals.paid_booking_share,.5);assert.equal(signals.booking_event_duplication_risk,false);
});

test('public pulse strips campaign rows and remains zero-write',()=>{
 const result=publicPulse({generated_at:'2026-08-25T18:00:00Z',timezone:'Europe/Berlin',today:{date:'2026-08-25',google:{campaigns:[{name:'internal'}],totals:{}},meta:{campaigns:[{name:'internal'}],totals:{}},ga4:{},signals:{}},last_7d:{start:'2026-08-19',end:'2026-08-25',google:{campaigns:[],totals:{}},meta:{campaigns:[],totals:{}},ga4:{},signals:{}}});
 assert.equal(result.today.google.campaigns,undefined);assert.equal(result.today.meta.campaigns,undefined);assert.equal(result.writes_allowed,false);assert.equal(result.execution_allowed,false);assert.equal(result.spend_allowed,false);
});