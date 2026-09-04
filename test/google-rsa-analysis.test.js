const test=require("node:test");
const assert=require("node:assert/strict");
const {analyzeRsa,analyzeRsaSet}=require("../google-rsa-analysis");

test("RSA analyzer flags weak assets but does not trust conversion counts by default",()=>{
  const r=analyzeRsa({ad_id:"1",headlines:["Pizza","Bio Pizza"],descriptions:["Book now"],ad_strength:"AVERAGE",clicks:25,conversions:0,impressions:500});
  assert.equal(r.requires_write,false);
  assert.equal(r.conversion_evidence,"unverified");
  assert.ok(r.issues.some(x=>x.code==="RSA_FEW_HEADLINES"));
  assert.ok(r.issues.some(x=>x.code==="RSA_FEW_DESCRIPTIONS"));
  assert.ok(r.issues.some(x=>x.code==="RSA_AD_STRENGTH_WEAK"));
  assert.ok(r.issues.some(x=>x.code==="RSA_CONVERSION_EVIDENCE_UNVERIFIED"));
  assert.equal(r.issues.some(x=>x.code==="RSA_TRAFFIC_WITHOUT_CONVERSIONS"),false);
});

test("RSA traffic-without-conversions requires explicitly trusted conversion evidence",()=>{
  const r=analyzeRsa({headlines:["Pizza"],descriptions:["Book"],clicks:30,conversions:0},{conversionTrusted:true});
  assert.equal(r.conversion_evidence,"trusted");
  assert.ok(r.issues.some(x=>x.code==="RSA_TRAFFIC_WITHOUT_CONVERSIONS"));
});

test("RSA analyzer detects duplicate headlines",()=>{
  const r=analyzeRsa({headlines:["Pizza Berlin","Pizza Berlin","Bio Pizza Berlin","Pizza Kreuzberg","Pizza Sourdough","Pizza Dinner","Pizza Reservation","Pizza Wine"],descriptions:["One","Two","Three"]});
  assert.ok(r.issues.some(x=>x.code==="RSA_DUPLICATE_HEADLINES"));
});

test("RSA set prioritizes structural severity without conversion trust",()=>{
  const rows=analyzeRsaSet([
    {ad_id:"low",headlines:Array(8).fill(0).map((_,i)=>`Long headline ${i}`),descriptions:["a","b","c"],clicks:2,conversions:0},
    {ad_id:"high",headlines:["Pizza"],descriptions:["a"],clicks:30,conversions:0}
  ]);
  assert.equal(rows[0].ad_id,"high");
  assert.equal(rows[0].conversion_evidence,"unverified");
});

test("RSA analyzer translates numeric Google ad strength enums",()=>{
  const poor=analyzeRsa({ad_strength:4,headlines:Array(8).fill("Long headline"),descriptions:Array(3).fill("Description"),metrics:{}});
  const good=analyzeRsa({ad_strength:6,headlines:Array(8).fill("Long headline"),descriptions:Array(3).fill("Description"),metrics:{}});
  assert.equal(poor.ad_strength,"POOR");
  assert.ok(poor.issues.some(issue=>issue.code==="RSA_AD_STRENGTH_WEAK"));
  assert.equal(good.ad_strength,"GOOD");
});
