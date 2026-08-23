const axios = require("axios");
const { GoogleAdsApi } = require("google-ads-api");
const { buildMetaOverview, buildGoogleReadiness } = require("./reporting");
const { collectGoogleSearchTerms, collectGoogleKeywords, analyzeSearchTerms, analyzeKeywords } = require("./google-search-intelligence");
const { META_API_VERSION } = require("./meta-paused-draft-next");
const { buildMetaIssueReport } = require("./meta-issue-classification");

function normalizeGoogleCustomerId(value) { return String(value || "").replace(/\D/g, ""); }
function googleConfigured(env = process.env) { return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_DEVELOPER_TOKEN && env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_CUSTOMER_ID); }
function metaConfigured(env = process.env) { return Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID); }
function getDateRange(days = 30, now = new Date()) { const end = new Date(now); end.setUTCHours(0,0,0,0); end.setUTCDate(end.getUTCDate()-1); const start = new Date(end); start.setUTCDate(start.getUTCDate()-(days-1)); return { start:start.toISOString().slice(0,10), end:end.toISOString().slice(0,10) }; }
function googleDiagnosticReason(category,message,code){const text=`${message||''} ${code||''}`;if(category==='developer_token'){if(/basic access|standard access|test account|not approved|access level/i.test(text))return'basic_access_required';if(/invalid|not valid/i.test(text))return'developer_token_invalid';return'developer_token_rejected';}if(category==='oauth')return'oauth_refresh_required';if(category==='account_access')return'account_access_required';if(category==='query')return'query_rejected';if(category==='network')return'transient_network';return'unknown';}
function cleanGoogleDiagnostic(error) { const first=Array.isArray(error?.errors)?error.errors[0]:null; const rawCode=first?.error_code||null; const code=rawCode&&typeof rawCode==="object"?Object.keys(rawCode)[0]||null:rawCode; const message=String(first?.message||error?.message||"google_read_failed").slice(0,180); let category="unknown"; if(/invalid_grant|refresh token|oauth/i.test(message)) category="oauth"; else if(/developer token|DEVELOPER_TOKEN/i.test(message)||/developer_token/i.test(String(code))) category="developer_token"; else if(/login customer|manager|customer.*not enabled|CUSTOMER_NOT_FOUND|USER_PERMISSION_DENIED/i.test(message)||/customer|authorization|permission/i.test(String(code))) category="account_access"; else if(/query|SELECT|GAQL|field/i.test(message)) category="query"; else if(/deadline|timeout|network|ENOTFOUND|ECONN/i.test(message)) category="network"; return {error:"google_read_failed",category,reason:googleDiagnosticReason(category,message,code),code:code||null,message}; }
function sanitizeMetaIssues(issues) { if (!Array.isArray(issues)) return []; return issues.slice(0,20).map((issue)=>({ level:String(issue?.level||"unknown").slice(0,40), code:issue?.error_code == null ? null : String(issue.error_code).slice(0,40), summary:String(issue?.error_summary||issue?.title||"meta_delivery_issue").replace(/[\r\n\t]+/g," ").slice(0,180), message:String(issue?.error_message||issue?.message||"").replace(/[\r\n\t]+/g," ").slice(0,300) })); }
function buildGoogleCustomer(env) { const client=new GoogleAdsApi({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,developer_token:env.GOOGLE_DEVELOPER_TOKEN}); return client.Customer({customer_id:normalizeGoogleCustomerId(env.GOOGLE_CUSTOMER_ID),refresh_token:env.GOOGLE_REFRESH_TOKEN,...(env.GOOGLE_LOGIN_CUSTOMER_ID?{login_customer_id:normalizeGoogleCustomerId(env.GOOGLE_LOGIN_CUSTOMER_ID)}:{})}); }

