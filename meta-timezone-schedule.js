function partsInZone(date,timeZone){
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const out={};for(const p of fmt.formatToParts(date)){if(p.type!=='literal')out[p.type]=p.value;}
 return {year:Number(out.year),month:Number(out.month),day:Number(out.day),hour:Number(out.hour),minute:Number(out.minute),second:Number(out.second)};
}
function offsetMinutes(date,timeZone){const p=partsInZone(date,timeZone);const asUtc=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);return Math.round((asUtc-date.getTime())/60000);}
function zonedLocalToUtc({year,month,day,hour,minute=0,timeZone}){
 const guess=Date.UTC(year,month-1,day,hour,minute,0);let d=new Date(guess-offsetMinutes(new Date(guess),timeZone)*60000);const off2=offsetMinutes(d,timeZone);d=new Date(guess-off2*60000);return d;
}
function addDaysYmd(ymd,days){const d=new Date(Date.UTC(ymd.year,ymd.month-1,ymd.day+days));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};}
function dayShift(base,target){const a=Date.UTC(base.year,base.month-1,base.day);const b=Date.UTC(target.year,target.month-1,target.day);return Math.round((b-a)/86400000);}
function convertDailyWindow({startsAt,durationDays,sourceTimeZone='Europe/Berlin',targetTimeZone,startHour=17,endHour=23}){
 if(!targetTimeZone)throw new TypeError('targetTimeZone is required');
 const startInstant=new Date(startsAt);if(Number.isNaN(startInstant.getTime()))throw new TypeError('startsAt must be valid');
 const sourceStart=partsInZone(startInstant,sourceTimeZone);const base={year:sourceStart.year,month:sourceStart.month,day:sourceStart.day};
 const mappings=[];
 for(let i=0;i<durationDays;i++){
  const ymd=addDaysYmd(base,i);
  const sUtc=zonedLocalToUtc({...ymd,hour:startHour,timeZone:sourceTimeZone});
  const eUtc=zonedLocalToUtc({...ymd,hour:endHour,timeZone:sourceTimeZone});
  const s=partsInZone(sUtc,targetTimeZone);const e=partsInZone(eUtc,targetTimeZone);
  mappings.push({start_minute:s.hour*60+s.minute,end_minute:e.hour*60+e.minute,start_shift:dayShift(ymd,s),end_shift:dayShift(ymd,e)});
 }
 const first=mappings[0];const stable=mappings.every(m=>m.start_minute===first.start_minute&&m.end_minute===first.end_minute&&m.start_shift===first.start_shift&&m.end_shift===first.end_shift);
 const sameTargetDay=first.start_shift===first.end_shift&&first.end_minute>first.start_minute;
 return {safe:stable&&sameTargetDay,stable,same_target_day:sameTargetDay,source_timezone:sourceTimeZone,target_timezone:targetTimeZone,start_minute:first.start_minute,end_minute:first.end_minute,day_shift:first.start_shift,reason:!stable?'timezone_offset_changes_during_campaign':!sameTargetDay?'converted_window_crosses_account_day':null};
}
module.exports={partsInZone,offsetMinutes,zonedLocalToUtc,convertDailyWindow};
