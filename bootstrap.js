const realExpress = require("express");
const { runLiveShadowReport } = require("./live-shadow-runtime");

const state = {
  status: "starting",
  started_at: new Date().toISOString(),
  finished_at: null,
  result: null,
  error: null,
};

function authorized(req){
  const supplied=req.headers["x-api-key"]||String(req.headers["authorization"]||"").replace(/^Bearer\s+/i,"");
  return Boolean(process.env.PARMA_AGENT_API_KEY&&supplied===process.env.PARMA_AGENT_API_KEY);
}

function wrappedExpress(...args){
  const app=realExpress(...args);
  app.get("/tools/agent/shadow/live",(req,res)=>{
    if(!authorized(req)) return res.status(401).json({success:false,error:"Unauthorized"});
    if(state.status==="starting") return res.status(202).json({success:true,mode:"shadow",status:"running",writes_allowed:false,started_at:state.started_at});
    if(state.status==="failed") return res.status(500).json({success:false,mode:"shadow",status:"failed",writes_allowed:false,started_at:state.started_at,finished_at:state.finished_at,error:state.error});
    return res.json({success:true,mode:"shadow",status:"completed",writes_allowed:false,started_at:state.started_at,finished_at:state.finished_at,...state.result});
  });
  return app;
}
Object.assign(wrappedExpress,realExpress);
require.cache[require.resolve("express")].exports=wrappedExpress;

runLiveShadowReport()
  .then(result=>{
    state.status="completed";
    state.finished_at=new Date().toISOString();
    state.result=result;
    console.log(JSON.stringify({event:"agent_shadow_live_report",success:true,generated_at:result.generated_at,sources:result.sources,decision_status:result.report?.legacy_decision_support?.decision_status||null,priority_count:result.report?.daily_manager?.primary_priorities?.length||0,writes_allowed:false}));
  })
  .catch(error=>{
    state.status="failed";
    state.finished_at=new Date().toISOString();
    state.error=String(error?.message||error);
    console.error(JSON.stringify({event:"agent_shadow_live_report",success:false,error:state.error,writes_allowed:false}));
  });

require("./server");
