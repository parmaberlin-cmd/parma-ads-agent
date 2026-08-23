const TERMINAL = new Set(["verified","rejected","cancelled"]);
const ALLOWED = {
  proposed: new Set(["approved","rejected","cancelled"]),
  approved: new Set(["execution_pending","cancelled"]),
  execution_pending: new Set(["executed","cancelled"]),
  executed: new Set(["verified"]),
  verified: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
};

function createDecision({id,channel,action,reason,requiresHumanApproval=true,mode="shadow",now=new Date()}={}){
  if(!id||!channel||!action||!reason)throw new TypeError("id, channel, action and reason are required");
  if(mode!=="shadow")throw new Error("decision lifecycle is shadow-only");
  return {id:String(id),channel,action,reason,mode:"shadow",requires_human_approval:Boolean(requiresHumanApproval),status:"proposed",created_at:now.toISOString(),updated_at:now.toISOString(),history:[{status:"proposed",at:now.toISOString()}],external_execution:false};
}

function transitionDecision(decision,nextStatus,{now=new Date(),note=null}={}){
  if(!decision||!ALLOWED[decision.status])throw new TypeError("valid decision is required");
  if(TERMINAL.has(decision.status))throw new Error(`decision is terminal: ${decision.status}`);
  if(!ALLOWED[decision.status].has(nextStatus))throw new Error(`invalid transition ${decision.status} -> ${nextStatus}`);
  if(nextStatus==="approved"&&decision.requires_human_approval!==true)throw new Error("approval contract missing");
  if(nextStatus==="executed")throw new Error("shadow lifecycle cannot execute external actions");
  return {...decision,status:nextStatus,updated_at:now.toISOString(),history:[...decision.history,{status:nextStatus,at:now.toISOString(),...(note?{note:String(note)}:{})}],external_execution:false};
}

function buildJournalEntry(decision){
  return {decision_id:decision.id,channel:decision.channel,action:decision.action,reason:decision.reason,mode:decision.mode,status:decision.status,requires_human_approval:decision.requires_human_approval,external_execution:false,history:decision.history.map(x=>({...x}))};
}

module.exports={createDecision,transitionDecision,buildJournalEntry};
