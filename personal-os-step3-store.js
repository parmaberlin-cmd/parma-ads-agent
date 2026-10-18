'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const { z }=require('zod');

const ID=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const taskSchema=z.object({
 schema_version:z.literal('personal_os.remote_procedure.v1'),
 request_id:ID,
 issued_at:z.string().datetime(),
 workspace:z.literal('personal-os-control'),
 procedure_id:z.enum(['queue.read','queue.status','local.report','step7.evidence.read','repository.test','git.status','git.diff','terminal.canary','browser.read_only','google_ads.read']),
 parameters:z.record(z.unknown()),
}).strict().refine(task=>task.procedure_id!=='step7.evidence.read'||z.object({request_id:ID}).strict().safeParse(task.parameters).success,{message:'step7_evidence_parameters_invalid'});
const resultSchema=z.object({
 schema_version:z.literal('personal_os.remote_procedure_result.v1'),
 request_id:ID,request_digest:z.string().regex(/^[a-f0-9]{64}$/),status:z.enum(['ACCEPTED','RUNNING','RETRY_WAIT','COMPLETED','FAILED']),
 reason:z.string().nullable(),attempts:z.number().int().min(0),read_back:z.unknown().nullable(),
 authority_granted:z.literal(false),provider_write_performed:z.literal(false),spend_changed:z.literal(false),published:z.literal(false),
}).strict();

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function msg(e){return ['personal-os-remote-procedure-v1',e.executor_id,e.key_id,e.issued_at,e.nonce,e.body_sha256].join('\n');}
function ackMsg(e){return ['personal-os-result-ack-v1',e.executor_id,e.key_id,e.issued_at,e.nonce,e.body_sha256].join('\n');}
function key(env,name){const raw=env[name];if(typeof raw!=='string'||!raw.includes('KEY'))throw new Error('step3_key_unavailable');try{return name.includes('PRIVATE')?crypto.createPrivateKey(raw):crypto.createPublicKey(raw);}catch{throw new Error('step3_key_invalid');}}
function root(env){const base=env.PERSONAL_OS_STEP3_STATE_PATH||env.RAILWAY_VOLUME_MOUNT_PATH;if(typeof base!=='string'||!path.isAbsolute(base))throw new Error('step3_state_path_unavailable');return env.PERSONAL_OS_STEP3_STATE_PATH?base:path.join(base,'personal-os-step3');}
function atomic(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(obj)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}

