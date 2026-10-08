'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const { z }=require('zod');
const { publishRuntimeHandoff }=require('./personal-os-runtime-handoff');

const ID=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const taskSchema=z.object({
 schema_version:z.literal('personal_os.remote_procedure.v1'),
 request_id:ID,
 issued_at:z.string().datetime(),
 workspace:z.literal('personal-os-control'),
 procedure_id:z.enum(['queue.read','queue.status','local.report','repository.test','git.status','git.diff','terminal.canary','browser.read_only','google_ads.read']),
 parameters:z.record(z.unknown()),
}).strict();
const resultSchema=z.object({
 schema_version:z.literal('personal_os.remote_procedure_result.v1'),
 request_id:ID,status:z.enum(['ACCEPTED','RUNNING','RETRY_WAIT','COMPLETED','FAILED']),
 reason:z.string().nullable(),attempts:z.number().int().min(0),read_back:z.unknown().nullable(),
 authority_granted:z.literal(false),provider_write_performed:z.literal(false),spend_changed:z.literal(false),published:z.literal(false),
}).strict();

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function msg(e){return ['personal-os-remote-procedure-v1',e.executor_id,e.key_id,e.issued_at,e.nonce,e.body_sha256].join('\n');}
function ackMsg(e){return ['personal-os-result-ack-v1',e.executor_id,e.key_id,e.issued_at,e.nonce,e.body_sha256].join('\n');}
function key(env,name){const raw=env[name];if(typeof raw!=='string'||!raw.includes('KEY'))throw new Error('step3_key_unavailable');try{return name.includes('PRIVATE')?crypto.createPrivateKey(raw):crypto.createPublicKey(raw);}catch{throw new Error('step3_key_invalid');}}
function root(env){const base=env.PERSONAL_OS_STEP3_STATE_PATH||env.RAILWAY_VOLUME_MOUNT_PATH;if(typeof base!=='string'||!path.isAbsolute(base))throw new Error('step3_state_path_unavailable');return env.PERSONAL_OS_STEP3_STATE_PATH?base:path.join(base,'personal-os-step3');}
function atomic(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(obj)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
class Step3Store{
 constructor(env=process.env,options={}){this.env=env;this.root=root(env);this.pending=path.join(this.root,'tasks');this.acks=path.join(this.root,'acks');fs.mkdirSync(this.pending,{recursive:true,mode:0o700});fs.mkdirSync(this.acks,{recursive:true,mode:0o700});this.privateKey=key(env,'PERSONAL_OS_STEP3_TASK_SIGNING_PRIVATE_KEY_PEM');this.macPublicKey=key(env,'PERSONAL_OS_STEP3_MAC_PUBLIC_KEY_PEM');this.executorId=env.PERSONAL_OS_STEP3_EXECUTOR_ID;this.keyId=env.PERSONAL_OS_STEP3_TASK_KEY_ID;this.macExecutorId=env.PERSONAL_OS_STEP3_MAC_EXECUTOR_ID;this.macKeyId=env.PERSONAL_OS_STEP3_MAC_KEY_ID;if(![this.executorId,this.keyId,this.macExecutorId,this.macKeyId].every(x=>ID.safeParse(x).success))throw new Error('step3_identity_invalid');this.now=options.now||Date.now;this.nonce=options.nonce||crypto.randomUUID;}
 seedOnce(input){const marker=path.join(this.root,'seeds',digest(input.request_id)+'.json');if(fs.existsSync(marker))return {status:'SEEDED',request_id:input.request_id,duplicate:true};const out=this.submit(input);atomic(marker,{schema:'personal_os.step3_seed.v1',request_id:input.request_id,seeded_at:new Date(this.now()).toISOString()});return {status:'SEEDED',request_id:input.request_id,duplicate:out.duplicate};}
 submit(input){const parsed=taskSchema.safeParse(input);if(!parsed.success)throw new Error('step3_task_invalid');const task=parsed.data;const d=digest(task);const file=path.join(this.pending,digest(task.request_id)+'.json');if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.task_digest!==d)throw new Error('step3_request_id_conflict');return {status:'QUEUED',request_id:task.request_id,duplicate:true};}atomic(file,{schema:'personal_os.step3_task.v1',task_digest:d,task});return {status:'QUEUED',request_id:task.request_id,duplicate:false};}
 list(limit=20){return fs.readdirSync(this.pending).filter(x=>/^[a-f0-9]{64}\.json$/.test(x)).slice(0,limit).map(name=>JSON.parse(fs.readFileSync(path.join(this.pending,name),'utf8')).task).map(task=>{const e={schema_version:'personal_os.remote_procedure_envelope.v1',executor_id:this.executorId,key_id:this.keyId,issued_at:new Date(this.now()).toISOString(),nonce:this.nonce(),body_sha256:digest(task),signature:'',task};e.signature=crypto.sign(null,Buffer.from(msg(e)),this.privateKey).toString('base64');return e;});}
 signer(){const pem=crypto.createPublicKey(this.privateKey).export({type:'spki',format:'pem'});return {executor_id:this.executorId,key_id:this.keyId,public_key_pem:pem,fingerprint_sha256:crypto.createHash('sha256').update(crypto.createPublicKey(pem).export({type:'spki',format:'der'})).digest('hex')};}
 acceptAck(e){if(!e||e.schema_version!=='personal_os.remote_result_ack_envelope.v1'||e.executor_id!==this.macExecutorId||e.key_id!==this.macKeyId)throw new Error('step3_ack_identity_invalid');if(digest(e.body)!==e.body_sha256)throw new Error('step3_ack_digest_invalid');let ok=false;try{ok=crypto.verify(null,Buffer.from(ackMsg(e)),this.macPublicKey,Buffer.from(e.signature,'base64'));}catch{}if(!ok)throw new Error('step3_ack_signature_invalid');const parsed=resultSchema.safeParse(e.body?.result);if(!parsed.success)throw new Error('step3_ack_result_invalid');const result=parsed.data;const file=path.join(this.acks,digest(result.request_id)+'.json');const resultDigest=digest(result);if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.result_digest!==resultDigest)throw new Error('step3_ack_conflict');return {status:'ACKNOWLEDGED',request_id:result.request_id,duplicate:true};}atomic(file,{schema:'personal_os.step3_ack.v1',result_digest:resultDigest,received_at:new Date(this.now()).toISOString(),result});try{publishRuntimeHandoff({source:'step3_remote_executor',status:result.status==='COMPLETED'?'DONE':'BLOCKED',intent:'control_tower.project_status',taskId:result.request_id,evidenceRefs:['step3_result_ack:'+resultDigest],payload:{step3_request_id:result.request_id,step3_status:result.status,read_back:result.read_back,authority_granted:false,provider_write_performed:false,spend_changed:false,published:false}},{env:this.env,now:()=>new Date(this.now()).toISOString()});}catch{}const pending=path.join(this.pending,digest(result.request_id)+'.json');if(fs.existsSync(pending))fs.unlinkSync(pending);return {status:'ACKNOWLEDGED',request_id:result.request_id,duplicate:false};}
 result(requestId){if(!ID.safeParse(requestId).success)throw new Error('step3_request_id_invalid');const file=path.join(this.acks,digest(requestId)+'.json');if(!fs.existsSync(file))return null;const record=JSON.parse(fs.readFileSync(file,'utf8'));return {received_at:record.received_at,result:record.result};}
}
module.exports={Step3Store,taskSchema,resultSchema,digest};
