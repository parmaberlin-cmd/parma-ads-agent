const test=require('node:test');
const assert=require('node:assert/strict');
const {buildLateDinnerPausedDraft,lateDinnerPublicSummary}=require('../meta-late-dinner');

const input={pageId:'123',instagramUserId:'456',sourceInstagramMediaId:'789',latitude:52.5,longitude:13.44,startsAt:'2026-08-26T18:00:00.000Z',dsaBeneficiary:'Parma di Vinibenedetti',dsaPayor:'Parma di Vinibenedetti'};

test('Late Dinner draft is complete, bounded and PAUSED only',()=>{
 const draft=buildLateDinnerPausedDraft(input);
 assert.match(draft.campaign.name,/Late Dinner/);
 assert.equal(draft.campaign.status,'PAUSED');
 assert.equal(draft.adSet.status,'PAUSED');
 assert.equal(draft.ad.status,'PAUSED');
 assert.equal(draft.budget.daily_eur,6);
 assert.equal(draft.adSet.adset_schedule[0].start_minute,1200);
 assert.equal(draft.adSet.adset_schedule[0].end_minute,1380);
 assert.equal(draft.adSet.targeting.geo_locations.custom_locations[0].radius,3);
 assert.deepEqual(draft.adSet.targeting.publisher_platforms,['instagram']);
 assert.equal(JSON.stringify(draft).includes('ACTIVE'),false);
});

test('public summary cannot authorize activation or spend',()=>{
 const summary=lateDinnerPublicSummary(buildLateDinnerPausedDraft(input));
 assert.equal(summary.reel_asset_configured,true);
 assert.equal(summary.activation_allowed,false);
 assert.equal(summary.spend_allowed,false);
 assert.equal(summary.daily_budget_eur,6);
});