'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHORIZATION_ID, CAMPAIGN_NAME, DAILY_BUDGET_MICROS, TOTAL_CAP_MICROS,
  PAUSE_THRESHOLD_MICROS, buildCreateOperations, authorized,
  createLunchCampaign, monitorLunchCampaign,
} = require('../google-ads-lunch-campaign');
const { normalizeObjective } = require('../autonomous-runtime');
const { validSchedule } = require('../recurring-objective-scheduler');
const objectiveRequest = require('../control/objective-requests/lunch-search-campaign-20261006.json');

const NOW = Date.parse('2026-10-06T08:00:00Z');
const grant = () => ({ grant_id: AUTHORIZATION_ID, approved_by: 'Philippe', daily_budget_micros: DAILY_BUDGET_MICROS, total_cap_micros: TOTAL_CAP_MICROS, start_date: '2026-10-06', end_date: '2026-10-19', expires_at: '2026-10-07T22:00:00Z' });

function fixture({ exists = false, status = 'PAUSED', costMicros = 0 } = {}) {
  const state = { exists, status, costMicros };
  const campaign = () => [{ campaign: { id: '999001', name: CAMPAIGN_NAME, status: state.status, start_date_time: '2026-10-06 00:00:00', end_date_time: '2026-10-19 23:59:59', campaign_budget: 'customers/7376153998/campaignBudgets/888001' }, campaign_budget: { amount_micros: DAILY_BUDGET_MICROS }, metrics: { cost_micros: state.costMicros } }];
  const customer = { query: async sql => {
    if (sql.includes('FROM campaign WHERE')) return state.exists ? campaign() : [];
    if (sql.includes('FROM ad_group WHERE')) return [{ ad_group: { id: '999002', name: 'Lunch Kreuzberg', status: 'ENABLED' } }];
    if (sql.includes('FROM ad_group_criterion')) return [['mittagessen kreuzberg','EXACT'],['lunch kreuzberg','PHRASE'],['pizza mittagessen','PHRASE'],['pizza lunch','PHRASE'],['pizza kreuzberg','EXACT'],['pizza near me','PHRASE'],['pizza in meiner nähe','PHRASE'],['restaurant mittagessen kreuzberg','PHRASE']].map(([text, match_type]) => ({ ad_group_criterion: { keyword: { text, match_type }, status: 'ENABLED' } }));
    if (sql.includes("type = 'AD_SCHEDULE'")) return ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(day_of_week => ({ campaign_criterion: { ad_schedule: { day_of_week, start_hour: 10, start_minute: 'THIRTY', end_hour: 14, end_minute: 'THIRTY' } } }));
    if (sql.includes('FROM ad_group_ad')) return [{ ad_group_ad: { status: 'ENABLED', ad: { final_urls: ['https://www.parmaberlin.de/en'], responsive_search_ad: { headlines: ['Pizza Lunch in Kreuzberg','Open Daily From 12','Organic Sourdough Pizza','Lunch in Wrangelkiez','Wrangelstraße 90','Bio Pizza in Kreuzberg'].map(text => ({ text })), descriptions: ['Organic sourdough pizza in Wrangelkiez. Open every day from 12:00.','Dine in or takeaway at Wrangelstraße 90. Handmade bio pizza every day.'].map(text => ({ text })) } } } }];
    if (sql.includes("type = 'PROXIMITY'")) return [{ campaign_criterion: { proximity: { radius: 2, radius_units: 'KILOMETERS', geo_point: { latitude_in_micro_degrees: 52499597, longitude_in_micro_degrees: 13439966 } } } }];
    return [];
  }};
  const calls = [];
  const transport = { mutate: async (operations, options) => {
    calls.push({ operations, options });
    if (!options.validateOnly && operations.length > 1) state.exists = true;
    if (!options.validateOnly && operations.length === 1 && operations[0].campaignOperation?.update?.status === 'ENABLED') state.status = 'ENABLED';
    if (!options.validateOnly && operations.length === 1 && operations[0].campaignOperation?.update?.status === 'PAUSED') state.status = 'PAUSED';
    return { request_id: `r${calls.length}`, results: [] };
  }};
  return { state, customer, transport, calls };
}

test('exact authorization is scope, amount, dates and expiry bound', () => {
  assert.equal(authorized(grant(), NOW), true);
  assert.equal(authorized({ ...grant(), total_cap_micros: 71_000_000 }, NOW), false);
  assert.equal(authorized({ ...grant(), expires_at: '2026-10-06T07:00:00Z' }, NOW), false);
});

