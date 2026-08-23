function classifyBlocker(code){
  if(['configuration_incomplete','invalid_start_time'].includes(code))return 'configuration';
  if(String(code).startsWith('account_'))return 'account';
  if(String(code).includes('duplicate')||String(code).includes('multiple_'))return 'duplicates';
  if(String(code).includes('mismatch')||String(code).includes('not_paused')||String(code).includes('not_resumable'))return 'relationship';
  if(String(code).includes('write_gate')||String(code).includes('approval_token'))return 'execution_gate';
  if(String(code).includes('page')||String(code).includes('instagram')||String(code).includes('reel'))return 'assets';
  if(String(code).includes('payload')||String(code).includes('budget')||String(code).includes('targeting')||String(code).includes('declarations'))return 'payload';
  return 'other';
}
function decideNextMetaStep(result={}){
 const blockers=result.blockers||[];
 if(result.ready&&blockers.length===0)return {state:'ready_for_separate_paused_authorization',next_action:'review_one_shot_paused_test',write_allowed:false};
 const groups=[...new Set(blockers.map(classifyBlocker))];
 const priority=['account','duplicates','relationship','assets','payload','configuration','execution_gate','other'];
 const primary=priority.find(x=>groups.includes(x))||'other';
 return {state:'blocked',primary_blocker_group:primary,blocker_groups:groups,next_action:`resolve_${primary}_blockers`,write_allowed:false};
}
module.exports={classifyBlocker,decideNextMetaStep};
