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
  collectCampaignConfiguredDiagnostics,
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

test('numeric Google enums become readable diagnostic labels', async () => {
  const capture=[];
  const [overview]=await collectCampaignOverview({customer:customerWith({campaign:{id:'23276824770',status:2,primary_status:2,advertising_channel_type:2},metrics:{}},capture),...args});
  const [device]=await collectCampaignDevices({customer:customerWith({segments:{device:2},metrics:{}},capture),...args});
  const [hour]=await collectCampaignHours({customer:customerWith({segments:{day_of_week:6,hour:18},metrics:{}},capture),...args});
  const [geo]=await collectCampaignGeography({customer:customerWith({geographic_view:{location_type:3},metrics:{}},capture),...args});
  assert.deepEqual([overview.status,overview.primary_status,overview.channel_type],['ENABLED','ELIGIBLE','SEARCH']);
  assert.equal(device.device,'MOBILE');
  assert.equal(hour.day_of_week,'FRIDAY');
  assert.equal(geo.location_type,'LOCATION_OF_PRESENCE');
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

test('configured diagnostics expose schedule, targeting, bidding, budget, status reasons and policy signals', async () => {
  const customer = {
    async query(query) {
      if (query.includes('FROM campaign\n') && query.includes('campaign.serving_status')) {
        return [{
          campaign: {
            id: '23276824770',
            name: 'Dinner',
            status: 'ENABLED',
            serving_status: 'SERVING',
            primary_status: 'ELIGIBLE',
            primary_status_reasons: ['NONE'],
            advertising_channel_type: 'SEARCH',
            bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
            maximize_conversions: { target_cpa_micros: 3200000 },
            campaign_budget: 'customers/7376153998/campaignBudgets/44',
          },
          campaign_budget: { id: '44', name: 'Shared Budget', amount_micros: 15000000, explicitly_shared: true, status: 'ENABLED' },
        }];
      }
      if (query.includes("campaign_criterion.type = 'AD_SCHEDULE'")) {
        return [{ campaign_criterion: { criterion_id: '1', status: 'ENABLED', ad_schedule: { day_of_week: 'MONDAY', start_hour: 9, start_minute: 'ZERO', end_hour: 22, end_minute: 'ZERO' } } }];
      }
      if (query.includes("campaign_criterion.type IN ('LOCATION', 'PROXIMITY')")) {
        return [{ campaign_criterion: { criterion_id: '2', type: 'LOCATION', status: 'ENABLED', negative: false, location: { geo_target_constant: 'geoTargetConstants/2276' } } }];
      }
      if (query.includes("campaign_criterion.type = 'LANGUAGE'")) {
        return [{ campaign_criterion: { criterion_id: '3', status: 'ENABLED', negative: false, language: { language_constant: 'languageConstants/1000' } } }];
      }
      if (query.includes('FROM campaign_criterion') && query.includes("campaign_criterion.type,\n        campaign_criterion.status")) {
        return [
          { campaign_criterion: { criterion_id: '1', type: 'AD_SCHEDULE', status: 'ENABLED', negative: false } },
          { campaign_criterion: { criterion_id: '2', type: 'LOCATION', status: 'ENABLED', negative: false } },
          { campaign_criterion: { criterion_id: '3', type: 'LANGUAGE', status: 'ENABLED', negative: false } },
        ];
      }
      if (query.includes('FROM ad_group\n')) {
        return [{ ad_group: { id: '12', name: 'Core', status: 'ENABLED', primary_status: 'ELIGIBLE', primary_status_reasons: [] } }];
      }
      if (query.includes('FROM ad_group_criterion')) {
        return [{ ad_group: { id: '12', name: 'Core' }, ad_group_criterion: {
          criterion_id: '99',
          status: 'ENABLED',
          primary_status: 'ELIGIBLE',
          primary_status_reasons: [],
          system_serving_status: 'ELIGIBLE',
          approval_status: 'APPROVED',
          policy_summary: { approval_status: 'APPROVED', review_status: 'REVIEWED', policy_topic_entries: [] },
          keyword: { text: 'pizza berlin', match_type: 'PHRASE' },
          negative: false,
        } }];
      }
      return [];
    },
  };
  const result = await collectCampaignConfiguredDiagnostics({ customer, campaignId: args.campaignId });
  assert.equal(result.campaign.bidding_strategy.type, 'MAXIMIZE_CONVERSIONS');
  assert.equal(result.campaign.budget.explicitly_shared, true);
  assert.equal(result.ad_schedule.length, 1);
  assert.equal(result.location_targeting[0].geo_target_constant, 'geoTargetConstants/2276');
  assert.equal(result.language_targeting[0].language_constant, 'languageConstants/1000');
  assert.equal(result.keyword_diagnostics[0].policy.approval_status, 'APPROVED');
  assert.equal(result.ad_group_statuses[0].primary_status, 'ELIGIBLE');
});

test('configured diagnostics return empty schedule and detect observable negative-keyword conflicts', async () => {
  const customer = {
    async query(query) {
      if (query.includes('campaign.serving_status')) return [{ campaign: { id: '23276824770', campaign_budget: 'customers/x/campaignBudgets/1' }, campaign_budget: { id: '1' } }];
      if (query.includes('FROM campaign_criterion') && query.includes('campaign_criterion.type,\n        campaign_criterion.status')) return [];
      if (query.includes("campaign_criterion.type = 'AD_SCHEDULE'")) return [];
      if (query.includes("campaign_criterion.type IN ('LOCATION', 'PROXIMITY')")) return [];
      if (query.includes("campaign_criterion.type = 'LANGUAGE'")) return [];
      if (query.includes('FROM ad_group\n')) return [];
      if (query.includes('FROM ad_group_criterion')) {
        return [
          { ad_group: { id: '1', name: 'A' }, ad_group_criterion: { criterion_id: '1', status: 'ENABLED', primary_status: 'ELIGIBLE', keyword: { text: 'pizza berlin', match_type: 'EXACT' }, negative: false } },
          { ad_group: { id: '1', name: 'A' }, ad_group_criterion: { criterion_id: '2', status: 'ENABLED', primary_status: 'ELIGIBLE', keyword: { text: 'pizza berlin', match_type: 'EXACT' }, negative: true } },
        ];
      }
      return [];
    },
  };
  const result = await collectCampaignConfiguredDiagnostics({ customer, campaignId: args.campaignId });
  assert.deepEqual(result.ad_schedule, []);
  assert.equal(result.negative_keyword_conflicts.length, 1);
});
