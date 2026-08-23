const test=require('node:test');
const assert=require('node:assert/strict');
const {scanPublicPayload,assertPublicPayloadSafe}=require('../public-output-safety');

test('safe health payload passes',()=>{
 const payload={success:true,source_health:{google:false,ga4:true,meta:true},diagnostic:{category:'developer_token',reason:'basic_access_required'},writes_allowed:false};
 assert.deepEqual(scanPublicPayload(payload),[]);
 assert.equal(assertPublicPayloadSafe(payload),payload);
});

test('credential-like keys are rejected recursively',()=>{
 for(const key of ['access_token','refresh_token','developer_token','client_secret','api_key','authorization']) assert.throws(()=>assertPublicPayloadSafe({nested:{[key]:'secret'}}),/public payload safety contract violated/);
});

test('advertising object id keys are rejected from public payloads',()=>{
 for(const key of ['campaign_id','adset_id','ad_id','creative_id','ad_account_id','customer_id']) assert.throws(()=>assertPublicPayloadSafe({[key]:'123'}),/public payload safety contract violated/);
});

test('credential-like values are rejected even under innocent keys',()=>{
 const values=['Bearer abcdefghijklmnopqrstuvwxyz','ya29.abcdefghijklmnopqrstuvwxyz','1//abcdefghijklmnopqrstuvwxyz','EAAabcdefghijklmnopqrstuvwxyz','aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc'];
 for(const value of values) assert.throws(()=>assertPublicPayloadSafe({message:value}),/public payload safety contract violated/);
});

test('long numeric advertising-id-like strings are rejected even under innocent keys',()=>{
 assert.throws(()=>assertPublicPayloadSafe({message:'object 123456789012345 failed'}),/public payload safety contract violated/);
});

test('normal dates, rates and short counts remain safe',()=>{
 const payload={generated_at:'2026-08-23T12:00:00Z',count:1234,rate:0.25,message:'google_read_failed'};
 assert.deepEqual(scanPublicPayload(payload),[]);
});