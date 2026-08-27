const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
  collectCampaignOverview,
  collectCampaignAdGroups,
} = require('../google-campaign-breakdowns');

function customerWith(row, capture) {
  return { async query(q) { capture.push(q); return [row]; } };
}
const args = { campaignId:'23276824770', start:'2026-07-28', end:'2026-08-26' };

test('all collectors are query-only and campaign scoped', async () => {
  const capture=[];
  const customer=customerWith({campaign:{id:'23276824770',name:'Dinner',status:'ENABLED'},campaign_budget:{amount_micros:25000000},ad_group:{id:'12',name:'Core',status:'ENABLED'},metrics:{impressions:10,clicks:2,cost_micros:1500000,conversions:1,conversions_value:20},segments:{device:'MOBILE',hour:19,day_of_week:'WEDNESDAY',keyword:{info:{text:'pizza kreuzberg',match_type:'PHRASE'}}},search_term_view:{search_term:'pizza near me'},ad_group_criterion:{keyword:{text:'pizza kreuzberg',match_type:'PHRASE'},status:'ENABLED'},geographic_view:{country_criterion_id:'2276',location_type:'AREA_OF_INTEREST'}},capture);
  await collectCampaignOverview({customer,...args});
  await collectCampaignAdGroups({customer,...args});
  await collectCampaignSearchTerms({customer,...args});
  await collectCampaignKeywords({customer,...args});
  await collectCampaignDevices({customer,...args});
  await collectCampaignHours({customer,...args});
  await collectCampaignGeography({customer,...args});
  assert.equal(capture.length,7);
  for (const q of capture) {
    assert.match(q,/SELECT[\s\S]*campaign\.id[\s\S]*FROM/i);
    assert.match(q,/campaign\.id = 23276824770/);
    assert.match(q,/2026-07-28/);
    assert.match(q,/2026-08-26/);
    assert.doesNotMatch(q,/\b(MUTATE|CREATE|UPDATE|REMOVE)\b/i);
  }
});

test('overview maps budget and search impression share diagnostics', async () => {
  const capture=[];
  const [row]=await collectCampaignOverview({customer:customerWith({campaign:{id:'23276824770',name:'Dinner',status:'ENABLED',primary_status:'ELIGIBLE',primary_status_reasons:[],advertising_channel_type:'SEARCH'},campaign_budget:{amount_micros:25000000},metrics:{impressions:100,clicks:10,cost_micros:5000000,conversions:2,conversions_value:40,search_impression_share:0.4,search_budget_lost_impression_share:0.15,search_rank_lost_impression_share:0.45,search_top_impression_share:0.3,search_absolute_top_impression_share:0.1}},capture),...args});
  assert.equal(row.daily_budget_eur,25);
  assert.equal(row.search_impression_share,0.4);
  assert.equal(row.search_budget_lost_impression_share,0.15);
  assert.equal(row.search_rank_lost_impression_share,0.45);
  assert.equal(row.cost_eur,5);
});

test('ad groups, search terms and keywords retain their ad-group context', async () => {
  const source={ad_group:{id:'12',name:'Core',status:'ENABLED',primary_status:'ELIGIBLE',primary_status_reasons:[],type:'SEARCH_STANDARD'},search_term_view:{search_term:'pizza near me'},segments:{keyword:{info:{text:'pizza',match_type:'PHRASE'}}},ad_group_criterion:{keyword:{text:'pizza',match_type:'PHRASE'},status:'ENABLED'},metrics:{impressions:10,clicks:2,cost_micros:1000000,conversions:1,conversions_value:20}};
  const capture=[];
  const [group]=await collectCampaignAdGroups({customer:customerWith(source,capture),...args});
  const [term]=await collectCampaignSearchTerms({customer:customerWith(source,capture),...args});
  const [keyword]=await collectCampaignKeywords({customer:customerWith(source,capture),...args});
  assert.deepEqual([group.ad_group_id,group.ad_group],['12','Core']);
  assert.deepEqual([term.ad_group_id,term.ad_group],['12','Core']);
  assert.deepEqual([keyword.ad_group_id,keyword.ad_group],['12','Core']);
});

test('metrics convert micros to euros', async () => {
  const capture=[];
  const [row]=await collectCampaignDevices({customer:customerWith({segments:{device:'MOBILE'},metrics:{impressions:10,clicks:2,cost_micros:1500000,conversions:1,conversions_value:20}},capture),...args});
  assert.deepEqual(row,{device:'MOBILE',impressions:10,clicks:2,cost_eur:1.5,conversions:1,conversion_value:20});
});

test('rejects invalid campaign ids and dates before querying', async () => {
  const customer={query:async()=>{throw new Error('must not query')}};
  await assert.rejects(()=>collectCampaignDevices({customer,campaignId:'23 OR 1=1',start:args.start,end:args.end}),/campaignId is invalid/);
  await assert.rejects(()=>collectCampaignDevices({customer,campaignId:args.campaignId,start:'yesterday',end:args.end}),/YYYY-MM-DD/);
});
