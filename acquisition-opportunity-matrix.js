function clamp(n){ return Math.max(0, Math.min(100, Number(n)||0)); }
function opportunity(row = {}) {
  const intent = clamp(row.intent_score);
  const landing = clamp(row.landing_continuity_score);
  const structure = clamp(row.structural_opportunity_score);
  const evidence = clamp(row.evidence_confidence_score);
  const score = Math.round((intent*0.35 + landing*0.25 + structure*0.20 + evidence*0.20));
  return {
    id:row.id || null, score,
    tier:score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low',
    observed_customer_value:false,
    conversion_evidence_used:false,
    execution_authorized:false
  };
}
function matrix(rows=[]){ return rows.map(opportunity).sort((a,b)=>b.score-a.score); }
module.exports={opportunity,matrix};
