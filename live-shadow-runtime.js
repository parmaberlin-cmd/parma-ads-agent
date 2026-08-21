const axios = require("axios");
const { GoogleAdsApi } = require("google-ads-api");
const { buildMetaOverview, buildGoogleReadiness } = require("./reporting");
const { buildShadowAgentReport } = require("./agent-shadow");

function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function googleCustomer(){
  const client=new GoogleAdsApi({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,developer_token:process.env.GOOGLE_DEVELOPER_TOKEN});
  return client.Customer({customer_id:String(process.env.GOOGLE_CUSTOMER_ID||"").replace(/\D/g,""),refresh_token:process.env.GOOGLE_REFRESH_TOKEN,login_customer_id:String(process.env.GOOGLE_LOGIN_CUSTOMER_ID||"").replace(/\D/g,"")||undefined});
}
function dateRange(days=30){const end=new Date();end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-(days-1));return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};}
function bookingCountFromActions(actions=[]){return actions.filter(a=>/purchase|schedule|booking|reservation|complete_registration/i.test(String(a.action_type||""))).reduce((s,a)=>s+num(a.value),0);}

async function collectMeta(){
  if(!process.env.META_ACCESS_TOKEN||!process.env.META_AD_ACCOUNT_ID) return {ok:false,overview:{},creatives:[],error:"meta_configuration_missing"};
  const account=String(process.env.META_AD_ACCOUNT_ID).startsWith("act_")?String(process.env.META_AD_ACCOUNT_ID):`act_${process.env.META_AD_ACCOUNT_ID}`;
  const api=`https://graph.facebook.com/v19.0`;
  const token=process.env.META_ACCESS_TOKEN;
  const get=async(path,params)=> (await axios.get(`${api}${path}`,{timeout:20000,params:{...params,access_token:token,limit:100}})).data.data||[];
  try{
    const [campaigns,insights,adsets,ads]=await Promise.all([
      get(`/${account}/campaigns`,{fields:"id,name,status,effective_status,objective,created_time,updated_time,daily_budget,lifetime_budget"}),
      get(`/${account}/insights`,{date_preset:"last_30d",level:"campaign",fields:"campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type"}),
      get(`/${account}/adsets`,{fields:"id,campaign_id,status,effective_status,start_time,end_time,created_time,updated_time"}),
      get(`/${account}/insights`,{date_preset:"last_30d",level:"ad",fields:"ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,frequency,actions"}),
    ]);
    const overview=buildMetaOverview(campaigns,insights,adsets);
    const creatives=ads.map(a=>({creative_id:a.ad_id,name:a.ad_name,spend_eur:num(a.spend),impressions:num(a.impressions),clicks:num(a.clicks),frequency:num(a.frequency),bookings:bookingCountFromActions(a.actions)}));
    return {ok:true,overview,creatives};
  }catch(e){return {ok:false,overview:{},creatives:[],error:e?.response?.data?.error?.code||e.message};}
}

async function collectGoogle(){
  const required=["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_DEVELOPER_TOKEN","GOOGLE_REFRESH_TOKEN","GOOGLE_CUSTOMER_ID"];
  if(required.some(k=>!process.env[k])) return {ok:false,google:buildGoogleReadiness(),campaigns:[],search_terms:[],conversions:null,error:"google_configuration_missing"};
  const {start,end}=dateRange(30);
  try{
    const customer=googleCustomer();
    const campaigns=await customer.query(`SELECT campaign.id,campaign.name,campaign.status,campaign.advertising_channel_type,metrics.impressions,metrics.clicks,metrics.cost_micros,metrics.average_cpc,metrics.conversions FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}'`);
    const terms=await customer.query(`SELECT search_term_view.search_term,campaign.name,ad_group.name,metrics.clicks,metrics.cost_micros,metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${start}' AND '${end}'`);
    const normalized=campaigns.map(r=>({campaign:r.campaign.name,channel:"google",impressions:num(r.metrics.impressions),clicks:num(r.metrics.clicks),spend_eur:num(r.metrics.cost_micros)/1e6,conversions:num(r.metrics.conversions),cpc:num(r.metrics.average_cpc)/1e6}));
    const search_terms=terms.map(r=>({search_term:r.search_term_view.search_term,campaign:r.campaign.name,ad_group:r.ad_group.name,clicks:num(r.metrics.clicks),cost_eur:num(r.metrics.cost_micros)/1e6,conversions:num(r.metrics.conversions)}));
    return {ok:true,google:{configuration_complete:true,api_access:"verified_live"},campaigns:normalized,search_terms,conversions:normalized.reduce((s,r)=>s+r.conversions,0)};
  }catch(e){return {ok:false,google:buildGoogleReadiness(),campaigns:[],search_terms:[],conversions:null,error:e?.errors?.[0]?.message||e.message};}
}

async function runLiveShadowReport(){
  const [meta,google]=await Promise.all([collectMeta(),collectGoogle()]);
  const metaTotals=meta.overview?.totals||{};
  const googleTotals=google.campaigns.reduce((a,r)=>({spend:a.spend+r.spend_eur,clicks:a.clicks+r.clicks,conversions:a.conversions+r.conversions}),{spend:0,clicks:0,conversions:0});
  const report=buildShadowAgentReport({
    evidence_window:"last_30d",
    meta:meta.overview,
    google:google.google,
    conversions:{google_ads_conversions:google.conversions,booking_completed:null,google_last_seen_at:new Date().toISOString(),ga4_last_seen_at:null},
    current:{spend:googleTotals.spend+num(metaTotals.spend_eur),clicks:googleTotals.clicks+num(metaTotals.clicks),conversions:googleTotals.conversions,delivery_active:true},
    baseline:{},
    access:{google_ok:google.ok,meta_ok:meta.ok},
    search_terms:google.search_terms,
    creatives:meta.creatives,
    funnel:{landingAvailable:null,adClicks:googleTotals.clicks+num(metaTotals.clicks),landingViews:null,reservationStarts:null,bookings:null},
    budget_inputs:google.campaigns.map(r=>({channel:"google",campaign:r.campaign,spend_eur:r.spend_eur,conversions:r.conversions,target_cpa_eur:null})),
    channel_signals:{google:{clicks:googleTotals.clicks,intent_conversions:googleTotals.conversions},meta:{reach:num(metaTotals.reach),bookings:meta.creatives.reduce((s,r)=>s+r.bookings,0)}},
    business_value:{spendEur:googleTotals.spend+num(metaTotals.spend_eur),bookings:0},
  });
  return {generated_at:new Date().toISOString(),sources:{google:{ok:google.ok,error:google.ok?null:String(google.error)},meta:{ok:meta.ok,error:meta.ok?null:String(meta.error)},ga4:{ok:false,error:"ga4_live_collector_not_connected_yet"}},report};
}

module.exports={runLiveShadowReport,collectMeta,collectGoogle};
