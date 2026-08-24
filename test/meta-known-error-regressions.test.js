const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPausedReservationDraft}=require('../meta-paused-draft-next');
const {buildConservativePausedPayloads}=require('../meta-safe-payload');
const {validatePayloadSet}=require('../meta-payload-contract');

test('Meta payload addresses known 4834011, 3858081 and 1870227 requirements',()=>{
 const draft=buildPausedReservationDraft({pageId:'1',instagramUserId:'2',sourceInstagramMediaId:'3',latitude:52.5,longitude:13.44,startsAt:'2026-09-01T15:00:00.000Z',dsaBeneficiary:'Parma di Vinibenedetti',dsaPayor:'Parma di Vinibenedetti'});
 const payloads=buildConservativePausedPayloads(draft,{});
 assert.equal(payloads.campaign.is_adset_budget_sharing_enabled,false);
 assert.equal(payloads.adset.dsa_beneficiary,'Parma di Vinibenedetti');
 assert.equal(payloads.adset.dsa_payor,'Parma di Vinibenedetti');
 assert.equal(payloads.adset.targeting.targeting_automation.advantage_audience,0);
 assert.equal(validatePayloadSet(payloads).valid,true);
 assert.equal(JSON.stringify(payloads).includes('"ACTIVE"'),false);
});
