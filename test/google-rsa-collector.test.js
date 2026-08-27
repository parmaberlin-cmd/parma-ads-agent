const test=require("node:test");
const assert=require("node:assert/strict");
const {collectResponsiveSearchAds}=require("../google-rsa-collector");

test("RSA collector uses query-only transport and maps assets",async()=>{
  const calls=[];
  const customer={query:async(q)=>{calls.push(q);return [{campaign:{id:1,name:"Dinner"},ad_group:{id:2,name:"Core"},ad_group_ad:{status:"ENABLED",ad_strength:"GOOD",ad:{id:3,responsive_search_ad:{headlines:[{text:"Bio Pizza Berlin"}],descriptions:[{text:"Reserve tonight"}]}}},metrics:{impressions:100,clicks:10,cost_micros:5000000,conversions:2}}];}};
  const rows=await collectResponsiveSearchAds({customer,campaignId:"23276824770",start:"2026-08-01",end:"2026-08-20"});
  assert.equal(calls.length,1);
  assert.match(calls[0],/FROM ad_group_ad/);
  assert.match(calls[0],/RESPONSIVE_SEARCH_AD/);
  assert.match(calls[0],/campaign\.id = 23276824770/);
  assert.doesNotMatch(calls[0],/\b(MUTATE|CREATE|UPDATE|REMOVE)\b/i);
  assert.deepEqual(rows[0].headlines,["Bio Pizza Berlin"]);
  assert.equal(rows[0].cost_eur,5);
  assert.equal(rows[0].conversions,2);
});

test("RSA collector rejects invalid campaign ids before querying",async()=>{
  let called=false;
  await assert.rejects(()=>collectResponsiveSearchAds({customer:{query:async()=>{called=true;return[];}},campaignId:"23 OR 1=1",start:"2026-08-01",end:"2026-08-20"}),/campaignId is invalid/);
  assert.equal(called,false);
});

test("RSA collector rejects invalid dates before querying",async()=>{
  let called=false;
  await assert.rejects(()=>collectResponsiveSearchAds({customer:{query:async()=>{called=true;return[];}},start:"bad",end:"2026-08-20"}),/YYYY-MM-DD/);
  assert.equal(called,false);
});
