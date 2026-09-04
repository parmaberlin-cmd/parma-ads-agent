'use strict';
// Owner clarification 2026-09-04: enabled average daily BUDGET, not actual daily COST.
function configuredBudgetGuard(snapshot, action) {
  if(snapshot?.account_inventory_complete!==true||snapshot.currency!=='EUR'||!Array.isArray(snapshot.campaigns)||!snapshot.campaigns.length)throw Error('complete_inventory_required');
  const ids=new Set(),budgets=new Set();let before=0n,after=0n,found=false;
  for(const c of snapshot.campaigns){
    if(!c||!['ENABLED','PAUSED'].includes(c.status)||c.shared_budget!==false||!Number.isSafeInteger(c.daily_budget_micros)||c.daily_budget_micros<=0||ids.has(c.campaign_id)||budgets.has(c.budget_id))throw Error('invalid_budget_inventory');
    ids.add(c.campaign_id);budgets.add(c.budget_id);
    let next=c.daily_budget_micros;
    if(c.campaign_id===action?.campaign_id){found=true;if(action.type!=='set_daily_budget'||!Number.isSafeInteger(action.amount_micros)||action.amount_micros<=0)throw Error('invalid_budget_action');next=action.amount_micros;}
    if(c.status==='ENABLED'){before+=BigInt(c.daily_budget_micros);after+=BigInt(next);}
  }
  if(!found)throw Error('campaign_missing');
  if(before>10000000n||after>10000000n)throw Error('enabled_budget_cap_exceeded');
  return {limit_semantics:'enabled_configured_daily_budget',cap_micros:10000000,before_micros:Number(before),after_micros:Number(after),hard_daily_cost_cap:false};
}
module.exports={configuredBudgetGuard};
