const test=require("node:test");
const assert=require("node:assert/strict");
const {resumePausedReservationDraft}=require("../meta-draft-recovery");
const {APPROVAL_TOKEN}=require("../meta-paused-draft");

const draft={campaign:{status:"PAUSED"},adSet:{status:"PAUSED",targeting:{publisher_platforms:["instagram"]}},creative:{object_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},ad:{status:"PAUSED"},policy:{may_activate:false}};

function transportMock(){
  const posts=[];
  let seq=100;
  return {posts,
    async post(endpoint,payload){posts.push({endpoint,payload});return {id:String(seq++)};},
    async get(endpoint){return {id:endpoint.slice(1),status:"PAUSED",effective_status:"PAUSED"};}
  };
}

test("reuses campaign adset and creative then creates only ad",async()=>{
  const transport=transportMock();
  const result=await resumePausedReservationDraft({transport,adAccountId:"act_123",draft,approvalToken:APPROVAL_TOKEN,existing:{campaign_id:"1",adset_id:"2",creative_id:"3"}});
  assert.equal(result.success,true);
  assert.equal(transport.posts.length,1);
  assert.match(transport.posts[0].endpoint,/\/ads$/);
  assert.equal(result.reused.campaign,true);
  assert.equal(result.reused.adset,true);
  assert.equal(result.reused.creative,true);
});

test("complete existing draft performs verification only",async()=>{
  const transport=transportMock();
  const result=await resumePausedReservationDraft({transport,adAccountId:"act_123",draft,approvalToken:APPROVAL_TOKEN,existing:{campaign_id:"1",adset_id:"2",creative_id:"3",ad_id:"4"}});
  assert.equal(result.success,true);
  assert.equal(transport.posts.length,0);
  assert.equal(result.activates_spend,false);
  assert.equal(result.verification_mode,"read_only");
  assert.equal(result.corrective_writes_performed,false);
});

test("unsafe existing object fails closed without emergency corrective write",async()=>{
  const posts=[];let reads=0;
  const transport={posts,async post(endpoint,payload){posts.push({endpoint,payload});return {id:"9"};},async get(endpoint){reads++;return {id:endpoint.slice(1),status:reads===1?"ACTIVE":"PAUSED",effective_status:"PAUSED"};}};
  await assert.rejects(()=>resumePausedReservationDraft({transport,adAccountId:"act_123",draft,approvalToken:APPROVAL_TOKEN,existing:{campaign_id:"1",adset_id:"2",creative_id:"3",ad_id:"4"}}),e=>e.name==="PartialMetaDraftError"&&e.stage==="verification");
  assert.equal(posts.length,0);
});

test("wrong approval token fails before writes",async()=>{
  const transport=transportMock();
  await assert.rejects(()=>resumePausedReservationDraft({transport,adAccountId:"act_123",draft,approvalToken:"wrong"}));
  assert.equal(transport.posts.length,0);
});
