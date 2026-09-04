'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createRemoteJWKSet,jwtVerify}=require('jose');
const JWKS=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='parma-autonomous-objective-ingress';
const REPOSITORY='parmaberlin-cmd/parma-ads-agent';
const WORKFLOW='parmaberlin-cmd/parma-ads-agent/.github/workflows/objective-ingress.yml@refs/heads/main';
const rate=new Map();
function stateFile(env=process.env){return path.join(env.RAILWAY_VOLUME_MOUNT_PATH||'/tmp','parma-objective-ingress.json');}
function load(file=stateFile()){if(!fs.existsSync(file))return{version:1,receipts:{},audit:[]};return JSON.parse(fs.readFileSync(file,'utf8'));}
function save(s,file=stateFile()){const tmp=`${file}.${process.pid}.tmp`;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(s)+'\n',{mode:0o600});fs.renameSync(tmp,file);}
function log(s,type,data){s.audit.push({at:new Date().toISOString(),type,data});if(s.audit.length>1000)s.audit=s.audit.slice(-1000);}
function allowRate(key){const slot=Math.floor(Date.now()/60000);const k=`${key}:${slot}`;const n=(rate.get(k)||0)+1;rate.set(k,n);return n<=20;}
function token(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');}
async function verify(req){const {payload}=await jwtVerify(token(req),JWKS,{issuer:ISSUER,audience:AUDIENCE,maxTokenAge:'10m',clockTolerance:30});if(payload.repository!==REPOSITORY||payload.ref!=='refs/heads/main'||payload.workflow_ref!==WORKFLOW||payload.event_name!=='push')throw new Error('oidc_claims_invalid');if(!allowRate(payload.repository))throw new Error('rate_limited');return payload;}
async function authorize(req,body,{consume=false}={}){const s=load();const oid=String(body?.id||'').slice(0,100);let p;try{p=await verify(req);if(!oid||body.source_sha!==p.sha||String(body.source_run_id)!==String(p.run_id))throw new Error('source_binding_invalid');const replay=`${p.run_id}:${p.run_attempt||1}:${p.sha}:${oid}`;const prior=Object.values(s.receipts).find(x=>x.objective_id===oid&&x.auth_result==='allowed');if(consume&&s.receipts[replay]){log(s,'ingress_auth',{issuer:p.iss,actor:p.actor,objective_id:oid,auth_result:'replay_rejected',capability:(body.tasks||[]).map(x=>x.kind)});save(s);return{ok:false,status:409,error:'replay_detected'};}if(consume&&prior){log(s,'ingress_auth',{issuer:p.iss,actor:p.actor,objective_id:oid,auth_result:'idempotent_existing',capability:(body.tasks||[]).map(x=>x.kind)});save(s);return{ok:true,idempotent:true,objective_id:oid,claims:p};}if(consume){s.receipts[replay]={at:new Date().toISOString(),issuer:p.iss,actor:p.actor,objective_id:oid,auth_result:'allowed',capability:(body.tasks||[]).map(x=>String(x.kind).slice(0,80)),sha:p.sha,run_id:p.run_id};log(s,'ingress_auth',s.receipts[replay]);save(s);}return{ok:true,objective_id:oid,claims:p};}catch(e){log(s,'ingress_auth',{issuer:p?.iss||'unknown',actor:p?.actor||'unknown',objective_id:oid||'unknown',auth_result:'denied',reason:String(e.message).slice(0,100),capability:(body?.tasks||[]).map(x=>String(x.kind).slice(0,80))});save(s);return{ok:false,status:e.message==='rate_limited'?429:401,error:e.message};}}
function summary(){const s=load();return{receipts:Object.values(s.receipts).slice(-20),audit:s.audit.slice(-50)};}
module.exports={AUDIENCE,authorize,summary};