async function collectGoogleShadowData({env=process.env,days=30,now=new Date()}={}) {
  const collectedAt = now.toISOString();
  if(!googleConfigured(env)) return {access_ok:false,configuration_complete:false,collected_at:collectedAt,error:"google_configuration_incomplete",campaigns:[],totals:null,search_terms:[],keywords:[],search_intelligence_ok:false};
  const customer=buildGoogleCustomer(env);
  const {start,end}=getDateRange(days,now);
  try {
    const rows=await customer.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date BETWEEN '${start}' AND '${end}'`);
    const campaigns=(rows||[]).map(row=>({campaign_id:String(row.campaign.id),campaign_name:row.campaign.name,status:row.campaign.status,channel_type:row.campaign.advertising_channel_type,impressions:Number(row.metrics.impressions||0),clicks:Number(row.metrics.clicks||0),cost_eur:Number(row.metrics.cost_micros||0)/1_000_000,average_cpc_eur:Number(row.metrics.average_cpc||0)/1_000_000,conversions:Number(row.metrics.conversions||0),conversion_value:Number(row.metrics.conversions_value||0)}));
    const totals=campaigns.reduce((a,r)=>({impressions:a.impressions+r.impressions,clicks:a.clicks+r.clicks,spend_eur:a.spend_eur+r.cost_eur,conversions:a.conversions+r.conversions}),{impressions:0,clicks:0,spend_eur:0,conversions:0});
    totals.cpc_eur=totals.clicks?totals.spend_eur/totals.clicks:0;
    let searchTerms=[];let keywords=[];let searchIntelligenceOk=false;let searchIntelligenceDiagnostic=null;
    try { const [terms,keywordRows]=await Promise.all([collectGoogleSearchTerms({customer,start,end}),collectGoogleKeywords({customer,start,end})]);searchTerms=analyzeSearchTerms(terms);keywords=analyzeKeywords(keywordRows);searchIntelligenceOk=true; } catch(error) { searchIntelligenceDiagnostic=cleanGoogleDiagnostic(error); }
    return {access_ok:true,configuration_complete:true,collected_at:collectedAt,period:{start,end},campaigns,totals,search_terms:searchTerms,keywords,search_intelligence_ok:searchIntelligenceOk,search_intelligence_diagnostic:searchIntelligenceDiagnostic};
  } catch(error) {
    return {access_ok:false,configuration_complete:true,collected_at:collectedAt,diagnostic:cleanGoogleDiagnostic(error),error:"google_read_failed",campaigns:[],totals:null,search_terms:[],keywords:[],search_intelligence_ok:false};
  }
}

async function collectMetaShadowData({env=process.env,datePreset="last_30d",now=new Date()}={}) {
  const collectedAt = now.toISOString();
  if(!metaConfigured(env)) return {access_ok:false,configuration_complete:false,collected_at:collectedAt,error:"meta_configuration_incomplete",overview:null};
  const accountId=String(env.META_AD_ACCOUNT_ID).startsWith("act_")?String(env.META_AD_ACCOUNT_ID):`act_${env.META_AD_ACCOUNT_ID}`;
  const candidate=String(env.META_API_VERSION||META_API_VERSION);const apiVersion=/^v\d+\.0$/.test(candidate)?candidate:META_API_VERSION;
  const client=axios.create({baseURL:`https://graph.facebook.com/${apiVersion}`,timeout:20000});
  const getCollection=async(endpoint,params)=>{const response=await client.get(endpoint,{params:{...params,access_token:env.META_ACCESS_TOKEN,limit:100}});return response.data.data||[];};
  try {
    const [campaigns,insights,adsets,ads]=await Promise.all([
      getCollection(`/${accountId}/campaigns`,{fields:"id,name,status,effective_status,objective,created_time,updated_time,issues_info"}),
      getCollection(`/${accountId}/insights`,{date_preset:datePreset,level:"campaign",fields:"campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type"}),
      getCollection(`/${accountId}/adsets`,{fields:"id,campaign_id,status,effective_status,start_time,end_time,created_time,updated_time,issues_info"}),
      getCollection(`/${accountId}/ads`,{fields:"id,campaign_id,adset_id,name,status,effective_status,issues_info"}),
    ]);
    const overview=buildMetaOverview(campaigns,insights,adsets);
    overview.issue_diagnostics={campaigns:campaigns.filter(x=>x.effective_status==="WITH_ISSUES"||x.issues_info?.length).map(x=>({id:String(x.id),name:x.name||null,issues:sanitizeMetaIssues(x.issues_info)})),adsets:adsets.filter(x=>x.effective_status==="WITH_ISSUES"||x.issues_info?.length).map(x=>({id:String(x.id),campaign_id:String(x.campaign_id||""),issues:sanitizeMetaIssues(x.issues_info)})),ads:ads.filter(x=>x.effective_status==="WITH_ISSUES"||x.issues_info?.length).map(x=>({id:String(x.id),campaign_id:String(x.campaign_id||""),adset_id:String(x.adset_id||""),name:x.name||null,issues:sanitizeMetaIssues(x.issues_info)}))};
    overview.issue_report=buildMetaIssueReport(overview.issue_diagnostics);
    return {access_ok:true,configuration_complete:true,collected_at:collectedAt,api_version:apiVersion,date_preset:datePreset,overview};
  } catch(error) {
    return {access_ok:false,configuration_complete:true,collected_at:collectedAt,api_version:apiVersion,error:error?.response?.data?.error?.message||error?.message||"meta_read_failed",overview:null};
  }
}

async function collectLiveShadowInput({env=process.env,days=30,now=new Date()}={}) {
  const [google,meta]=await Promise.all([collectGoogleShadowData({env,days,now}),collectMetaShadowData({env,now})]);
  const googleTotals=google.totals||{};const metaTotals=meta.overview?.totals||{};
  return {
    now:now.toISOString(),evidence_window:`${days}d`,
    google:google.access_ok?{...buildGoogleReadiness(),configuration_complete:true,api_access:"verified",totals:googleTotals,campaigns:google.campaigns}:{...buildGoogleReadiness(),configuration_complete:google.configuration_complete,api_access:"failed",error:google.error},
    meta:meta.overview||{campaign_counts:{},totals:{}},search_terms:google.search_terms||[],keywords:google.keywords||[],
    conversions:{google_ads_conversions:google.access_ok?Number(googleTotals.conversions||0):null,booking_completed:null,google_last_seen_at:google.access_ok?now.toISOString():null,ga4_last_seen_at:null},
    current:{spend:Number(googleTotals.spend_eur||0)+Number(metaTotals.spend_eur||0),clicks:Number(googleTotals.clicks||0)+Number(metaTotals.clicks||0),conversions:Number(googleTotals.conversions||0),cpc:Number(googleTotals.cpc_eur||0),delivery_active:true},
    access:{google_ok:google.access_ok,meta_ok:meta.access_ok,google_search_intelligence_ok:Boolean(google.search_intelligence_ok)},
    budget_inputs:(google.campaigns||[]).filter(c=>c.status==="ENABLED"||c.status===2).map(c=>({channel:"google",campaign:c.campaign_name,spend_eur:c.cost_eur,conversions:c.conversions})),
    channel_signals:{google:{clicks:Number(googleTotals.clicks||0),intent_conversions:Number(googleTotals.conversions||0)},meta:{reach:Number(metaTotals.reach_sum||metaTotals.reach||0),bookings:0}},
    live_sources:{google,meta,ga4:{access_ok:false,reason:"ga4_live_collector_not_configured"}},
  };
}

module.exports={collectGoogleShadowData,collectMetaShadowData,collectLiveShadowInput,getDateRange,googleConfigured,metaConfigured,googleDiagnosticReason,cleanGoogleDiagnostic,sanitizeMetaIssues};