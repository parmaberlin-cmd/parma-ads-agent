const { GoogleAdsApi } = require("google-ads-api");
const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
} = require("../google-campaign-breakdowns");

function normalize(value) { return String(value || "").replace(/\D/g, ""); }
function date(value) { return value.toISOString().slice(0, 10); }
function range(days) {
  const end = new Date(); end.setUTCHours(0,0,0,0); end.setUTCDate(end.getUTCDate()-1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate()-(days-1));
  return { start: date(start), end: date(end) };
}
function sum(rows, field) { return rows.reduce((n,row)=>n+Number(row[field]||0),0); }
function top(rows, key, limit=12) {
  return [...rows].sort((a,b)=>Number(b.clicks||0)-Number(a.clicks||0)).slice(0,limit).map(row=>({
    [key]: row[key], impressions:row.impressions, clicks:row.clicks,
    cost_eur:Number(row.cost_eur||0).toFixed(2), conversions:row.conversions
  }));
}

(async () => {
  const campaignId = process.env.GOOGLE_CAMPAIGN_ID || "23276824770";
  const days = Number(process.env.GOOGLE_INTELLIGENCE_DAYS || 30);
  const required = ["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_DEVELOPER_TOKEN","GOOGLE_REFRESH_TOKEN","GOOGLE_CUSTOMER_ID"];
  const missing = required.filter(k=>!process.env[k]);
  if (missing.length) throw new Error(`missing_config:${missing.join(",")}`);
  const api = new GoogleAdsApi({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,developer_token:process.env.GOOGLE_DEVELOPER_TOKEN});
  const cfg={customer_id:normalize(process.env.GOOGLE_CUSTOMER_ID),refresh_token:process.env.GOOGLE_REFRESH_TOKEN};
  const login=normalize(process.env.GOOGLE_LOGIN_CUSTOMER_ID); if(login) cfg.login_customer_id=login;
  const customer=api.Customer(cfg); const {start,end}=range(days);
  const [searchTerms,keywords,devices,hours,geography]=await Promise.all([
    collectCampaignSearchTerms({customer,campaignId,start,end}), collectCampaignKeywords({customer,campaignId,start,end}),
    collectCampaignDevices({customer,campaignId,start,end}), collectCampaignHours({customer,campaignId,start,end}),
    collectCampaignGeography({customer,campaignId,start,end})
  ]);
  const result={success:true,mode:"read_only",campaign_id:campaignId,days,date_range:{start,end},
    counts:{search_terms:searchTerms.length,keywords:keywords.length,devices:devices.length,hours:hours.length,geography:geography.length},
    totals:{impressions:sum(devices,"impressions"),clicks:sum(devices,"clicks"),cost_eur:Number(sum(devices,"cost_eur").toFixed(2)),conversions:sum(devices,"conversions")},
    top_search_terms:top(searchTerms,"search_term"),top_keywords:top(keywords,"keyword"),devices:top(devices,"device",20),
    top_hours:[...hours].sort((a,b)=>Number(b.clicks||0)-Number(a.clicks||0)).slice(0,20),
    top_geography:[...geography].sort((a,b)=>Number(b.clicks||0)-Number(a.clicks||0)).slice(0,20),
    writes_allowed:false,execution_allowed:false,spend_allowed:false};
  console.log(JSON.stringify(result));
})().catch(error=>{ console.error(JSON.stringify({success:false,mode:"read_only",error:String(error.message||error).slice(0,300),writes_allowed:false})); process.exit(1); });
