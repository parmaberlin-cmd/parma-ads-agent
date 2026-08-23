const test=require('node:test');
const assert=require('node:assert/strict');
const {funnelTrackingStatus,funnelCompleteness,funnelRates}=require('../ga4-funnel-intelligence');
const {buildFunnelInput}=require('../full-live-shadow-data');
const {buildSanitizedHistoryRecord}=require('../shadow-history-store');
const {buildPublicSourceView}=require('../runtime-public-view');

test('configured reservation_start is not treated as observed when count is zero',()=>{
  const funnel={event_names:['reservation_page_view','reservation_start','booking_completed'],totals:{reservation_page_view:20,reservation_start:0,booking_completed:1}};
  const tracking=funnelTrackingStatus(funnel,['reservation_page_view','reservation_start','booking_completed']);
  assert.equal(tracking.reservation_start.configured,true);
  assert.equal(tracking.reservation_start.observed,false);
  const completeness=funnelCompleteness(funnel,['reservation_page_view','reservation_start','booking_completed']);
  assert.equal(completeness.configuration_complete,true);
  assert.equal(completeness.observation_complete,false);
});

test('funnel rates are null when denominator is unavailable instead of inventing zero',()=>{
  const rates=funnelRates({totals:{reservation_page_view:0,reservation_start:0,booking_completed:0}});
  assert.equal(rates.page_to_start,null);
  assert.equal(rates.start_to_booking,null);
  assert.equal(rates.page_to_booking,null);
});

test('full funnel input fails closed when reservation_start is configured but unobserved',()=>{
  const result=buildFunnelInput({live_sources:{google:{totals:{clicks:12}}}},{access_ok:true,google_cpc_booking_completed:1,funnel:{event_names:['reservation_page_view','reservation_start','booking_completed'],totals:{reservation_page_view:20,reservation_start:0,booking_completed:1},google_cpc:{reservation_page_view:5,reservation_start:0,booking_completed:1}}});
  assert.equal(result.bookingStartedConfigured,true);
  assert.equal(result.bookingStartedObserved,false);
  assert.equal(result.bookingStartedTracked,false);
  assert.equal(result.landingAvailable,true);
});

test('Shadow history records observation, not configuration',()=>{
  const record=buildSanitizedHistoryRecord({snapshot:{data_quality:{confidence:'high'},live_sources:{google:{access_ok:false},meta:{access_ok:true},ga4:{access_ok:true,funnel:{event_names:['reservation_start'],totals:{reservation_start:0}}}}},report:{conversion_integrity:{confidence:'low',status:'unknown'},daily_manager:{primary_priorities:[]},anomalies:[]},generatedAt:'2026-08-23T12:00:00Z'});
  assert.equal(record.tracking.reservation_start,false);
});

test('public tracking view exposes configured and observed separately',()=>{
  const view=buildPublicSourceView({google:{access_ok:false,error:'google_read_failed',diagnostic:{category:'developer_token',reason:'developer_token_invalid'}},meta:{access_ok:true,overview:{}},ga4:{access_ok:true,configuration_complete:true,funnel:{event_names:['reservation_start'],totals:{reservation_start:0}}}});
  assert.equal(view.tracking.reservation_start.configured,true);
  assert.equal(view.tracking.reservation_start.observed,false);
});