const NON_BATCHABLE = new Set(['spend','payment','security','credentials','irreversible']);

function batchHumanGates(gates = []) {
  const actionable = gates.filter(g => g && g.required === true);
  const independent = actionable.filter(g => NON_BATCHABLE.has(g.type));
  const batchable = actionable.filter(g => !NON_BATCHABLE.has(g.type));
  return {
    batchable,
    independent,
    prompt_count_target: (batchable.length ? 1 : 0) + independent.length,
    rule: 'Convenience batching never collapses mandatory independent spend/payment/security/credential/irreversible gates.'
  };
}

module.exports = { batchHumanGates };