test('campaign plan is paused, bounded, local and scheduled every day', () => {
  const operations = buildCreateOperations();
  const budget = operations.find(x => x.campaignBudgetOperation).campaignBudgetOperation.create;
  const campaign = operations.find(x => x.campaignOperation).campaignOperation.create;
  const schedules = operations.filter(x => x.campaignCriterionOperation?.create?.adSchedule);
  const proximity = operations.find(x => x.campaignCriterionOperation?.create?.proximity).campaignCriterionOperation.create.proximity;
  assert.equal(budget.amountMicros, '5000000');
  assert.equal(campaign.status, 'PAUSED');
  assert.equal(campaign.startDateTime, '2026-10-06 00:00:00');
  assert.equal(campaign.endDateTime, '2026-10-19 23:59:59');
  assert.equal(campaign.geoTargetTypeSetting.positiveGeoTargetType, 'PRESENCE');
  assert.equal(schedules.length, 7);
  assert.ok(schedules.every(x => x.campaignCriterionOperation.create.adSchedule.startHour === 10 && x.campaignCriterionOperation.create.adSchedule.startMinute === 'THIRTY' && x.campaignCriterionOperation.create.adSchedule.endHour === 14 && x.campaignCriterionOperation.create.adSchedule.endMinute === 'THIRTY'));
  assert.deepEqual(proximity, { radius: 2, radiusUnits: 'KILOMETERS', geoPoint: { latitudeInMicroDegrees: 52499597, longitudeInMicroDegrees: 13439966 } });
});

test('missing authorization blocks access while a closed kill switch still permits read-only reconciliation', async () => {
  let reads = 0;
  const customer = { query: async () => { reads += 1; return []; } };
  const unauthorized = await createLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'false' }, input: {}, now: NOW, customer });
  assert.deepEqual(unauthorized.evidence.blockers, ['exact_authorization_required']);
  assert.equal(reads, 0);
  const blocked = await createLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'true' }, input: grant(), now: NOW, customer });
  assert.deepEqual(blocked.evidence.blockers, ['write_kill_switch_closed']);
  assert.equal(blocked.evidence.provider_write, false);
  assert.equal(blocked.evidence.writes_executed, 0);
  assert.equal(reads, 1);
});

test('closed kill switch returns an existing exact campaign without any mutation', async () => {
  const f = fixture({ exists: true, status: 'PAUSED' });
  const result = await createLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'true' }, input: grant(), now: NOW, customer: f.customer, transport: f.transport });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.status, 'VERIFIED_PAUSED');
  assert.equal(result.evidence.idempotent, true);
  assert.equal(result.evidence.provider_write, false);
  assert.equal(result.evidence.writes_executed, 0);
  assert.equal(f.calls.length, 0);
});

test('create is validate-only then atomic paused write, full read-back, and separate activation', async () => {
  const f = fixture();
  const result = await createLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'false' }, input: grant(), now: NOW, customer: f.customer, transport: f.transport });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.status, 'VERIFIED_ACTIVE');
  assert.equal(result.evidence.writes_executed, 2);
  assert.deepEqual(f.calls.map(x => [x.operations.length, x.options.validateOnly]), [[27, true], [27, false], [1, true], [1, false]]);
  assert.equal(f.calls[1].operations.find(x => x.campaignOperation).campaignOperation.create.status, 'PAUSED');
});

test('existing exact campaign is idempotent and never written again', async () => {
  const f = fixture({ exists: true, status: 'ENABLED' });
  const result = await createLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'false' }, input: grant(), now: NOW, customer: f.customer, transport: f.transport });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.idempotent, true);
  assert.equal(result.evidence.provider_write, false);
  assert.equal(f.calls.length, 0);
});

test('monitor pauses at EUR 60 to preserve one EUR 10 overdelivery envelope', async () => {
  assert.equal(PAUSE_THRESHOLD_MICROS, 60_000_000);
  const f = fixture({ exists: true, status: 'ENABLED', costMicros: PAUSE_THRESHOLD_MICROS });
  const result = await monitorLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'false' }, now: NOW, customer: f.customer, transport: f.transport });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.status, 'PAUSED_AT_GUARDRAIL');
  assert.equal(result.evidence.trigger, 'spend_threshold');
  assert.deepEqual(f.calls.map(x => x.options.validateOnly), [true, false]);
});

test('monitor performs zero writes below threshold', async () => {
  const f = fixture({ exists: true, status: 'ENABLED', costMicros: 20_000_000 });
  const result = await monitorLunchCampaign({ env: { GOOGLE_ADS_WRITE_KILL_SWITCH: 'false' }, now: NOW, customer: f.customer, transport: f.transport });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.pause_required, false);
  assert.equal(f.calls.length, 0);
});

test('objective persists the exact grant and registers a valid monitor schedule', () => {
  const objective = normalizeObjective(objectiveRequest, () => NOW);
  const create = objective.tasks.find(task => task.kind === 'google_ads.create_lunch_campaign');
  const register = objective.tasks.find(task => task.kind === 'runtime.register_recurring');
  assert.equal(create.input.grant_id, AUTHORIZATION_ID);
  assert.equal(create.input.total_cap_micros, 70_000_000);
  assert.equal(validSchedule(register.input.schedule), true);
  assert.equal(register.input.schedule.objective_template.tasks[0].kind, 'google_ads.monitor_lunch_campaign');
});
