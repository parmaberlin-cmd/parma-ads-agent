const RISK={low:1,medium:2,high:4,critical:8};
function clamp(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0}
function scoreExperiment(x={}){const impact=clamp(x.expected_customer_impact),evidence=clamp(x.evidence_strength),confidence=clamp(x.confidence),risk=RISK[x.risk]||4;const score=Math.round((impact*(evidence/100)*(confidence/100))/risk);return {...x,priority_score:score,execution_allowed:false,spend_authorized:false,measurement_required:true};}
function rankExperiments(items=[]){return items.map(scoreExperiment).sort((a,b)=>b.priority_score-a.priority_score)}
module.exports={scoreExperiment,rankExperiments};
