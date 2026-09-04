'use strict';
const {collectConfiguredInventory}=require('../google-controlled-inventory-reader');
async function main() {
  const result=await collectConfiguredInventory();
  const campaigns=result.snapshot?.campaigns || [];
  console.log(JSON.stringify({success:result.success,mode:'read_only_inventory',
    campaign_count:campaigns.length,paused_count:campaigns.filter(c=>c.status==='PAUSED').length,
    shared_budget_campaign_count:campaigns.filter(c=>c.shared_budget).length,
    captured_at:result.snapshot?.captured_at || null,blockers:result.blockers,
    conversion_integrity_trusted:false,writes_allowed:false,spend_allowed:false,execution_allowed:false}));
  if (!result.success) process.exitCode=1;
}
if (require.main===module) main().catch(()=>{
  console.log(JSON.stringify({success:false,error:'inventory_diagnostic_failed',writes_allowed:false,spend_allowed:false,execution_allowed:false}));
  process.exitCode=1;
});
module.exports={main};
