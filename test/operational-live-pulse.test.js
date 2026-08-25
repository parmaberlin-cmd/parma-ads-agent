const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeGoogle,addPacing}=require('../operational-live-pulse');
const {normalizeCampaignPrimaryStatus,normalizeCampaignPrimaryStatusReason}=require('../google-ads-enums');

test('Google numeric primary status 2 is ELIGIBLE, not limited',()=>{
 assert.equal(normalizeCampaignPrimaryStatus(2),'ELIGIBLE');
 const result=summarizeGoogle({access_ok:true,totals:{spend_eur:.28,impressions:25,clicks:2},campaigns:[{campaign_name:'A',status:'ENABLED',primary_status:2,primary_status_reasons:[],impressions:15,clicks:1,cost_eur:.14},{campaign_name:'B',status:'ENABLED',primary_status:2,primary_status_reasons:[],impressions:10,clicks:1,cost_eur:.14}]});
 assert.equal(result.active_campaigns,2);
 assert.equal(result.delivery_diagnostics.primary_status_counts.ELIGIBLE,2);
 assert.equal(result.delivery_diagnostics.not_eligible_or_limited,0);
 assert.deepEqual(result.delivery_diagnostics.primary_reason_counts,{});
});

test('numeric primary reason enums are normalized to semantic codes',()=>{
 assert.equal(normalizeCampaignPrimaryStatusReason(11),'BUDGET_CONSTRAINED');
 assert.equal(normalizeCampaignPrimaryStatusReason(13),'SEARCH_VOLUME_LIMITED');
 const result=summarizeGoogle({access_ok:true,campaigns:[{campaign_name:'A',status:'ENABLED',primary_status:8,primary_status_reasons:[13]}]});
 assert.equal(result.delivery_diagnostics.primary_status_counts.LIMITED,1);
 assert.equal(result.delivery_diagnostics.primary_reason_counts.SEARCH_VOLUME_LIMITED,1);
});

test('pacing compares today with seven-day daily average',()=>{
 const today={google:{totals:{spend_eur:.28,impressions:25,clicks:2}}};
 const last7d={google:{totals:{spend_eur:56.93,impressions:700,clicks:70}}};
 addPacing(today,last7d);
 assert.equal(today.google.pacing.vs_7d_daily_avg.spend_ratio,.034);
 assert.equal(today.google.pacing.vs_7d_daily_avg.impression_ratio,.25);
 assert.equal(today.google.pacing.vs_7d_daily_avg.click_ratio,.2);
});