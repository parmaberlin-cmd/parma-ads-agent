'use strict';
const {validateWritePath}=require('./google-write-path');
if(process.env.GOOGLE_ADS_VALIDATE_WRITE_PATH_ON_START==='true'){
  setImmediate(async()=>{
    try{const r=await validateWritePath({env:process.env,maxTotalMicros:10_000_000});console.log(JSON.stringify({event:'google_write_path_preflight',success:r.success===true,mode:'validate_only',mutation_permission_validated:r.mutation_permission_validated===true,writes_executed:false,spend_changed:false,owner_cap_eur:10,enabled_campaigns:r.inventory?.enabled_count??null,current_enabled_daily_budget_eur:Number.isFinite(r.inventory?.total_enabled_budget_micros)?r.inventory.total_enabled_budget_micros/1e6:null,blockers:r.blockers||[]}))}catch{console.error(JSON.stringify({event:'google_write_path_preflight',success:false,mode:'validate_only',writes_executed:false,spend_changed:false,owner_cap_eur:10,blockers:['preflight_exception']}))}
  });
}
