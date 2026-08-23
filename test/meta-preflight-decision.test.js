const test=require('node:test');const assert=require('node:assert/strict');const {classifyBlocker,decideNextMetaStep}=require('../meta-preflight-decision');
test('classifies duplicate blocker as duplicates',()=>assert.equal(classifyBlocker('duplicate_campaigns'),'duplicates'));
test('ready preflight still does not grant writes',()=>{const r=decideNextMetaStep({ready:true,blockers:[]});assert.equal(r.state,'ready_for_separate_paused_authorization');assert.equal(r.write_allowed,false)});
test('relationship blockers outrank execution gate blockers',()=>{const r=decideNextMetaStep({ready:false,blockers:['write_gate_enabled','ad_creative_mismatch']});assert.equal(r.primary_blocker_group,'relationship');assert.equal(r.write_allowed,false)});
