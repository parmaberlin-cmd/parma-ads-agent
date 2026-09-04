'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {OAuth2Client}=require('google-auth-library');
const verifier=new OAuth2Client();
const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='parma-autonomous-objective-ingress';
const REPOSITORY='parmaberlin-cmd/parma-ads-agent';
const ACTOR='parmaberlin-cmd';
const WORKFLOW='parmaberlin-cmd/parma-ads-agent/.github/workflows/objective-ingress.yml@refs/heads/main';
let certCache={at:0,certs:{}};const rate=new Map();
function stateFile(env=process.env){return path.join(env.RAILWAY_VOLUME_MOUNT_PATH||'/tmp','parma-objective-ingress.json');}
function load(file=stateFile()){if(!fs.existsSync(file))return{version:1,receipts:{},audit:[]};return JSON.parse(fs.readFileSync(file,'utf8'));}
function save(s,file=stateFile()){const tmp=`${file}.${process.pid}.tmp`;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(s)+'\n',{mode:0o600});fs.renameSync(tmp,file);}
function log(s,type,data){s.audit.push({at:new Date().toISOString(),type,data});if(s.audit.length>1000)s.audit=s.audit.slice(-1000);}
function allowRate(key){const slot=Math.floor(Date.now()/60000);const k=`${key}:${slot}`;const n=(rate.get(k)||0)+1;rate.set(k,n);return n<=20;}
function token(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');}
async function certs(){if(Date.now()-certCache.at<300000&&Object.keys(certCache.certs).length)return certCache.certs;const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('oidc_jwks_unavailable');const j=await r.json();const out={};for(const k of j.keys||[]){if(k.kid&&k.x5c?.[0])out[k.kid]=`-----BEGIN CERTIFICATE-----\n${k.x5c[0]}\n-----END CERTIFICATE-----`;}certCache={at:Date.now(),certs:out};return out;}
async function verify(req){const ticket=await verifier.verifySignedJwtWithCertsAsync(token(req),await certs(),AUDIENCE,[ISSUER],900);const p=ticket.getPayload();if(p.repository!==REPOSITORY||p.actor!==ACTOR||p.ref!=='refs/heads/main'||p.workflow_ref!==WORKFLOW||p.event_name!=='push')throw new Error('oidc_claims_invalid');if(!allowRate(`${p.repository}:${p.actor}`))throw new Error('rate_limited');return p;}
function receipt(p,oid,authResult,body){return{at:new Date().toISOString(),issuer:p.iss,actor:p.actor,objective_id:oid,auth_result:authResult,capability:(body.tasks||[]).map(x=>String(x.kind).slice(0,80)),sha:p.sha,run_id:p.run_id};}
async function authorize(req,body,{consume=false}={}){const s=load();const oid=String(body?.id||'').slice(0,100);let p;try{p=await verify(req);if(!oid||body.source_sha!==p.sha||String(body.source_run_id)!==String(p.run_id))throw new Error('source_binding_invalid');const replay=`${p.run_id}:${p.run_attempt||1}:${p.sha}:${oid}`;const prior=Object.values(s.receipts).find(x=>x.objective_id===oid&&x.auth_result==='allowed');if(consume&&s.receipts[replay]){log(s,'ingress_auth',{issuer:p.iss,actor:p.actor,objective_id:oid,auth_result:'replay_rejected',capability:(body.tasks||[]).map(x=>x.kind)});save(s);return{ok:false,status:409,error:'replay_detected'};}if(consume&&prior){const r=receipt(p,oid,'idempotent_existing',body);s.receipts[replay]=r;log(s,'ingress_auth',r);save(s);return{ok:true,idempotent:true,objective_id:oid,claims:p};}if(consume){const r=receipt(p,oid,'allowed',body);s.receipts[replay]=r;log(s,'ingress_auth',r);save(s);}return{ok:true,objective_id:oid,claims:p};}catch(e){log(s,'ingress_auth',{issuer:p?.iss||'unknown',actor:p?.actor||'unknown',objective_id:oid||'unknown',auth_result:'denied',reason:String(e.message).slice(0,100),capability:(body?.tasks||[]).map(x=>String(x.kind).slice(0,80))});save(s);return{ok:false,status:e.message==='rate_limited'?429:401,error:e.message};}}
function summary(){const s=load();return{receipts:Object.values(s.receipts).slice(-20),audit:s.audit.slice(-50)};}
module.exports={AUDIENCE,authorize,summary,verify};
