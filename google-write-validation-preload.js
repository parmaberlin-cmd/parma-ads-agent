'use strict';
const { runRuntimePreflight } = require('./google-write-runtime');
setImmediate(() => { runRuntimePreflight().catch(() => {}); });
setImmediate(() => { require('./google-evening-read').runEveningRead().catch(() => console.error(JSON.stringify({event:'google_evening_read',section:'completion',status:'blocked',reason:'read_failed',writes_executed:false}))); });
if(process.env.GOOGLE_CONTROLLED_BUDGET_JOB==='true')setImmediate(async()=>{
  try{
    const {runControlledBudgetJob}=require('./google-controlled-runner');
    const action=process.env.GOOGLE_CONTROLLED_BUDGET_ACTION?JSON.parse(process.env.GOOGLE_CONTROLLED_BUDGET_ACTION):null;
    const result=await runControlledBudgetJob({action});
    console.log(JSON.stringify({event:'google_controlled_budget_job',...result}));
  }catch{console.error(JSON.stringify({event:'google_controlled_budget_job',status:'blocked',blockers:['runtime_job_failed'],writes_executed:'unknown'}));}
});
