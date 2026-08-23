const test=require('node:test');
const assert=require('node:assert/strict');
const {META_API_VERSION,buildPausedReservationDraft,metaCompatibilitySummary}=require('../meta-paused-draft-next');
const {normalizeApiVersion,runtimeConfig}=require('../meta-runtime-preflight');

function validInput(){return{pageId:'101',instagramUserId:'202',sourceInstagramMediaId:'303',latitude:52.5,longitude:13.44,startsAt:'2026-08-24T15:00:00.000Z',dsaBeneficiary:'PARMA DI VINI BENEDETTI',dsaPayor:'PARMA DI VINI BENEDETTI'};}

test('current compatibility builder explicitly disables Advantage Audience',()=>{const draft=buildPausedReservationDraft(validInput());assert.deepEqual(draft.adSet.targeting.targeting_automation,{advantage_audience:0});assert.equal(draft.campaign.status,'PAUSED');assert.equal(draft.adSet.status,'PAUSED');assert.equal(draft.ad.status,'PAUSED');});
test('Meta compatibility defaults to current pinned generation',()=>{assert.equal(META_API_VERSION,'v26.0');assert.equal(runtimeConfig({}).apiVersion,'v26.0');assert.equal(normalizeApiVersion('garbage'),'v26.0');assert.equal(normalizeApiVersion('v26.0'),'v26.0');});
test('compatibility summary remains non-activating',()=>{assert.deepEqual(metaCompatibilitySummary(),{api_version:'v26.0',paused_only:true,targeting_automation_explicit:true,advantage_audience:0,known_error_addressed:1870227});});
