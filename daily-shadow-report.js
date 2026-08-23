const {buildShadowDecisions,assertShadowSafe}=require('./shadow-decision-engine');
const {evaluateShadowDataQuality,assertQualityFailClosed}=require('./shadow-data-quality');
function n(value){const x=Number(value);return Number.isFinite(x)?x:0;}
function summarizeChannel(channel={}){const spend=n(channel.cost??channel.spend),clicks=n(channel.clicks),bookings=n(channel.bookings??channel.conversions);return{spend_eur:spend,clicks,bookings,cpc_eur:clicks?Number((spend/clicks).toFixed(2)):null,cost_per_booking_eur:bookings?Number((spend/bookings).toFixed(2)):null};}
function buildDailyShadowReport(snapshot={}){
 const shadow=buildShadowDecisions(snapshot);assertShadowSafe(shadow);const q=evaluateShadowDataQuality(snapshot);assertQualityFailClosed(q);
 const allowed=new Set(Object.entries(q.channel_ready).filter(([,ready])=>ready).map(([name])=>name));
 const trusted=shadow.decisions.filter(d=>allowed.has(d.channel));const blockedChannels=Object.entries(q.channel_ready).filter(([,ready])=>!ready).map(([name])=>name);
 const system=blockedChannels.length?[{channel:'system',action:'collect_or_repair_data',reason:`Recommendations withheld for: ${blockedChannels.join(', ')}. Blockers: ${q.blockers.join(', ')||'insufficient evidence'}`,confidence:'high',mode:'shadow',executable:false}]:[];
 const decisions=[...system,...trusted];
 const report={mode:'shadow',generated_at:shadow.generated_at,writes_allowed:false,spend_changed:false,data_quality:q,source_health:snapshot.source_health||{},conversion_integrity:shadow.integrity,channels:{google:summarizeChannel(snapshot.google),meta:summarizeChannel(snapshot.meta)},top_priorities:decisions.slice(0,3),observations:decisions.slice(3),journal:decisions.map((d,index)=>({sequence:index+1,timestamp:shadow.generated_at,channel:d.channel,diagnosis:d.reason,proposed_action:d.action,mode:'shadow',executable:false,requires_human_approval:true,execution_status:'not_executed',verification_status:'not_applicable'}))};
 if(report.writes_allowed!==false||report.spend_changed!==false)throw new Error('daily shadow report violated no-write contract');if(report.top_priorities.some(d=>d.channel!=='system'&&!allowed.has(d.channel)))throw new Error('untrusted channel produced recommendation');return report;
}
module.exports={summarizeChannel,buildDailyShadowReport};