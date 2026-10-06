'use strict';

const axios = require('axios');
const { googleAdsVersion } = require('google-ads-api/build/src/version');
const { configured, customerFrom } = require('./google-write-path');

const CUSTOMER_ID = '7376153998';
const AUTHORIZATION_ID = 'philippe-lunch-search-20261006-v1';
const CAMPAIGN_NAME = 'Lunch | Wrangelkiez | 12-15';
const BUDGET_NAME = 'Lunch | Wrangelkiez | EUR 5 daily | 20261006';
const AD_GROUP_NAME = 'Lunch Kreuzberg';
const START_DATE = '2026-10-06';
const END_DATE = '2026-10-19';
const DAILY_BUDGET_MICROS = 5_000_000;
const TOTAL_CAP_MICROS = 70_000_000;
// Google may spend up to twice the average daily budget on an individual day.
// Pausing at EUR 60 leaves one full EUR 10 daily-overdelivery envelope below
// the principal-approved EUR 70 ceiling.
const PAUSE_THRESHOLD_MICROS = 60_000_000;
const FINAL_URL = 'https://www.parmaberlin.de/en';
const LATITUDE_MICRO_DEGREES = 52_499_597;
const LONGITUDE_MICRO_DEGREES = 13_439_966;
const DAYS = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const KEYWORDS = Object.freeze([
  ['mittagessen kreuzberg', 'EXACT'],
  ['lunch kreuzberg', 'PHRASE'],
  ['pizza mittagessen', 'PHRASE'],
  ['pizza lunch', 'PHRASE'],
  ['pizza kreuzberg', 'EXACT'],
  ['pizza near me', 'PHRASE'],
  ['pizza in meiner nähe', 'PHRASE'],
  ['restaurant mittagessen kreuzberg', 'PHRASE'],
]);
const NEGATIVES = Object.freeze(['glutenfrei','tiefkühlpizza','rezept','jobs','stellenangebote']);
const HEADLINES = Object.freeze([
  'Pizza Lunch in Kreuzberg',
  'Open Daily From 12',
  'Organic Sourdough Pizza',
  'Lunch in Wrangelkiez',
  'Wrangelstraße 90',
  'Bio Pizza in Kreuzberg',
]);
const DESCRIPTIONS = Object.freeze([
  'Organic sourdough pizza in Wrangelkiez. Open every day from 12:00.',
  'Dine in or takeaway at Wrangelstraße 90. Handmade bio pizza every day.',
]);
const STATUS = Object.freeze({ 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED' });
const MATCH = Object.freeze({ 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD' });
const DAY = Object.freeze({ 2: 'MONDAY', 3: 'TUESDAY', 4: 'WEDNESDAY', 5: 'THURSDAY', 6: 'FRIDAY', 7: 'SATURDAY', 8: 'SUNDAY' });
const MINUTE = Object.freeze({ 2: 'ZERO', 3: 'FIFTEEN', 4: 'THIRTY', 5: 'FORTY_FIVE' });
const normalize = (value, map = {}) => map[String(value)] || String(value || '').toUpperCase();
const sorted = values => [...values].map(String).sort();

function baseEvidence(extra = {}) {
  return {
    schema: 'google_ads.lunch_campaign.v1', campaign_name: CAMPAIGN_NAME,
    grant_id: AUTHORIZATION_ID, daily_budget_micros: DAILY_BUDGET_MICROS,
    total_cap_micros: TOTAL_CAP_MICROS, start_date: START_DATE, end_date: END_DATE,
    provider_write: false, writes_executed: 0, ...extra,
  };
}

function authorized(input = {}, now = Date.now()) {
  return input.grant_id === AUTHORIZATION_ID &&
    input.approved_by === 'Philippe' &&
    input.daily_budget_micros === DAILY_BUDGET_MICROS &&
    input.total_cap_micros === TOTAL_CAP_MICROS &&
    input.start_date === START_DATE && input.end_date === END_DATE &&
    Number.isFinite(Date.parse(input.expires_at)) && Date.parse(input.expires_at) > now;
}

function temporaryNames() {
  return {
    budget: `customers/${CUSTOMER_ID}/campaignBudgets/-1`,
    campaign: `customers/${CUSTOMER_ID}/campaigns/-2`,
    adGroup: `customers/${CUSTOMER_ID}/adGroups/-3`,
  };
}

function buildCreateOperations() {
  const names = temporaryNames();
  const operations = [
    { campaignBudgetOperation: { create: { resourceName: names.budget, name: BUDGET_NAME, amountMicros: String(DAILY_BUDGET_MICROS), explicitlyShared: false } } },
    { campaignOperation: { create: {
      resourceName: names.campaign, name: CAMPAIGN_NAME, campaignBudget: names.budget,
      advertisingChannelType: 'SEARCH', status: 'PAUSED', manualCpc: {},
      startDateTime: `${START_DATE} 00:00:00`, endDateTime: `${END_DATE} 23:59:59`,
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
    } } },
    { adGroupOperation: { create: { resourceName: names.adGroup, campaign: names.campaign, name: AD_GROUP_NAME, status: 'ENABLED', type: 'SEARCH_STANDARD', cpcBidMicros: '1200000' } } },
  ];
  for (const [text, matchType] of KEYWORDS) operations.push({ adGroupCriterionOperation: { create: { adGroup: names.adGroup, status: 'ENABLED', keyword: { text, matchType }, negative: false } } });
  for (const text of NEGATIVES) operations.push({ campaignCriterionOperation: { create: { campaign: names.campaign, negative: true, keyword: { text, matchType: 'PHRASE' } } } });
  for (const dayOfWeek of DAYS) operations.push({ campaignCriterionOperation: { create: { campaign: names.campaign, adSchedule: { dayOfWeek, startHour: 10, startMinute: 'THIRTY', endHour: 14, endMinute: 'THIRTY' } } } });
  operations.push({ campaignCriterionOperation: { create: { campaign: names.campaign, proximity: { radius: 2, radiusUnits: 'KILOMETERS', geoPoint: { latitudeInMicroDegrees: LATITUDE_MICRO_DEGREES, longitudeInMicroDegrees: LONGITUDE_MICRO_DEGREES } } } } });
  for (const languageConstant of ['languageConstants/1000','languageConstants/1001']) operations.push({ campaignCriterionOperation: { create: { campaign: names.campaign, language: { languageConstant } } } });
  operations.push({ adGroupAdOperation: { create: { adGroup: names.adGroup, status: 'ENABLED', ad: { finalUrls: [FINAL_URL], responsiveSearchAd: { headlines: HEADLINES.map(text => ({ text })), descriptions: DESCRIPTIONS.map(text => ({ text })) } } } } });
  return operations;
}

function restTransport(customer, { http = axios.create(), timeoutMs = 20_000 } = {}) {
  if (!customer || typeof customer.getAccessToken !== 'function') throw new Error('lunch_provider_credentials_unavailable');
  async function mutate(mutateOperations, { validateOnly }) {
    const token = await customer.getAccessToken();
    try {
      const response = await http.request({
        method: 'POST', url: `https://googleads.googleapis.com/${googleAdsVersion}/customers/${CUSTOMER_ID}/googleAds:mutate`,
        timeout: timeoutMs, maxRedirects: 0,
        headers: { ...customer.callHeaders, Authorization: `Bearer ${token}` },
        data: { mutateOperations, partialFailure: false, validateOnly, responseContentType: 'RESOURCE_NAME_ONLY' },
      });
      return { http_status: Number(response.status || 200), request_id: response.data?.requestId || response.headers?.requestId || null, results: response.data?.mutateOperationResponses || [] };
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status >= 400 && status < 500) throw new Error(`lunch_provider_rejected:${status}`);
      throw new Error('lunch_provider_outcome_ambiguous');
    }
  }
  return { mutate };
}

async function readCampaign(customer) {
  const rows = await customer.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.start_date_time, campaign.end_date_time, campaign.campaign_budget, campaign_budget.amount_micros, metrics.cost_micros FROM campaign WHERE campaign.name = '${CAMPAIGN_NAME.replaceAll("'", "\\'")}' AND campaign.status != 'REMOVED' DURING ALL_TIME`);
  if (!rows?.length) return null;
  if (rows.length !== 1) throw new Error('lunch_campaign_name_not_unique');
  const row = rows[0];
  return {
    id: String(row.campaign?.id || ''), name: row.campaign?.name,
    status: normalize(row.campaign?.status, STATUS),
    start_date: String(row.campaign?.start_date_time || '').slice(0, 10), end_date: String(row.campaign?.end_date_time || '').slice(0, 10),
    budget_resource_name: row.campaign?.campaign_budget || null,
    daily_budget_micros: Number(row.campaign_budget?.amount_micros || 0),
    cost_micros: Number(row.metrics?.cost_micros || 0),
  };
}

async function verifyCreated(customer, campaign) {
  if (!campaign || campaign.daily_budget_micros !== DAILY_BUDGET_MICROS || campaign.status !== 'PAUSED') return { verified: false, reason: 'campaign_core_mismatch' };
  if (campaign.start_date !== START_DATE || campaign.end_date !== END_DATE) return { verified: false, reason: 'campaign_dates_mismatch' };
  const campaignId = campaign.id;
  const [groups, keywords, schedules, ads, criteria] = await Promise.all([
    customer.query(`SELECT ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'`),
    customer.query(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`),
    customer.query(`SELECT campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute, campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.status != 'REMOVED'`),
    customer.query(`SELECT ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status != 'REMOVED'`),
    customer.query(`SELECT campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.geo_point.latitude_in_micro_degrees, campaign_criterion.proximity.geo_point.longitude_in_micro_degrees FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'PROXIMITY' AND campaign_criterion.status != 'REMOVED'`),
  ]);
  const actualKeywords = keywords.map(row => [String(row?.ad_group_criterion?.keyword?.text || ''), normalize(row?.ad_group_criterion?.keyword?.match_type, MATCH)]);
  const actualSchedules = schedules.map(row => { const s = row?.campaign_criterion?.ad_schedule || {}; return [normalize(s.day_of_week, DAY), Number(s.start_hour), normalize(s.start_minute, MINUTE), Number(s.end_hour), normalize(s.end_minute, MINUTE)]; });
  const rsa = ads[0]?.ad_group_ad?.ad?.responsive_search_ad || {};
  const proximity = criteria[0]?.campaign_criterion?.proximity || {};
  const ok = groups.length === 1 && groups[0]?.ad_group?.name === AD_GROUP_NAME && normalize(groups[0]?.ad_group?.status, STATUS) === 'ENABLED' &&
    JSON.stringify(actualKeywords.sort()) === JSON.stringify(KEYWORDS.map(value => [...value]).sort()) && keywords.every(row => normalize(row?.ad_group_criterion?.status, STATUS) === 'ENABLED') &&
    JSON.stringify(actualSchedules.sort()) === JSON.stringify(DAYS.map(dayName => [dayName, 10, 'THIRTY', 14, 'THIRTY']).sort()) &&
    ads.length === 1 && normalize(ads[0]?.ad_group_ad?.status, STATUS) === 'ENABLED' &&
    JSON.stringify(sorted((rsa.headlines || []).map(value => value?.text).filter(Boolean))) === JSON.stringify(sorted(HEADLINES)) &&
    JSON.stringify(sorted((rsa.descriptions || []).map(value => value?.text).filter(Boolean))) === JSON.stringify(sorted(DESCRIPTIONS)) &&
    JSON.stringify(sorted(ads[0]?.ad_group_ad?.ad?.final_urls || [])) === JSON.stringify([FINAL_URL]) &&
    criteria.length === 1 && Number(proximity.radius) === 2 && normalize(proximity.radius_units) === 'KILOMETERS' && Number(proximity.geo_point?.latitude_in_micro_degrees) === LATITUDE_MICRO_DEGREES && Number(proximity.geo_point?.longitude_in_micro_degrees) === LONGITUDE_MICRO_DEGREES;
  return { verified: ok, reason: ok ? null : 'campaign_components_mismatch', counts: { ad_groups: groups.length, keywords: keywords.length, schedules: schedules.length, ads: ads.length } };
}

async function activateCampaign(customer, transport, campaign) {
  const resourceName = `customers/${CUSTOMER_ID}/campaigns/${campaign.id}`;
  const operation = [{ campaignOperation: { update: { resourceName, status: 'ENABLED' }, updateMask: 'status' } }];
  await transport.mutate(operation, { validateOnly: true });
  const written = await transport.mutate(operation, { validateOnly: false });
  const after = await readCampaign(customer);
  if (!after || after.status !== 'ENABLED') throw new Error('lunch_activation_readback_failed');
  return { after, request_id: written.request_id };
}

async function createLunchCampaign({ env = process.env, input = {}, now = Date.now(), customer = null, transport = null } = {}) {
  if (!authorized(input, now)) return { validated: false, correctable: false, evidence: baseEvidence({ status: 'BLOCKED', blockers: ['exact_authorization_required'] }) };
  const provider = customer || (configured(env) ? customerFrom(env) : null);
  if (!provider) return { validated: false, correctable: true, evidence: baseEvidence({ status: 'BLOCKED_EXTERNAL', blockers: ['google_provider_credentials_unavailable'] }) };
  // Reconcile provider state before applying the write gate. This query is
  // read-only and lets a closed kill switch distinguish an idempotent existing
  // campaign from a campaign that would require creation.
  const existing = await readCampaign(provider);
  if (existing) {
    if (existing.daily_budget_micros !== DAILY_BUDGET_MICROS || existing.start_date !== START_DATE || existing.end_date !== END_DATE) return { validated: false, correctable: false, evidence: baseEvidence({ status: 'BLOCKED', blockers: ['existing_campaign_drift'], campaign: existing }) };
    return { validated: true, evidence: baseEvidence({ status: existing.status === 'ENABLED' ? 'VERIFIED_ACTIVE' : 'VERIFIED_PAUSED', campaign: existing, idempotent: true }) };
  }
  if (env.GOOGLE_ADS_WRITE_KILL_SWITCH !== 'false') return { validated: false, correctable: true, evidence: baseEvidence({ status: 'BLOCKED', blockers: ['write_kill_switch_closed'] }) };
  const tx = transport || restTransport(provider);
  const operations = buildCreateOperations();
  await tx.mutate(operations, { validateOnly: true });
  const created = await tx.mutate(operations, { validateOnly: false });
  const campaign = await readCampaign(provider);
  const verification = await verifyCreated(provider, campaign);
  if (!verification.verified) return { validated: false, correctable: false, evidence: baseEvidence({ status: 'RECONCILIATION_REQUIRED', provider_write: true, writes_executed: 1, campaign, verification }) };
  const activated = await activateCampaign(provider, tx, campaign);
  return { validated: true, evidence: baseEvidence({ status: 'VERIFIED_ACTIVE', provider_write: true, writes_executed: 2, campaign: activated.after, verification, request_ids: [created.request_id, activated.request_id].filter(Boolean) }) };
}

async function monitorLunchCampaign({ env = process.env, now = Date.now(), customer = null, transport = null } = {}) {
  const provider = customer || (configured(env) ? customerFrom(env) : null);
  if (!provider) return { validated: false, correctable: true, evidence: baseEvidence({ status: 'BLOCKED_EXTERNAL', blockers: ['google_provider_credentials_unavailable'] }) };
  const campaign = await readCampaign(provider);
  if (!campaign) return { validated: false, correctable: true, evidence: baseEvidence({ status: 'NOT_FOUND', blockers: ['lunch_campaign_not_found'] }) };
  const expired = new Date(now).toISOString().slice(0, 10) > END_DATE;
  const capReached = campaign.cost_micros >= PAUSE_THRESHOLD_MICROS;
  if ((!expired && !capReached) || campaign.status !== 'ENABLED') return { validated: true, evidence: baseEvidence({ status: campaign.status, campaign, pause_required: false }) };
  if (env.GOOGLE_ADS_WRITE_KILL_SWITCH !== 'false') return { validated: false, correctable: true, evidence: baseEvidence({ status: 'BLOCKED', blockers: ['write_kill_switch_closed'], campaign }) };
  const tx = transport || restTransport(provider);
  const resourceName = `customers/${CUSTOMER_ID}/campaigns/${campaign.id}`;
  const operation = [{ campaignOperation: { update: { resourceName, status: 'PAUSED' }, updateMask: 'status' } }];
  await tx.mutate(operation, { validateOnly: true });
  await tx.mutate(operation, { validateOnly: false });
  const after = await readCampaign(provider);
  if (after?.status !== 'PAUSED') throw new Error('lunch_pause_readback_failed');
  return { validated: true, evidence: baseEvidence({ status: 'PAUSED_AT_GUARDRAIL', provider_write: true, writes_executed: 1, trigger: expired ? 'end_date' : 'spend_threshold', campaign: after }) };
}

module.exports = { AUTHORIZATION_ID, CAMPAIGN_NAME, DAILY_BUDGET_MICROS, TOTAL_CAP_MICROS, PAUSE_THRESHOLD_MICROS, buildCreateOperations, authorized, createLunchCampaign, monitorLunchCampaign, readCampaign, verifyCreated, restTransport };
