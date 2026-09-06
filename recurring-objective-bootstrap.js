'use strict';
const {filePath,read,upsertSchedule}=require('./recurring-objective-scheduler');

const DEFAULT_SCHEDULE_ID='autonomous-business-loop-google-cycle';
const DEFAULT_CAMPAIGN_ID='23276824770';
const TRUE_SET=new Set(['1','true','yes','on']);
const FALSE_SET=new Set(['0','false','no','off']);

function boolEnv(value,defaultValue=true){
  if(value==null||value==='')return defaultValue;
  const normalized=String(value).trim().toLowerCase();
  if(TRUE_SET.has(normalized))return true;
  if(FALSE_SET.has(normalized))return false;
  return defaultValue;
}
function intEnv(value,fallback,min,max){
  const parsed=Number(value);
  if(!Number.isInteger(parsed))return fallback;
  return Math.max(min,Math.min(max,parsed));
}
function validCampaignId(value){return /^\d{1,20}$/.test(String(value||''));}
function sanitizeScheduleId(value){
  const id=String(value||DEFAULT_SCHEDULE_ID).trim();
  return /^[-a-zA-Z0-9_.:]{1,80}$/.test(id)?id:DEFAULT_SCHEDULE_ID;
}
function desiredSchedule(env=process.env,now=Date.now()){
  const scheduleId=sanitizeScheduleId(env.AUTONOMOUS_BUSINESS_LOOP_SCHEDULE_ID);
  const enabled=boolEnv(env.AUTONOMOUS_BUSINESS_LOOP_ENABLED,true);
  const campaignId=String(env.AUTONOMOUS_BUSINESS_LOOP_CAMPAIGN_ID||DEFAULT_CAMPAIGN_ID).trim();
  const hour=intEnv(env.AUTONOMOUS_BUSINESS_LOOP_HOUR,8,0,23);
  const minute=intEnv(env.AUTONOMOUS_BUSINESS_LOOP_MINUTE,0,0,59);
  return {
    scheduleId,enabled,campaignId,
    schedule:{
      id:scheduleId,
      enabled:true,
      cadence:{type:'daily',hour,minute},
      objective_template:{
        objective:`Autonomous Google business loop for campaign ${campaignId} (verify-only guarded cycle)`,
        tasks:[{
          id:`cycle-plan-start-${campaignId}`,
          kind:'google_ads.cycle_plan',
          input:{campaign_id:campaignId},
          idempotency_key:`recurring:${scheduleId}:cycle:${campaignId}:plan`,
        }],
      },
      created_at:new Date(now).toISOString(),
    },
  };
}
function managedShape(schedule={}){
  return {
    enabled:Boolean(schedule.enabled),
    timezone:String(schedule.timezone||'Europe/Berlin'),
    cadence:schedule.cadence||null,
    objective_template:schedule.objective_template||null,
  };
}
function diffFields(a,b){
  const fields=[];
  for(const key of ['enabled','timezone','cadence','objective_template']){
    if(JSON.stringify(a?.[key]??null)!==JSON.stringify(b?.[key]??null))fields.push(key);
  }
  return fields;
}
function reconcileRecurringBootstrap({env=process.env,file=filePath(env),now=Date.now()}={}){
  const at=new Date(now).toISOString();
  const desired=desiredSchedule(env,now);
  const campaignValid=validCampaignId(desired.campaignId);
  const storage={durable:!file.startsWith('/tmp/'),path:file};
  const state=read(file);
  const existing=state.schedules.find(x=>x.id===desired.scheduleId)||null;
  if(!desired.enabled){
    if(!existing)return {status:'disabled',managed_schedule_id:desired.scheduleId,reconciled:true,action:'none',reason:'disabled_by_configuration',storage,evidence:{existing:false},updated_at:at};
    const canonicalDisabled=campaignValid?{...existing,...desired.schedule,enabled:false,timezone:'Europe/Berlin',created_at:existing.created_at||desired.schedule.created_at}:{...existing,enabled:false,timezone:'Europe/Berlin'};
    const current=managedShape(existing);
    const wanted=managedShape(canonicalDisabled);
    const driftFields=diffFields(current,wanted);
    const nonEnabledDrift=driftFields.filter(x=>x!=='enabled');
    if(existing.enabled===false&&!driftFields.length)return {status:'disabled',managed_schedule_id:desired.scheduleId,reconciled:true,action:'preserved_disabled',reason:'disabled_by_configuration',storage,evidence:{existing:true,drift:false},updated_at:at};
    upsertSchedule(canonicalDisabled,{file,now});
    return {status:nonEnabledDrift.length?'drift':'disabled',managed_schedule_id:desired.scheduleId,reconciled:true,action:nonEnabledDrift.length?'updated_disabled_drift':'updated_to_disabled',reason:'disabled_by_configuration',drift_fields:driftFields,storage,evidence:{existing:true,previous_enabled:existing.enabled===true,drift:Boolean(nonEnabledDrift.length),campaign_id_valid:campaignValid},updated_at:at};
  }
  if(!campaignValid){
    return {status:'missing',managed_schedule_id:desired.scheduleId,reconciled:false,action:'none',reason:'invalid_campaign_id',storage,evidence:{campaign_id_valid:false},updated_at:at};
  }
  if(!existing){
    upsertSchedule(desired.schedule,{file,now});
    return {status:'healthy',managed_schedule_id:desired.scheduleId,reconciled:true,action:'created',reason:null,storage,evidence:{created:true,campaign_id:desired.campaignId},updated_at:at};
  }
  const current=managedShape(existing);
  const wanted=managedShape({...desired.schedule,enabled:true,timezone:'Europe/Berlin'});
  const driftFields=diffFields(current,wanted);
  if(!driftFields.length){
    return {status:'healthy',managed_schedule_id:desired.scheduleId,reconciled:true,action:'preserved',reason:null,storage,evidence:{drift:false,campaign_id:desired.campaignId},updated_at:at};
  }
  const reconciled={...existing,...desired.schedule,enabled:true,timezone:'Europe/Berlin',created_at:existing.created_at||desired.schedule.created_at};
  upsertSchedule(reconciled,{file,now});
  return {status:'drift',managed_schedule_id:desired.scheduleId,reconciled:true,action:'updated',reason:'configuration_drift_reconciled',drift_fields:driftFields,storage,evidence:{drift:true,campaign_id:desired.campaignId},updated_at:at};
}

module.exports={DEFAULT_SCHEDULE_ID,DEFAULT_CAMPAIGN_ID,boolEnv,intEnv,validCampaignId,sanitizeScheduleId,desiredSchedule,managedShape,diffFields,reconcileRecurringBootstrap};
