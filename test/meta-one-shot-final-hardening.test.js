const test=require('node:test');const assert=require('node:assert/strict');
const {buildPausedReservationDraft,APPROVAL_TOKEN}=require('../meta-paused-draft');
const {resumePausedReservationDraft}=require('../meta-draft-recovery');
const {buildFinalMetaManifest}=require('../meta-final-manifest');

function draft(){return buildPausedReservationDraft({pageId:'101',instagramUserId:'202',sourceInstagramMediaId:'303',latitude:52.499492,longitude:13.4399793,dailyBudgetEur:6,durationDays:14,startsAt:'2026-08-25T15:00:00.000Z',dsaBeneficiary:'Parma',dsaPayor:'Parma'});}
function assets(){return{page_id:'101',instagram_user_id:'202',source_instagram_media_id:'303'};}

test('unexpected ACTIVE verification fails closed without corrective POST',async()=>{let posts=[];let next=1;const t={post:async(path,payload)=>{posts.push({path,payload});return{id:String(next++)}},get:async(path)=>({id:path.slice(1),status:path==='/2'?'ACTIVE':'PAUSED',effective_status:'PAUSED'})};await assert.rejects(()=>resumePausedReservationDraft({transport:t,adAccountId:'act_999',draft:draft(),approvalToken:APPROVAL_TOKEN}),e=>e.name==='PartialMetaDraftError'&&e.stage==='verification');assert.equal(posts.length,4);assert.equal(posts.some(x=>x.payload?.status==='PAUSED'&&/^\/\d+$/.test(x.path)),false)});

test('fully known partial chain performs verification GETs only',async()=>{let posts=0,gets=0;const t={post:async()=>{posts++;throw new Error('no post expected')},get:async(path)=>{gets++;return{id:path.slice(1),status:'PAUSED',effective_status:'PAUSED'}}};const r=await resumePausedReservationDraft({transport:t,adAccountId:'act_999',draft:draft(),approvalToken:APPROVAL_TOKEN,existing:{campaign_id:'1',adset_id:'2',creative_id:'3',ad_id:'4'}});assert.equal(r.success,true);assert.equal(posts,0);assert.equal(gets,4);assert.equal(r.verification_mode,'read_only');assert.equal(r.corrective_writes_performed,false)});

test('final manifest is deterministic and non activating',()=>{const input={draft:draft(),assets:assets(),writeGateEnabled:true,approvalTokenOk:true};const a=buildFinalMetaManifest(input),b=buildFinalMetaManifest(input);assert.equal(a.fingerprint,b.fingerprint);assert.equal(a.ready,true);assert.equal(a.active_literal_present,false);assert.equal(a.maximum_attempts,1);assert.equal(a.corrective_writes_allowed,false);assert.equal(a.duplicate_creation_allowed,false);assert.equal(a.may_activate,false);assert.equal(a.may_spend,false)});

test('manifest reports deterministic reuse plan',()=>{const r=buildFinalMetaManifest({draft:draft(),assets:assets(),knownPartial:{campaign_id:'1',adset_id:'2'},writeGateEnabled:true,approvalTokenOk:true});assert.equal(r.create_or_reuse.campaign,'reuse');assert.equal(r.create_or_reuse.adset,'reuse');assert.equal(r.create_or_reuse.creative,'create');assert.equal(r.create_or_reuse.ad,'create')});
