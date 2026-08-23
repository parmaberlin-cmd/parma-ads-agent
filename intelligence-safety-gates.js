const intelligence = require('./meta-intelligence-v2');

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value) {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function safeConversionConfidence(input = {}) {
  const meta = nonNegative(input.metaBookings);
  const ga4 = nonNegative(input.ga4Bookings);
  if (meta === null || ga4 === null) {
    return {
      confidence: 'blocked',
      optimization_allowed: false,
      reason: 'missing_or_invalid_conversion_source',
      writes_allowed: false,
    };
  }
  return { ...intelligence.conversionConfidence({ metaBookings: meta, ga4Bookings: ga4 }), writes_allowed: false };
}

function safeBudgetSimulation(input = {}) {
  const budget = nonNegative(input.currentBudget);
  const conversionRate = nonNegative(input.conversionRate);
  const cpc = nonNegative(input.cpc);
  if (budget === null || conversionRate === null || cpc === null || budget <= 0 || cpc <= 0 || conversionRate > 1) {
    return {
      valid: false,
      reason: 'invalid_or_missing_simulation_input',
      scenarios: [],
      execution_allowed: false,
      writes_allowed: false,
    };
  }
  const changes = Array.isArray(input.changes) ? input.changes.map(finite).filter((value) => value !== null && value > -1 && value <= 1) : undefined;
  if (Array.isArray(input.changes) && changes.length !== input.changes.length) {
    return {
      valid: false,
      reason: 'invalid_budget_change',
      scenarios: [],
      execution_allowed: false,
      writes_allowed: false,
    };
  }
  const scenarios = intelligence.budgetSimulator({ currentBudget: budget, conversionRate, cpc, ...(changes ? { changes } : {}) });
  return {
    valid: true,
    reason: 'simulation_only',
    scenarios: scenarios.map((scenario) => ({ ...scenario, execution_allowed: false })),
    execution_allowed: false,
    writes_allowed: false,
  };
}

function safeOutcomeLearning(input = {}) {
  const before = finite(input.before);
  const after = finite(input.after);
  if (before === null || after === null || !input.metric) {
    return {
      evaluable: false,
      metric: input.metric || null,
      before,
      after,
      delta: null,
      improved: null,
      reason: 'missing_or_invalid_outcome_evidence',
      writes_allowed: false,
    };
  }
  const result = intelligence.outcomeLearning({ before, after, metric: input.metric, higherIsBetter: input.higherIsBetter !== false });
  return { ...result, evaluable: true, writes_allowed: false };
}

function safeBudgetGuardrail(input = {}) {
  const currentBudget = nonNegative(input.currentBudget);
  const proposedBudget = nonNegative(input.proposedBudget);
  const bookings = nonNegative(input.bookings);
  if (currentBudget === null || proposedBudget === null || bookings === null) {
    return { allowed: false, reason: 'missing_or_invalid_guardrail_input', execution_allowed: false, writes_allowed: false };
  }
  const result = intelligence.budgetGuardrail({ currentBudget, proposedBudget, bookings, confidence: input.confidence });
  return { ...result, execution_allowed: false, writes_allowed: false };
}

function assertNonExecutable(value) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (['writes_allowed','execution_allowed','activation_allowed','spend_allowed'].includes(key) && child === true) {
        throw new Error(`intelligence safety contract violated: ${key}`);
      }
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return true;
}

module.exports = {
  finite,
  nonNegative,
  safeConversionConfidence,
  safeBudgetSimulation,
  safeOutcomeLearning,
  safeBudgetGuardrail,
  assertNonExecutable,
};