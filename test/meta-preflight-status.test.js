const test=require('node:test');const assert=require('node:assert/strict');const {sanitize,futureStart}=require('../meta-preflight-status');

test('sanitized preflight status exposes no ids or credentials',()=>{const r=sanitize({ready:true,levels:{level_1_green:true},chain:{has_campaign:true},blockers:[],maximum_attempts:1,account:{readable:true,timezone_match:true,currency_match:true,account_status_present:true,blockers:[]},token:'secret',campaign_id:'123'});assert.equal(r.ready,true);assert.equal(r.may_activate,false);assert.equal(r.may_spend,false);assert.equal(r.token,undefined);assert.equal(r.campaign_id,undefined)});

test('automatic preflight always uses a safely future start',()=>{const d=new Date(futureStart());assert.ok(d.getTime()>Date.now()+23*60*60*1000)});
