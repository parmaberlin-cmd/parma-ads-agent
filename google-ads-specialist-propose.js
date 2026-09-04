'use strict';

const crypto = require('crypto');
const { authorizeAutonomy } = require('./autonomy-policy');

const MAX_DAILY_BUDGET_EUR = 10;
const PROTECTED_LOCAL = /\b(near me|in meiner nähe|kreuzberg|wrangel|parma)\b/i;
const IRRELEVANT_OR_COMPETITOR = /\b(60 seconds? to napoli|12 apostel|l['’ ]?osteria|domino|döner|doener|24[ /-]?7 pizza)\b/i;

function finite(v){ return Number.isFinite(Number(v)); }
function round2(v){ return Math.round(Number(v||0)*100)/100; }
function fingerprint(evidence){ return crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex').slice(0,16); }
function actionId(fp,index,type){ return `p2-${fp}-${String(index+1).padStart(2,'0')}-${type.replace(/[^a-z0-9]+/gi,'_').toLowerCase()}`; }
function ref(section,index){ return index == null ? `read_campaign.${section}` : `read_campaign.${section}[${index}]`; }

function classifyFutureAction(candidate){
  const gate=authorizeAutonomy({name:candidate.policy_name||candidate.action_type,external_write:candidate.external_write===true},{kill_switch:false});
  const red=gate.human_approval_required===true || ['spend_change','campaign_creation','activation','ad_platform_write'].includes(gate.action_class);
  if(candidate.rejected_reason) return {status:'REJECTED',delegation_class:gate.action_class,policy_reason:candidate.rejected_reason};
  if(red || !gate.allowed) return {status:'NEEDS_HUMAN',delegation_class:gate.action_class,policy_reason:gate.reason};
  return {status:'AUTO_EXECUTABLE',delegation_class:gate.action_class,policy_reason:gate.reason};
}

function validateProposal(p){
  if(!p||p.schema!=='google_ads.propose_changes.v1'||!/^\d+$/.test(String(p.campaign_id||''))) return false;
  if(!finite(p.budget_cage?.before_total_eur)||!finite(p.budget_cage?.proposed_total_eur)) return false;
  if(Number(p.budget_cage.proposed_total_eur)>Number(p.budget_cage.cap_eur)+1e-9) return false;
  if(!Array.isArray(p.actions)) return false;
  const required=['action_id','campaign_id','action_type','target','current_value','proposed_value','reason','evidence_refs','expected_effect','risk_level','delegation_class','rollback_possible','confidence','conversion_signal_used','status'];
  for(const a of p.actions){
    if(required.some(k=>a[k]===undefined||a[k]===null)) return false;
    if(a.campaign_id!==p.campaign_id||!Array.isArray(a.evidence_refs)||!finite(a.confidence)||a.confidence<0||a.confidence>1) return false;
    if(a.conversion_signal_used!=='NONE') return false;
    if(a.status==='AUTO_EXECUTABLE' && ['spend_change','campaign_creation','activation','ad_platform_write'].includes(a.delegation_class)) return false;
  }
  return !/refresh_token|client_secret|developer_token|authorization|bearer|api[_-]?key|password/i.test(JSON.stringify(p));
}

function proposeChanges({readEvidence,context={}}){
  if(!readEvidence||readEvidence.schema!=='google_ads.read_campaign.v1') throw Object.assign(new Error('validated_read_evidence_required'),{status:400});
  const campaignId=String(readEvidence.campaign_id||'');
  const overview=readEvidence.overview||{};
  const budgetContext=readEvidence.account_budget_context||{};
  const beforeTotal=Number(budgetContext.enabled_budget_total_eur);
  const currentBudget=Number(overview.daily_budget_eur);
  if(!finite(beforeTotal)||beforeTotal<0||!finite(currentBudget)||currentBudget<0) throw Object.assign(new Error('enabled_campaign_budget_context_required'),{status:400});
  const cap=Math.min(Number(context.daily_budget_cap_eur||MAX_DAILY_BUDGET_EUR),MAX_DAILY_BUDGET_EUR);
  const fp=fingerprint({campaign_id:campaignId,date_range:readEvidence.date_range,overview,search_terms:readEvidence.search_terms,keyword_summary:readEvidence.keyword_summary,hourly_distribution:readEvidence.hourly_distribution,device_distribution:readEvidence.device_distribution,geographic_distribution:readEvidence.geographic_distribution,account_budget_context:budgetContext,context});
  const candidates=[];
  const otherEnabled=Math.max(0,beforeTotal-currentBudget);
  const maxTarget=Math.max(0,cap-otherEnabled);
  const proposedTarget=round2(beforeTotal>cap ? Math.min(currentBudget,maxTarget) : Math.min(maxTarget,currentBudget+2.5));
  if(proposedTarget!==currentBudget){
    const increasing=proposedTarget>currentBudget;
    candidates.push({action_type:'budget_adjustment',policy_name:increasing?'increase_budget':'decrease_budget',external_write:true,target:`campaign:${campaignId}:daily_budget`,current_value:{daily_budget_eur:round2(currentBudget)},proposed_value:{daily_budget_eur:proposedTarget},reason:increasing?'Create additional delivery headroom while remaining inside the authorized aggregate configured-budget cage.':'Restore the configured aggregate daily-budget total to the authorized cage; no increase is permitted while the live total is above the cap.',evidence_refs:[ref('overview.daily_budget_eur'),ref('account_budget_context.enabled_budget_total_eur')],expected_effect:increasing?'Potentially increase eligible auction participation; actual daily cost remains governed by Google Ads delivery rules and is not a hard daily cost cap.':'Reduce configured budget exposure so the sum of enabled campaign budgets is within the authorized limit.',risk_level:'HIGH',rollback_possible:true,confidence:0.9});
  }
  candidates.push({action_type:'protect_high_intent_local_terms',policy_name:'score_recommendation',external_write:false,target:'keyword_and_negative_guardrail',current_value:'local/near-me queries present in search-term stream',proposed_value:'block any negative-keyword proposal matching near me / in meiner nähe / Kreuzberg / Parma local intent',reason:'Local high-intent traffic is explicitly protected and should not be suppressed without unequivocal contrary evidence.',evidence_refs:[ref('search_terms')],expected_effect:'Preserve high-intent local demand while other traffic is tightened.',risk_level:'LOW',rollback_possible:true,confidence:0.96});

  const terms=Array.isArray(readEvidence.search_terms)?readEvidence.search_terms:[];
  terms.forEach((t,i)=>{
    const q=String(t.search_term||'').trim(); if(!q||PROTECTED_LOCAL.test(q)||!IRRELEVANT_OR_COMPETITOR.test(q)) return;
    if(candidates.filter(x=>x.action_type==='negative_keyword_addition').length>=5) return;
    candidates.push({action_type:'negative_keyword_addition',policy_name:'add_negative_keyword',external_write:true,target:`search_term:${q}`,current_value:{negative:false,observed_search_term:q},proposed_value:{negative:true,match_type:'EXACT',term:q},reason:'Observed live search-term evidence indicates competitor/generic intent with weak geographic relevance; candidate is exact-negative only to limit collateral blocking.',evidence_refs:[ref('search_terms',i)],expected_effect:'Reduce future spend on this exact irrelevant/competitor query while preserving broad local-intent discovery.',risk_level:'MEDIUM',rollback_possible:true,confidence:0.84});
  });

  const kw=(readEvidence.keyword_summary||[]).find(x=>String(x.keyword||'').toLowerCase()==='beste pizza berlin'&&String(x.match_type||'').toUpperCase()==='BROAD');
  if(kw){
    const idx=(readEvidence.keyword_summary||[]).indexOf(kw);
    candidates.push({action_type:'match_type_adjustment',policy_name:'change_keyword_match_type',external_write:true,target:'keyword:beste pizza berlin',current_value:{match_type:'BROAD'},proposed_value:{strategy:'retain broad only with tighter search-term controls; add PHRASE/EXACT coverage before any broad reduction'},reason:'The keyword has substantial live traffic, but booking_completed is not ground truth; tighten intent using query evidence rather than conversion-derived CPA/ROAS.',evidence_refs:[ref('keyword_summary',idx),ref('search_terms')],expected_effect:'Improve intent control without treating raw conversion reporting as economic truth.',risk_level:'MEDIUM',rollback_possible:true,confidence:0.8});
  }

  const devices=Array.isArray(readEvidence.device_distribution)?readEvidence.device_distribution:[];
  const totalImp=devices.reduce((s,x)=>s+Number(x.impressions||0),0); const mobile=devices.find(x=>String(x.device).toUpperCase()==='MOBILE');
  const mobileShare=totalImp?Number(mobile?.impressions||0)/totalImp:0;
  if(mobileShare>=0.8){
    candidates.push({action_type:'rsa_assets_improvement',policy_name:'edit_ads',external_write:true,target:'campaign_rsas_and_assets',current_value:{mobile_impression_share:round2(mobileShare)},proposed_value:{creative_direction:'mobile-first local intent; concise Kreuzberg/Wrangelstraße relevance; explicit late-evening availability where factually supported'},reason:'Live device distribution is overwhelmingly mobile.',evidence_refs:[ref('device_distribution')],expected_effect:'Improve message relevance and clarity for the dominant device segment.',risk_level:'MEDIUM',rollback_possible:true,confidence:0.9});
  }

  candidates.push({action_type:'late_night_schedule_adjustment',policy_name:'change_ad_schedule',external_write:true,target:'campaign_ad_schedule:22:00-23:00',current_value:'existing schedule as reported/configured externally',proposed_value:{protect_or_increase_delivery_window:'22:00-23:00',context_only_weather_signal:context.weather_context||null},reason:'Late Night 22:00–23:00 is strategically important for Parma; weather is context only and is not treated as performance evidence.',evidence_refs:[ref('hourly_distribution'),'context.late_night_strategy','context.weather_context'],expected_effect:'Preserve opportunity to capture later high-intent local demand.',risk_level:'MEDIUM',rollback_possible:true,confidence:0.7});

  if(Array.isArray(readEvidence.geographic_distribution)&&readEvidence.geographic_distribution.length){
    candidates.push({action_type:'geographic_refinement',policy_name:'change_targeting',external_write:true,target:'campaign_geo_targeting',current_value:'current geographic delivery',proposed_value:'review presence-based delivery and tighten only clearly irrelevant geographic segments supported by live evidence',reason:'Geographic relevance is a reliable signal, but refinements require live geography evidence and must preserve Kreuzberg/local reach.',evidence_refs:[ref('geographic_distribution')],expected_effect:'Reduce geographically irrelevant delivery while protecting local reach.',risk_level:'MEDIUM',rollback_possible:true,confidence:0.68});
  }

  const actions=candidates.map((c,i)=>{const cls=classifyFutureAction(c);return {action_id:actionId(fp,i,c.action_type),campaign_id:campaignId,action_type:c.action_type,target:c.target,current_value:c.current_value,proposed_value:c.proposed_value,reason:c.reason,evidence_refs:c.evidence_refs,expected_effect:c.expected_effect,risk_level:c.risk_level,delegation_class:cls.delegation_class,rollback_possible:c.rollback_possible,confidence:c.confidence,conversion_signal_used:'NONE',status:cls.status,policy_reason:cls.policy_reason};});
  const proposedBudget=actions.find(a=>a.action_type==='budget_adjustment'&&a.status!=='REJECTED')?.proposed_value?.daily_budget_eur ?? currentBudget;
  const proposedTotal=round2(otherEnabled+Number(proposedBudget));
  const proposal={schema:'google_ads.propose_changes.v1',mode:'proposal_only',campaign_id:campaignId,evidence_fingerprint:fp,evidence_schema:readEvidence.schema,date_range:readEvidence.date_range,commercial_context:{goal:context.goal||'maximize_probability_of_real_local_customers',late_night_strategy:Boolean(context.late_night_strategy),weather_context:context.weather_context||null,conversion_integrity:'booking_completed_not_ground_truth; table_reservation_completed_not_final_ground_truth'},budget_cage:{cap_eur:cap,before_total_eur:round2(beforeTotal),target_campaign_before_eur:round2(currentBudget),target_campaign_proposed_eur:round2(Number(proposedBudget)),proposed_total_eur:proposedTotal,hard_daily_cost_cap:false,validated:proposedTotal<=cap},actions,counts:{AUTO_EXECUTABLE:actions.filter(a=>a.status==='AUTO_EXECUTABLE').length,NEEDS_HUMAN:actions.filter(a=>a.status==='NEEDS_HUMAN').length,REJECTED:actions.filter(a=>a.status==='REJECTED').length},auto_executable_action_ids:actions.filter(a=>a.status==='AUTO_EXECUTABLE').map(a=>a.action_id),needs_human_action_ids:actions.filter(a=>a.status==='NEEDS_HUMAN').map(a=>a.action_id),rejected_action_ids:actions.filter(a=>a.status==='REJECTED').map(a=>a.action_id),mutations_executed:0,writes_allowed:false,execution_allowed:false,spend_allowed:false};
  return {validated:validateProposal(proposal),correctable:false,evidence:proposal};
}

module.exports={proposeChanges,validateProposal,MAX_DAILY_BUDGET_EUR};
