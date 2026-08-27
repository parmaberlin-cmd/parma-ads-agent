const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
} = require('../google-campaign-breakdowns');

function customerWith(row, capture) {
  return { async query(q) { capture.push(q); return [row]; } };
}
const args = { campaignId:'23276824770', start:'2026-07-28', end:'2026-08-26' };

test('all collectors are query-only and campaign scoped', async () => {
  const capture=[];
  const customer=customerWith({metrics:{impressions:10,clicks:2,cost_micros:1500000,conversions:1,conversions_value:20},segments:{device:'MOBILE',hour:19,day_of_week:'WEDNESDAY',keyword:{info:{text:'pizza kreuzberg',match_type:'PHRASE'}}},search_term_view:{search_term:'pizza near me'},ad_group_criterion:{keyword:{text:'pizza kreuzberg',match_type:'PHRASE'},status:'ENABLED'},geographic_view:{country_criterion_id:'2276',location_type:'AREA_OF_INTEREST'}},capture);
  await collectCampaignSearchTerms({customer,...args});
  await collectCampaignKeywords({customer,...args});
  await collectCampaignDevices({customer,...args});
  await collectCampaignHours({customer,...args});
  await collectCampaignGeography({customer,...args});
  assert.equal(capture.length,5);
  for (const q of capture) {
    assert.match(q,/SELECT[\s\S]*campaign\.id[\s\S]*FROM/i);
    assert.match(q,/campaign\.id = 23276824770/);
    assert.match(q,/2026-07-28/);
    assert.match(q,/2026-08-26/);
    assert.doesNotMatch(q,/\b(MUTATE|CREATE|UPDATE|REMOVE)\b/i);
  }
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
