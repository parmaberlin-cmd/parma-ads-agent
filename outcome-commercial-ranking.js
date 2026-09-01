function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rankVerifiedOutcomes(outcomes = []) {
  const eligible = [];
  const excluded = [];
  for (const raw of outcomes || []) {
    const outcome = String(raw.outcome || 'unknown');
    const contribution = finite(raw.contribution_value);
    const expectedIncremental = finite(raw.expected_incremental_customers);
    const verified = raw.measurement_verified === true && raw.incrementality_verified === true && contribution != null && expectedIncremental != null;
    if (!verified) {
      excluded.push({ outcome, reason:'verified_measurement_incrementality_and_value_required' });
      continue;
    }
    eligible.push({
      outcome,
      contribution_value:contribution,
      expected_incremental_customers:expectedIncremental,
      expected_incremental_contribution:Number((contribution * expectedIncremental).toFixed(2)),
    });
  }
  eligible.sort((a,b) => b.expected_incremental_contribution - a.expected_incremental_contribution);
  return {
    ranked:eligible,
    excluded,
    mixed_evidence_never_coerced_to_zero:true,
    ranking_ready:eligible.length > 0,
    execution_authorized:false,
    spend_authorized:false,
    writes_allowed:false,
  };
}

module.exports = { rankVerifiedOutcomes };
