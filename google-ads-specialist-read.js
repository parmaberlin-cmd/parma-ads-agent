'use strict';
const { GoogleAdsApi } = require('google-ads-api');
const {
  collectCampaignSearchTerms, collectCampaignKeywords, collectCampaignDevices,
  collectCampaignHours, collectCampaignOverview, collectCampaignAdGroups, collectCampaignGeography,
  collectCampaignNegativeKeywords,
} = require('./google-campaign-breakdowns');
const { collectCampaignConversionActions } = require('./google-conversion-action-breakdown');

function digits(v){ return String(v||'').replace(/\D/g,''); }
function iso(d){ return d.toISOString().slice(0,10); }
function safeRange(input={}){
  const end = input.end ? new Date(`${input.end}T00:00:00Z`) : new Date(Date.now()-86400000);
  const start = input.start ? new Date(`${input.start}T00:00:00Z`) : new Date(end.getTime()-29*86400000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start>end) throw Object.assign(new Error('invalid_date_range'),{status:400});
  const days=Math.floor((end-start)/86400000)+1; if(days<1||days>90) throw Object.assign(new Error('date_range_out_of_bounds'),{status:400});
  return {start:iso(start),end:iso(end),days};
}
function customerFromEnv(env=process.env){
  const required=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_DEVELOPER_TOKEN','GOOGLE_REFRESH_TOKEN','GOOGLE_CUSTOMER_ID'];
  if(required.some(k=>!String(env[k]||'').trim())) throw Object.assign(new Error('google_ads_configuration_missing'),{status:401});
  const api=new GoogleAdsApi({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,developer_token:env.GOOGLE_DEVELOPER_TOKEN});
  const cfg={customer_id:digits(env.GOOGLE_CUSTOMER_ID),refresh_token:env.GOOGLE_REFRESH_TOKEN};
  const login=digits(env.GOOGLE_LOGIN_CUSTOMER_ID); if(login)cfg.login_customer_id=login;
  return api.Customer(cfg);
}
function finite(n){ return Number.isFinite(Number(n)); }
async function collectEnabledCampaignBudgetContext(customer){
  const rows=await customer.query(`
    SELECT campaign.id, campaign.name, campaign.status,
      campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign_budget.status != 'REMOVED'
  `);
  const budgets=new Map();
  for(const row of rows||[]){
    const budgetId=String(row.campaign_budget?.id||'');
    if(!budgetId) continue;
    const amount=Number(row.campaign_budget?.amount_micros||0)/1_000_000;
    if(!budgets.has(budgetId)) budgets.set(budgetId,{budget_id:budgetId,budget_name:row.campaign_budget?.name||null,daily_budget_eur:amount,campaign_ids:[]});
    budgets.get(budgetId).campaign_ids.push(String(row.campaign?.id||''));
  }
  const enabled_budgets=[...budgets.values()].sort((a,b)=>a.budget_id.localeCompare(b.budget_id));
  return {enabled_budget_total_eur:enabled_budgets.reduce((s,b)=>s+Number(b.daily_budget_eur||0),0),enabled_budget_count:enabled_budgets.length,enabled_budgets,shared_budgets_deduplicated:true};
}
function validateEvidence(e,campaignId){
  if(!e||e.campaign_id!==String(campaignId)||!e.overview) return false;
  const nums=[e.overview.daily_budget_eur,e.overview.impressions,e.overview.clicks,e.overview.cost_eur,e.overview.ctr,e.overview.avg_cpc_eur,e.overview.conversions,e.overview.conversion_value];
  if(e.account_budget_context) nums.push(e.account_budget_context.enabled_budget_total_eur);
  if(nums.some(v=>!finite(v)||Number(v)<0)) return false;
  if(e.overview.clicks>e.overview.impressions) return false;
  return !/token|secret|password|api[_-]?key|authorization|bearer/i.test(JSON.stringify(e));
}
async function readCampaign({campaignId,start,end,env=process.env,timeoutMs=25000}){
  if(!/^\d{1,20}$/.test(String(campaignId||''))) throw Object.assign(new Error('invalid_campaign_id'),{status:400});
  const range=safeRange({start,end}), customer=customerFromEnv(env);
  const work=Promise.all([
    collectCampaignOverview({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignAdGroups({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignSearchTerms({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignKeywords({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignDevices({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignHours({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignConversionActions({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectCampaignGeography({customer,campaignId:String(campaignId),start:range.start,end:range.end}),
    collectEnabledCampaignBudgetContext(customer),
    collectCampaignNegativeKeywords({customer,campaignId:String(campaignId)}),
  ]);
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('google_ads_read_timeout'),{code:'ETIMEDOUT',status:504})),timeoutMs));
  const [overviewRows,adGroups,searchTerms,keywords,devices,hours,conversionActions,geography,budgetContext,negativeKeywords]=await Promise.race([work,timeout]);
  if(!Array.isArray(overviewRows)||overviewRows.length===0) throw Object.assign(new Error('campaign_response_empty'),{status:404});
  const o=overviewRows[0], impressions=Number(o.impressions||0), clicks=Number(o.clicks||0), cost=Number(o.cost_eur||0);
  const evidence={
    schema:'google_ads.read_campaign.v1', source:'google_ads', mode:'read_only', campaign_id:String(campaignId),
    date_range:{start:range.start,end:range.end,days:range.days},
    overview:{status:o.status||null,primary_status:o.primary_status||null,channel_type:o.channel_type||null,daily_budget_eur:Number(o.daily_budget_eur||0),impressions,clicks,cost_eur:cost,ctr:impressions?clicks/impressions:0,avg_cpc_eur:clicks?cost/clicks:0,conversions:Number(o.conversions||0),conversion_value:Number(o.conversion_value||0),search_impression_share:o.search_impression_share,search_budget_lost_impression_share:o.search_budget_lost_impression_share,search_rank_lost_impression_share:o.search_rank_lost_impression_share,search_top_impression_share:o.search_top_impression_share,search_absolute_top_impression_share:o.search_absolute_top_impression_share},
    search_terms:searchTerms, keyword_summary:keywords, ad_group_summary:adGroups, hourly_distribution:hours, device_distribution:devices, geographic_distribution:geography,
    account_budget_context:budgetContext,
    negative_keywords:negativeKeywords,
    conversion_metrics:{raw_reported_values:true,actions:conversionActions}, writes_allowed:false,execution_allowed:false,spend_allowed:false,
  };
  return {validated:validateEvidence(evidence,campaignId),correctable:false,evidence};
}
module.exports={readCampaign,validateEvidence,safeRange,customerFromEnv,collectEnabledCampaignBudgetContext};