const ACK_MAX_BYTES=32768;
const ACK_KEYS=['schema_version','executor_id','key_id','issued_at','nonce','body_sha256','signature','body'];
const RESULT_KEYS=['schema_version','request_id','request_digest','status','reason','attempts','read_back','authority_granted','provider_write_performed','spend_changed','published'];
const READ_KEYS=['read_back','status','reason','procedure_status','evidence'];
const EVIDENCE_KEYS=['schema_version','request_id','handoff_id','request_digest','provider_result_digest','handoff_digest','current_digest','provider_captured_at','task_completed_at','current_recorded_at','provider_read_status','ack_status','current_status','request_correlated','handoff_correlated','current_digest_verified','authority_granted','provider_write_performed','credentials_read','spend_changed','published','executor','control_tower_materialized','provider_read'];
const PROVIDER_KEYS=['request_id','request_digest','body_sha256','captured_at','verified','authority_granted','provider_write_performed','credentials_read','spend_changed','published'];
function allowedObject(v,keys){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));}
function safeFields(v,keys){
 if(!allowedObject(v,keys))return false;
 return Object.entries(v).every(([k,x])=>{
  if(k==='provider_read')return safeFields(x,PROVIDER_KEYS)&&PROVIDER_KEYS.every(name=>Object.hasOwn(x,name))&&x.verified===true;
  if(k==='ack_status')return x==='NOT_OBSERVED';
  if(k==='provider_read_status')return x==='PROVIDER_READ_VERIFIED';
  if(k==='current_status')return x==='HANDOFF_CURRENT_MATERIALIZED';
  if(['authority_granted','provider_write_performed','credentials_read','spend_changed','published'].includes(k))return x===false;
  if(['verified','request_correlated','handoff_correlated','current_digest_verified','control_tower_materialized'].includes(k))return typeof x==='boolean';
  if(x===null)return ['executor','handoff_id'].includes(k);
  if(typeof x!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x))return false;
  if(k.includes('digest')||k==='body_sha256')return /^[a-f0-9]{64}$/.test(x);
  if(k.endsWith('_at'))return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
  return true;
 });
}
function safeResult(v){return allowedObject(v,RESULT_KEYS)&&resultSchema.safeParse(v).success&&(v.reason===null||/^[A-Za-z0-9._:-]{1,128}$/.test(v.reason))&&(v.read_back===null||(allowedObject(v.read_back,READ_KEYS)&&Object.entries(v.read_back).every(([k,x])=>k==='evidence'?safeFields(x,EVIDENCE_KEYS):typeof x==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(x))));}
function validateAck(e,store){
 let bytes;try{bytes=Buffer.byteLength(JSON.stringify(e));}catch{throw new Error('step3_ack_invalid');}
 if(bytes>ACK_MAX_BYTES||!allowedObject(e,ACK_KEYS)||e.schema_version!=='personal_os.remote_result_ack_envelope.v1'||e.executor_id!==store.macExecutorId||e.key_id!==store.macKeyId)throw new Error('step3_ack_identity_invalid');
 if(!ID.safeParse(e.nonce).success||typeof e.issued_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(e.issued_at)||!Number.isFinite(Date.parse(e.issued_at)))throw new Error('step3_ack_time_invalid');
 if(!allowedObject(e.body,['schema_version','result'])||e.body.schema_version!=='personal_os.remote_result_ack.v1'||digest(e.body)!==e.body_sha256)throw new Error('step3_ack_digest_invalid');
 let ok=false;try{ok=typeof e.signature==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(e.signature)&&crypto.verify(null,Buffer.from(ackMsg(e)),store.macPublicKey,Buffer.from(e.signature,'base64'));}catch{}
 if(!ok)throw new Error('step3_ack_signature_invalid');
 if(!safeResult(e.body.result))throw new Error('step3_ack_result_invalid');
 return e.body.result;
}
function readRecord(file){const st=fs.lstatSync(file);if(st.isSymbolicLink()||!st.isFile()||st.size>ACK_MAX_BYTES*2)throw new Error('step3_ack_record_invalid');return JSON.parse(fs.readFileSync(file,'utf8'));}
function exclusive(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(obj)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dfd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dfd);}finally{fs.closeSync(dfd);}}
class Step3Store{
 constructor(env=process.env,options={}){this.env=env;this.root=root(env);this.pending=path.join(this.root,'tasks');this.acks=path.join(this.root,'acks');fs.mkdirSync(this.pending,{recursive:true,mode:0o700});fs.mkdirSync(this.acks,{recursive:true,mode:0o700});this.privateKey=key(env,'PERSONAL_OS_STEP3_TASK_SIGNING_PRIVATE_KEY_PEM');this.macPublicKey=key(env,'PERSONAL_OS_STEP3_MAC_PUBLIC_KEY_PEM');this.executorId=env.PERSONAL_OS_STEP3_EXECUTOR_ID;this.keyId=env.PERSONAL_OS_STEP3_TASK_KEY_ID;this.macExecutorId=env.PERSONAL_OS_STEP3_MAC_EXECUTOR_ID;this.macKeyId=env.PERSONAL_OS_STEP3_MAC_KEY_ID;if(![this.executorId,this.keyId,this.macExecutorId,this.macKeyId].every(x=>ID.safeParse(x).success))throw new Error('step3_identity_invalid');this.now=options.now||Date.now;this.nonce=options.nonce||crypto.randomUUID;}
 seedOnce(input){const marker=path.join(this.root,'seeds',digest(input.request_id)+'.json');if(fs.existsSync(marker))return {status:'SEEDED',request_id:input.request_id,duplicate:true};const out=this.submit(input);atomic(marker,{schema:'personal_os.step3_seed.v1',request_id:input.request_id,seeded_at:new Date(this.now()).toISOString()});return {status:'SEEDED',request_id:input.request_id,duplicate:out.duplicate};}
 submit(input){const parsed=taskSchema.safeParse(input);if(!parsed.success)throw new Error('step3_task_invalid');const task=parsed.data;if(fs.existsSync(path.join(this.acks,digest(task.request_id)+'.json')))throw new Error('step3_request_already_completed');const d=digest(task);const file=path.join(this.pending,digest(task.request_id)+'.json');if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.task_digest!==d)throw new Error('step3_request_id_conflict');return {status:'QUEUED',request_id:task.request_id,duplicate:true};}atomic(file,{schema:'personal_os.step3_task.v1',task_digest:d,task});return {status:'QUEUED',request_id:task.request_id,duplicate:false};}
 list(limit=20){return fs.readdirSync(this.pending).filter(x=>/^[a-f0-9]{64}\.json$/.test(x)&&!fs.existsSync(path.join(this.acks,x))).slice(0,limit).map(name=>JSON.parse(fs.readFileSync(path.join(this.pending,name),'utf8')).task).map(task=>{const e={schema_version:'personal_os.remote_procedure_envelope.v1',executor_id:this.executorId,key_id:this.keyId,issued_at:new Date(this.now()).toISOString(),nonce:this.nonce(),body_sha256:digest(task),signature:'',task};e.signature=crypto.sign(null,Buffer.from(msg(e)),this.privateKey).toString('base64');return e;});}
 signer(){const pem=crypto.createPublicKey(this.privateKey).export({type:'spki',format:'pem'});return {executor_id:this.executorId,key_id:this.keyId,public_key_pem:pem,fingerprint_sha256:crypto.createHash('sha256').update(crypto.createPublicKey(pem).export({type:'spki',format:'der'})).digest('hex')};}
 acceptAck(e){
 const result=validateAck(e,this);
 if(Math.abs(this.now()-Date.parse(e.issued_at))>300000)throw new Error('step3_ack_stale');
 const file=path.join(this.acks,digest(result.request_id)+'.json'),resultDigest=digest(result),envelopeDigest=digest(e);
 const pending=path.join(this.pending,digest(result.request_id)+'.json');
 const response=duplicate=>({status:'ACKNOWLEDGED',request_id:result.request_id,request_digest:result.request_digest,result_digest:resultDigest,duplicate,authority_granted:false,provider_write_performed:false,spend_changed:false,published:false});
 if(fs.existsSync(file)){const old=readRecord(file);if(old.schema!=='personal_os.step3_ack.v2'||digest(old.ack_envelope)!==envelopeDigest||digest(validateAck(old.ack_envelope,this))!==resultDigest||old.result_digest!==resultDigest||old.envelope_digest!==envelopeDigest)throw new Error('step3_ack_conflict');return response(true);}
 if(!fs.existsSync(pending))throw new Error('step3_ack_task_missing');
 const taskRecord=readRecord(pending);if(taskRecord.task_digest!==result.request_digest||digest(taskRecord.task)!==result.request_digest||taskRecord.task.request_id!==result.request_id)throw new Error('step3_ack_task_mismatch');
 const nonceFile=path.join(this.acks,'nonces',digest([e.executor_id,e.key_id,e.nonce])+'.json');
 try{exclusive(nonceFile,{envelope_digest:envelopeDigest});}catch(error){if(error.code!=='EEXIST')throw error;if(readRecord(nonceFile).envelope_digest!==envelopeDigest)throw new Error('step3_ack_nonce_replay');}
 const record={schema:'personal_os.step3_ack.v2',result_digest:resultDigest,envelope_digest:envelopeDigest,request_digest:result.request_digest,received_at:new Date(this.now()).toISOString(),ack_received_and_verified:true,ack_envelope:e,result};
 try{exclusive(file,record);}catch(error){if(error.code!=='EEXIST')throw error;const old=readRecord(file);if(old.envelope_digest!==envelopeDigest)throw new Error('step3_ack_conflict');return response(true);}
 fs.unlinkSync(pending);return response(false);
 }
 result(requestId){if(!ID.safeParse(requestId).success)throw new Error('step3_request_id_invalid');const file=path.join(this.acks,digest(requestId)+'.json');if(!fs.existsSync(file))return null;const record=readRecord(file);if(record.schema!=='personal_os.step3_ack.v2')throw new Error('step3_ack_legacy_unverified');const result=validateAck(record.ack_envelope,this);if(result.request_id!==requestId||digest(result)!==record.result_digest||digest(record.ack_envelope)!==record.envelope_digest||result.request_digest!==record.request_digest)throw new Error('step3_ack_record_invalid');return {received_at:record.received_at,result_digest:record.result_digest,request_digest:record.request_digest,ack_received_and_verified:true,ack_envelope:record.ack_envelope,result};}
}
module.exports={Step3Store,taskSchema,resultSchema,digest};

