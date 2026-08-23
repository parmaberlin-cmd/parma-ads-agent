const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitize}=require('../meta-preflight-status');

test('sanitized runtime status reports read readiness while keeping write readiness separate',()=>{
 const result=sanitize({read_only_ready:true,write_ready:false,read_only_blockers:[],write_blockers:['write_gate_enabled'],levels:{level_1_read_green:true,level_1_write_green:false},chain:{safe:true},maximum_attempts:1,account:{readable:true,timezone_name:'America/Los_Angeles',expected_timezone:'Europe/Berlin',schedule_conversion_required:true,schedule_conversion_safe:true,currency:'EUR',expected_currency:'EUR',currency_match:true,account_status_present:true,blockers:[]}});
 assert.equal(result.ready,true);
 assert.equal(result.read_only_ready,true);
 assert.equal(result.write_ready,false);
 assert.deepEqual(result.blockers,[]);
 assert.deepEqual(result.write_blockers,['write_gate_enabled']);
 assert.equal(result.account.schedule_conversion_required,true);
 assert.equal(result.account.schedule_conversion_safe,true);
 assert.equal(result.may_spend,false);
});