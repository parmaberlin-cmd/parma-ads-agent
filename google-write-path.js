'use strict';
const { GoogleAdsApi } = require('google-ads-api');
const norm=v=>String(v||'').replace(/\D/g,'');
function configured(env=process.env){return Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_DEVELOPER_TOKEN&&env.GOOGLE_REFRESH_TOKEN&&env.GOOGLE_CUSTOMER_ID)}
function customerFrom(env=process.env){const client=new GoogleAdsApi({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,developer_token:env.GOOGLE_DEVELOPER_TOKEN});return client.Customer({customer_id:norm(env.GOOGLE_CUSTOMER_ID),refresh_token:env.GOOGLE_REFRESH_TOKEN,...(env.GOOGLE_LOGIN_CUSTOMER_ID?{login_customer_id:norm(env.GOOGLE_LOGIN_CUSTOMER_ID)}:{})})}
async function readBudgetInventory(customer){const rows=await customer.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.campaign_budget, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'`);return (rows||[]).map(r=>({campaign_id:String(r.campaign.id),campaign_name:r.campaign.name||null,status:r.campaign.status,channel_type:r.campaign.advertising_channel_type,budget_resource_name:String(r.campaign_budget?.resource_name||r.campaign?.campaign_budget||''),amount_micros:Number(r.campaign_budget?.amount_micros||0),explicitly_shared:r.campaign_budget?.explicitly_shared===true}))}
// This checks configured average budgets, NOT a hard actual-spend ceiling.
function validateInventory(rows,{maxTotalMicros=10_000_000}={}){
  const blockers=[];
  if(!Number.isSafeInteger(maxTotalMicros)||maxTotalMicros<=0)
    return {ok:false,blockers:['invalid_budget_limit']};
  if(!Array.isArray(rows)||!rows.length)
    return {ok:false,blockers:['inventory_empty']};
  if(rows.some(r=>!r||typeof r!=='object'))
    return {ok:false,blockers:['invalid_inventory_row']};
  if(rows.some(r=>!new RegExp('^customers/[0-9]+/campaignBudgets/[0-9]+$').test(r.budget_resource_name)))
    blockers.push('budget_resource_missing');
  if(rows.some(r=>!new RegExp('^[0-9]{1,20}$').test(r.campaign_id)))
    blockers.push('invalid_campaign_id');
  if(new Set(rows.map(r=>r.campaign_id)).size!==rows.length)
    blockers.push('duplicate_campaign');
  if(rows.some(r=>!['ENABLED','PAUSED',2,3].includes(r.status)))
    blockers.push('unknown_campaign_status');
  if(rows.some(r=>!Number.isSafeInteger(r.amount_micros)||r.amount_micros<=0))
    blockers.push('invalid_budget');
  if(rows.some(r=>typeof r.explicitly_shared!=='boolean'))
    blockers.push('unknown_budget_sharing');
  const names=rows.map(r=>r.budget_resource_name);
  if(rows.some(r=>r.explicitly_shared)||new Set(names).size!==names.length)
    blockers.push('shared_budget_requires_review');
  if(blockers.length)return {ok:false,blockers};
  const enabled=rows.filter(r=>r.status==='ENABLED'||r.status===2);
  const total=enabled.reduce((s,r)=>s+BigInt(r.amount_micros),0n);
  if(total>BigInt(Number.MAX_SAFE_INTEGER))blockers.push('budget_total_overflow');
  if(total>BigInt(maxTotalMicros))blockers.push('current_enabled_budget_above_owner_cap');
  return {ok:blockers.length===0,blockers,
    total_enabled_budget_micros:total<=BigInt(Number.MAX_SAFE_INTEGER)?Number(total):null,
    enabled_count:enabled.length,hard_daily_spend_cap_verified:false};
}
async function validateWritePath({env=process.env,customer,maxTotalMicros=10_000_000}={}){const out={success:false,mode:'validate_only',writes_executed:false,spend_changed:false,owner_cap_micros:maxTotalMicros,hard_daily_spend_cap_verified:false,execution_allowed:false,blockers:[]};if(!configured(env)){out.blockers.push('google_configuration_incomplete');return out}if(env.GOOGLE_ADS_WRITE_KILL_SWITCH==='true'){out.blockers.push('kill_switch_active');return out}customer=customer||customerFrom(env);const first=await readBudgetInventory(customer);const check=validateInventory(first,{maxTotalMicros});if(!check.ok){out.blockers.push(...check.blockers);return{...out,inventory:check}}const second=await readBudgetInventory(customer);if(JSON.stringify(first)!==JSON.stringify(second)){out.blockers.push('inventory_changed_between_reads');return out}const target=second.find(r=>r.status==='ENABLED'||r.status===2)||second[0];const op={entity:'campaign_budget',operation:'update',resource:{resource_name:target.budget_resource_name,amount_micros:target.amount_micros}};await customer.mutateResources([op],{validate_only:true,partial_failure:false});const after=await readBudgetInventory(customer);if(JSON.stringify(second)!==JSON.stringify(after)){out.blockers.push('validate_only_changed_provider_state');return out}return{...out,success:true,mutation_permission_validated:true,inventory:check,target_campaign_id:target.campaign_id}}
module.exports={configured,customerFrom,readBudgetInventory,validateInventory,validateWritePath};
