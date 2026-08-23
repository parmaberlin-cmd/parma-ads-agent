const { buildShadowDecisions, assertShadowSafe } = require("./shadow-decision-engine");
const { evaluateShadowDataQuality, assertQualityFailClosed } = require("./shadow-data-quality");

function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function summarizeChannel(channel = {}) { const spend=n(channel.cost??channel.spend);const clicks=n(channel.clicks);const bookings=n(channel.bookings??channel.conversions);return{spend_eur:spend,clicks,bookings,cpc_eur:clicks?Number((spend/clicks).toFixed(2)):null,cost_per_booking_eur:bookings?Number((spend/bookings).toFixed(2)):null}; }

function buildDailyShadowReport(snapshot = {}) {
  const shadow = buildShadowDecisions(snapshot); assertShadowSafe(shadow);
  const dataQuality = evaluateShadowDataQuality(snapshot); assertQualityFailClosed(dataQuality);
  const recommendationDecisions = dataQuality.ready_for_recommendations ? shadow.decisions : [];
  const blockedObservations = dataQuality.ready_for_recommendations ? [] : [{channel:'system',action:'collect_or_repair_data',reason:`Shadow recommendations blocked: ${dataQuality.blockers.join(', ')}`,confidence:'high',mode:'shadow',executable:false}];
  const decisions = [...recommendationDecisions, ...blockedObservations];
  const report = {mode:'shadow',generated_at:shadow.generated_at,writes_allowed:false,spend_changed:false,data_quality:dataQuality,source_health:snapshot.source_health||{},conversion_integrity:shadow.integrity,channels:{google:summarizeChannel(snapshot.google),meta:summarizeChannel(snapshot.meta)},top_priorities:decisions.slice(0,3),observations:decisions.slice(3),journal:decisions.map((decision,index)=>({sequence:index+1,timestamp:shadow.generated_at,channel:decision.channel,diagnosis:decision.reason,proposed_action:decision.action,mode:'shadow',executable:false,requires_human_approval:true,execution_status:'not_executed',verification_status:'not_applicable'}))};
  if(report.writes_allowed!==false||report.spend_changed!==false)throw new Error('daily shadow report violated no-write contract');
  if(!dataQuality.ready_for_recommendations&&report.top_priorities.some((d)=>d.channel!=='system'))throw new Error('untrusted data produced optimization recommendations');
  return report;
}
module.exports={summarizeChannel,buildDailyShadowReport};