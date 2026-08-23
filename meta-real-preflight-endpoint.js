const { runMetaRealPreflight }=require('./meta-real-preflight');

function createMetaRealPreflightHandler({checkMetaConfig,prepareDraft,discoverAssets,transport,adAccountId,writeGateEnabled,approvalToken}){
 return async function metaRealPreflightHandler(req,res){
  if(!checkMetaConfig(res))return;
  const startsAt=req.query?.starts_at;
  try{
   const [draft,assets]=await Promise.all([prepareDraft(startsAt),discoverAssets()]);
   const result=await runMetaRealPreflight({transport,adAccountId,draft,assets,writeGateEnabled,approvalTokenOk:req.query?.approval_token===approvalToken});
   return res.status(result.ready?200:409).json({...result,write_operation_performed:false,activates_spend:false});
  }catch(error){return res.status(error instanceof TypeError?400:500).json({success:false,mode:'read_only',ready:false,error:{message:String(error?.message||'meta_preflight_failed').slice(0,200)},write_operation_performed:false,activates_spend:false});}
 };
}
module.exports={createMetaRealPreflightHandler};
