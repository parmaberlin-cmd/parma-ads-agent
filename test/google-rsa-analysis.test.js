const test=require("node:test");
const assert=require("node:assert/strict");
const {analyzeRsa,analyzeRsaSet}=require("../google-rsa-analysis");

test("RSA analyzer flags weak asset coverage and traffic without conversions",()=>{
  const r=analyzeRsa({ad_id:"1",headlines:["Pizza","Bio Pizza"],descriptions:["Book now"],ad_strength:"AVERAGE",clicks:25,conversions:0,impressions:500});
  assert.equal(r.requires_write,false);
  assert.ok(r.issues.some(x=>x.code==="RSA_FEW_HEADLINES"));
  assert.ok(r.issues.some(x=>x.code==="RSA_FEW_DESCRIPTIONS"));
  assert.ok(r.issues.some(x=>x.code==="RSA_AD_STRENGTH_WEAK"));
  assert.ok(r.issues.some(x=>x.code==="RSA_TRAFFIC_WITHOUT_CONVERSIONS"));
});

test("RSA analyzer detects duplicate headlines",()=>{
  const r=analyzeRsa({headlines:["Pizza Berlin","Pizza Berlin","Bio Pizza Berlin","Pizza Kreuzberg","Pizza Sourdough","Pizza Dinner","Pizza Reservation","Pizza Wine"],descriptions:["One","Two","Three"]});
  assert.ok(r.issues.some(x=>x.code==="RSA_DUPLICATE_HEADLINES"));
});

test("RSA set prioritizes high severity issues",()=>{
  const rows=analyzeRsaSet([
    {ad_id:"low",headlines:Array(8).fill(0).map((_,i)=>`Long headline ${i}`),descriptions:["a","b","c"],clicks:2,conversions:0},
    {ad_id:"high",headlines:["Pizza"],descriptions:["a"],clicks:30,conversions:0}
  ]);
  assert.equal(rows[0].ad_id,"high");
});
