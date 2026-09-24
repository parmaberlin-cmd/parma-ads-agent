'use strict';

const { instagramLoginReadTransport } = require('./instagram-organic-read-path');

const SCHEMA='instagram.read_insights.v1';
const ACCOUNT='parma.divinibenedetti';
const ACCOUNT_METRICS=Object.freeze(['reach','views','profile_views','accounts_engaged','total_interactions','follows_and_unfollows','website_clicks']);
const MEDIA_METRICS=Object.freeze(['reach','views','plays','likes','comments','shares','saved','total_interactions','ig_reels_avg_watch_time','ig_reels_video_view_total_time','clips_replays_count','follows']);

function isoDate(value,label){
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z')))throw new TypeError(label+'_must_be_YYYY_MM_DD');
  return s;
}
function rangeDays(since,until){return Math.round((Date.parse(until+'T00:00:00Z')-Date.parse(since+'T00:00:00Z'))/86400000)+1;}
function availability(name,value,extra={}){return {metric_name:name,value:value??null,availability:value===null||value===undefined?'UNAVAILABLE':'AVAILABLE',...extra};}
function valueOfMetric(row){
  if(row==null)return null;
  if(typeof row.total_value?.value==='number')return row.total_value.value;
  const values=Array.isArray(row.values)?row.values:[];
  if(values.length===1&&typeof values[0]?.value==='number')return values[0].value;
  if(values.length&&values.every(v=>typeof v?.value==='number'))return values.reduce((n,v)=>n+v.value,0);
  return null;
}
function normalizeRows(rows,{period,since,until,source,mediaId=null,retrievedAt}){
  const byName=new Map((Array.isArray(rows)?rows:[]).map(r=>[String(r.name||r.title||''),r]));
  const names=mediaId?MEDIA_METRICS:ACCOUNT_METRICS;
  return names.map(name=>{const row=byName.get(name);return availability(name,valueOfMetric(row),{period:row?.period||period,since,until,provider:source,media_id:mediaId,retrieved_at:retrievedAt});});
}
function safeProviderError(error){return {status:Number(error?.response?.status||0)||null,code:error?.response?.data?.error?.code??null,type:error?.response?.data?.error?.type??null,message:String(error?.response?.data?.error?.message||error?.message||'provider_error').slice(0,180)};}
async function readMetricSet(transport,endpoint,metrics,params){
  try{return {data:await transport.get(endpoint,{...params,metric:metrics.join(',')}),error:null};}
  catch(error){return {data:null,error:safeProviderError(error)};}
}
async function readMediaInventory(transport){
  const fields='id,media_type,media_product_type,permalink,timestamp,like_count,comments_count';
  let page=await transport.get('/me/media',{fields,limit:100});const rows=[];let guard=0;
  while(page&&guard++<10){if(Array.isArray(page.data))rows.push(...page.data);const next=page.paging?.next;if(!next)break;const u=new URL(next);const after=u.searchParams.get('after');if(!after)break;page=await transport.get('/me/media',{fields,limit:100,after});}
  return rows;
}
function within(timestamp,since,until){const d=String(timestamp||'').slice(0,10);return d>=since&&d<=until;}
function mediaKind(row){const p=String(row.media_product_type||'').toUpperCase(),t=String(row.media_type||'').toUpperCase();if(p==='REELS')return 'REELS';if(p==='STORY'||p==='STORIES')return 'STORIES';return 'FEED';}
function validateEvidence(evidence,{since,until,focusSince,focusUntil}){
  const errors=[];
  if(evidence.account?.username!==ACCOUNT)errors.push('account_mismatch');
  if(evidence.windows?.days_30?.since!==since||evidence.windows?.days_30?.until!==until)errors.push('window_30_mismatch');
  if(evidence.windows?.days_7?.since!==focusSince||evidence.windows?.days_7?.until!==focusUntil)errors.push('window_7_mismatch');
  if(evidence.writes_allowed!==false||evidence.publishing_allowed!==false||evidence.spend_allowed!==false)errors.push('read_only_invariant_failed');
  const metrics=[...(evidence.account_metrics||[]),...(evidence.content||[]).flatMap(x=>x.metrics||[])];
  for(const m of metrics){if(m.availability==='AVAILABLE'&&typeof m.value==='number'&&m.value<0)errors.push('negative_metric:'+m.metric_name);if(!['AVAILABLE','UNAVAILABLE'].includes(m.availability))errors.push('availability_invalid');}
  if(JSON.stringify(evidence).match(/access_token|api_key|client_secret|app_secret/i))errors.push('secret_shaped_field');
  return {ok:errors.length===0,errors};
}
async function readInstagramInsights({env=process.env,since,until,focusSince,focusUntil,now=Date.now}={}){
  since=isoDate(since,'since');until=isoDate(until,'until');focusSince=isoDate(focusSince,'focus_since');focusUntil=isoDate(focusUntil,'focus_until');
  if(rangeDays(since,until)!==30)throw new TypeError('primary_window_must_be_30_days');
  if(rangeDays(focusSince,focusUntil)!==7)throw new TypeError('focus_window_must_be_7_days');
  if(!env.META_ACCESS_TOKEN){const e=new Error('instagram_configuration_missing');e.code='INSTAGRAM_CONFIGURATION_MISSING';throw e;}
  const transport=instagramLoginReadTransport({accessToken:env.META_ACCESS_TOKEN,apiVersion:String(env.META_API_VERSION||'v19.0')});
  const retrievedAt=new Date(now()).toISOString();
  const account=await transport.get('/me',{fields:'id,user_id,username,account_type,media_count,followers_count,follows_count'});
  if(String(account?.username||'').toLowerCase()!==ACCOUNT){const e=new Error('instagram_account_mismatch');e.code='INSTAGRAM_ACCOUNT_MISMATCH';throw e;}
  const inventory=await readMediaInventory(transport);
  const inPrimary=inventory.filter(x=>within(x.timestamp,since,until));
  const account30=await readMetricSet(transport,'/me/insights',ACCOUNT_METRICS,{period:'day',since,until});
  const account7=await readMetricSet(transport,'/me/insights',ACCOUNT_METRICS,{period:'day',since:focusSince,until:focusUntil});
  const content=[];
  for(const media of inPrimary){
    const kind=mediaKind(media);
    const result=await readMetricSet(transport,'/'+String(media.id)+'/insights',MEDIA_METRICS,{period:'lifetime'});
    const metrics=normalizeRows(result.data?.data,{period:'lifetime',since:String(media.timestamp||'').slice(0,10)||null,until,retrievedAt,source:'Meta Instagram API',mediaId:String(media.id)});
    const counts={like_count:media.like_count,comments_count:media.comments_count};
    for(const [name,value] of Object.entries(counts))if(typeof value==='number')metrics.push(availability(name,value,{period:'lifetime',since:String(media.timestamp||'').slice(0,10)||null,until,provider:'Meta Instagram API',media_id:String(media.id),retrieved_at:retrievedAt}));
    content.push({media_id:String(media.id),timestamp:media.timestamp||null,media_type:kind,provider_media_type:media.media_type||null,media_product_type:media.media_product_type||null,permalink:media.permalink||null,metrics,provider_error:result.error});
  }
  const raw={account:{id:account.id||account.user_id||null,username:account.username,account_type:account.account_type||null,media_count:account.media_count??null,followers_count:account.followers_count??null,follows_count:account.follows_count??null},account_30:account30.data,account_7:account7.data,content_errors:content.filter(x=>x.provider_error).map(x=>({media_id:x.media_id,error:x.provider_error}))};
  const evidence={schema:SCHEMA,account:raw.account,windows:{days_30:{since,until},days_7:{since:focusSince,until:focusUntil}},inventory:{provider_count:inventory.length,period_media_count:inPrimary.length,types:[...new Set(inPrimary.map(mediaKind))],stories_historical_retrievable:inPrimary.some(x=>mediaKind(x)==='STORIES')?'OBSERVED':'UNAVAILABLE_UNLESS_RETURNED_BY_PROVIDER'},account_metrics:[...normalizeRows(account30.data?.data,{period:'day',since,until,retrievedAt,source:'Meta Instagram API'}),...normalizeRows(account7.data?.data,{period:'day',since:focusSince,until:focusUntil,retrievedAt,source:'Meta Instagram API'}),availability('followers_count',typeof account.followers_count==='number'?account.followers_count:null,{period:'current',since:null,until:null,provider:'Meta Instagram API',media_id:null,retrieved_at:retrievedAt})],content,raw_provider_data:raw,derived_analysis:{focus_media_count:inPrimary.filter(x=>within(x.timestamp,focusSince,focusUntil)).length,previous_period_comparison:'NOT_DERIVED_WITHOUT_PROVIDER_BACKED_COMPARABLE_WINDOW'},retrieval_timestamp:retrievedAt,provider_backed:true,contains_secret:false,contains_pii:false,writes_allowed:false,publishing_allowed:false,spend_allowed:false};
  const validation=validateEvidence(evidence,{since,until,focusSince,focusUntil});evidence.validation=validation;
  return {validated:validation.ok,correctable:false,evidence};
}
module.exports={SCHEMA,ACCOUNT,ACCOUNT_METRICS,MEDIA_METRICS,normalizeRows,validateEvidence,readInstagramInsights};
