'use strict';
// Operational, read-only snapshot. Does not submit objectives or change runner state.
const breakdowns=require('./google-campaign-breakdowns');
const {collectResponsiveSearchAds}=require('./google-rsa-collector');
const {customerFrom}=require('./google-write-path');
function berlinDay(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
function rawMetricsOnly(rows){return rows.map(({conversions,conversion_value,...row})=>row);}
async function collectEveningRead({customer,now=Date.now(),collectors=breakdowns,rsa=collectResponsiveSearchAds,emit=()=>{}}){
 const day=berlinDay(now),at=new Date(now).toISOString();
 const accounts=await customer.query('SELECT customer.id, customer.currency_code, customer.time_zone FROM customer');
 if(accounts.length!==1||String(accounts[0].customer?.id)!=='7376153998'||accounts[0].customer.currency_code!=='EUR'||accounts[0].customer.time_zone!=='Europe/Berlin')throw Error('account_binding_failed');
 const inventory=await customer.query("SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status = 'ENABLED'");
 if(!inventory.length||inventory.length>20)throw Error('inventory_invalid');
 const campaigns=inventory.map(r=>({campaign_id:String(r.campaign?.id),name:r.campaign?.name,status:r.campaign?.status,budget_micros:Number(r.campaign_budget?.amount_micros)}));
 if(campaigns.some(c=>!/^\d{1,20}$/.test(c.campaign_id)||!Number.isSafeInteger(c.budget_micros)||c.budget_micros<=0))throw Error('inventory_invalid');
 const total=campaigns.reduce((s,c)=>s+c.budget_micros,0);
 const output=(section,campaign_id,rows)=>{
  const clean=rawMetricsOnly(rows); const size=10;
  for(let i=0;i<Math.max(clean.length,1);i+=size)emit({event:'google_evening_read',section,campaign_id,date:day,captured_at:at,time_zone:'Europe/Berlin',offset:i,total_rows:clean.length,rows:clean.slice(i,i+size),writes_executed:false,reporting_may_lag:true});
 };
 output('enabled_inventory',null,[{campaigns,total_budget_micros:total,budget_cage_ok:total<=10000000,hard_daily_cost_cap:false}]);
 const errors=[];
 for(const c of campaigns){
  const input={customer,campaignId:c.campaign_id,start:day,end:day};
  const jobs={overview:()=>collectors.collectCampaignOverview(input),search_terms:()=>collectors.collectCampaignSearchTerms(input),keywords:()=>collectors.collectCampaignKeywords(input),devices:()=>collectors.collectCampaignDevices(input),hours:()=>collectors.collectCampaignHours(input),ad_groups:()=>collectors.collectCampaignAdGroups(input),rsa:()=>rsa(input),
   targeting:()=>customer.query(`SELECT campaign.id, campaign.bidding_strategy_type, campaign.geo_target_type_setting.positive_geo_target_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network FROM campaign WHERE campaign.id = ${c.campaign_id}`),
   schedule:()=>customer.query(`SELECT campaign_criterion.criterion_id, campaign_criterion.status, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute, campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute FROM campaign_criterion WHERE campaign.id = ${c.campaign_id} AND campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.status != 'REMOVED'`),
   locations:()=>customer.query(`SELECT campaign_criterion.criterion_id, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units FROM campaign_criterion WHERE campaign.id = ${c.campaign_id} AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY') AND campaign_criterion.status != 'REMOVED'`),
   campaign_negatives:()=>customer.query(`SELECT campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${c.campaign_id} AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign_criterion.status != 'REMOVED'`)};
  for(const [section,fn]of Object.entries(jobs)){
   try{const rows=await fn();if(!Array.isArray(rows)||rows.length>10000)throw Error('invalid_rows');output(section,c.campaign_id,rows);}
   catch{errors.push({campaign_id:c.campaign_id,section});}
  }
 }
 const result={event:'google_evening_read',section:'completion',date:day,captured_at:at,status:errors.length?'partial':'complete',errors,writes_executed:false};emit(result);return result;
}
async function runEveningRead(){if(process.env.GOOGLE_ADS_VALIDATE_WRITE_PATH_ON_START!=='true')return;return collectEveningRead({customer:customerFrom(process.env),emit:r=>console.log(JSON.stringify(r))});}
module.exports={berlinDay,rawMetricsOnly,collectEveningRead,runEveningRead};
