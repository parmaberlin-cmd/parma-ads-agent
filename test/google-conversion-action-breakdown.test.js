const test = require('node:test');
const assert = require('node:assert/strict');
const { collectCampaignConversionActions } = require('../google-conversion-action-breakdown');

const args = { campaignId:'23276824770', start:'2026-07-28', end:'2026-08-26' };

function customerWith(rows, capture) {
  return { async query(q) { capture.push(q); return rows; } };
}

test('conversion-action collector is read-only and campaign/date scoped', async () => {
  const capture=[];
  const rows=[{segments:{conversion_action:'customers/1/conversionActions/2',conversion_action_name:'booking_completed'},metrics:{conversions:5,all_conversions:5,conversions_value:5,all_conversions_value:5}}];
  const result=await collectCampaignConversionActions({customer:customerWith(rows,capture),...args});
  assert.equal(capture.length,1);
  assert.match(capture[0],/segments\.conversion_action_name/);
  assert.match(capture[0],/campaign\.id = 23276824770/);
  assert.match(capture[0],/2026-07-28/);
  assert.match(capture[0],/2026-08-26/);
  assert.doesNotMatch(capture[0],/\b(MUTATE|CREATE|UPDATE|REMOVE)\b/i);
  assert.deepEqual(result,[{conversion_action_resource:'customers/1/conversionActions/2',conversion_action_name:'booking_completed',conversions:5,all_conversions:5,conversion_value:5,all_conversion_value:5}]);
});

test('zero-only conversion action rows are omitted', async () => {
  const capture=[];
  const result=await collectCampaignConversionActions({customer:customerWith([{segments:{conversion_action_name:'unused'},metrics:{}}],capture),...args});
  assert.deepEqual(result,[]);
});

test('invalid inputs fail before querying', async () => {
  const customer={query:async()=>{throw new Error('must not query')}};
  await assert.rejects(()=>collectCampaignConversionActions({customer,campaignId:'23 OR 1=1',start:args.start,end:args.end}),/campaignId is invalid/);
  await assert.rejects(()=>collectCampaignConversionActions({customer,campaignId:args.campaignId,start:'yesterday',end:args.end}),/YYYY-MM-DD/);
});
