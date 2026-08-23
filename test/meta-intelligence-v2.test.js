const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../meta-intelligence-v2');

test('campaign classifier stays conservative on sparse data', () => {
  assert.equal(m.classifyCampaign({ spend: 2, clicks: 2, impressions: 100, bookings: 0 }), 'insufficient_data');
  assert.equal(m.classifyCampaign({ spend: 5, clicks: 25, impressions: 1000, bookings: 0 }), 'no_conversion_signal');
});

test('budget guardrail blocks weak evidence and large jumps', () => {
  assert.equal(m.budgetGuardrail({ currentBudget: 6, proposedBudget: 7, bookings: 1, confidence: 'high' }).allowed, false);
  assert.equal(m.budgetGuardrail({ currentBudget: 6, proposedBudget: 8, bookings: 5, confidence: 'high' }).allowed, false);
  const accepted = m.budgetGuardrail({ currentBudget: 6, proposedBudget: 7, bookings: 5, confidence: 'high' });
  assert.equal(accepted.allowed, true);
  assert.equal(accepted.execution_allowed, false);
});

test('decision confidence never authorizes execution', () => {
  const result = m.decisionConfidence({ evidenceCount: 10, dataConfidence: 'high', attributionConfidence: 'high', sampleSize: 50 });
  assert.equal(result.confidence, 'high');
  assert.equal(result.executable, false);
  assert.equal(result.writes_allowed, false);
});

test('waste and opportunity detectors require evidence', () => {
  const [waste] = m.wasteDetector([{ name: 'x', spend: 20, clicks: 30, bookings: 0 }]);
  assert.equal(waste.waste_score, 60);
  assert.equal(waste.waste_eur_estimate, 20);
  assert.deepEqual(m.opportunityDetector([{ name: 'x', spend: 10, bookings: 1 }]), []);
  const opportunities = m.opportunityDetector([{ name: 'a', spend: 20, bookings: 4 }, { name: 'b', spend: 30, bookings: 2 }]);
  assert.equal(opportunities[0].name, 'a');
  assert.equal(opportunities[0].executable, false);
});

test('budget simulator never executes', () => {
  const scenarios = m.budgetSimulator({ currentBudget: 6, conversionRate: 0.1, cpc: 0.5 });
  scenarios.forEach((scenario) => {
    assert.equal(scenario.is_simulation, true);
    assert.equal(scenario.execution_allowed, false);
  });
});

test('conversion confidence blocks mismatched attribution', () => {
  assert.equal(m.conversionConfidence({ metaBookings: 10, ga4Bookings: 3 }).optimization_allowed, false);
  assert.equal(m.conversionConfidence({ metaBookings: 10, ga4Bookings: 9 }).optimization_allowed, true);
});

test('landing attribution does not invent reservation-start evidence', () => {
  const result = m.landingAttribution({ adClicks: 100, landingViews: 90, bookingStarts: 0, bookings: 4, bookingStartTracked: false });
  assert.equal(result.landing_to_start, null);
  assert.equal(result.start_to_booking, null);
});

test('booking value estimates margin without claiming certainty', () => {
  const result = m.bookingValue({ bookings: 4, averageBookingValue: 40, averageMarginRate: 0.25 });
  assert.equal(result.estimated_value, 160);
  assert.equal(result.estimated_margin, 40);
  assert.equal(result.is_estimate, true);
});

test('experiments and winner evaluation remain gated', () => {
  const plan = m.experimentPlan({ hypothesis: 'x', variants: ['a', 'b'] });
  assert.equal(plan.activation_allowed, false);
  assert.equal(plan.requires_human_approval, true);
  assert.equal(m.evaluateWinner([{ name: 'a', clicks: 5, bookings: 1 }, { name: 'b', clicks: 6, bookings: 1 }]).winner, null);
});

test('daily and weekly managers remain shadow-only', () => {
  const daily = m.dailyManager([{ severity: 'low' }, { severity: 'high' }, { severity: 'medium' }, { severity: 'critical' }]);
  assert.equal(daily.length, 3);
  assert.equal(daily[0].severity, 'critical');
  assert.equal(m.weeklyStrategicReport({ current: { spend: 10 }, previous: { spend: 8 } }).writes_allowed, false);
});

test('agent health fails closed', () => {
  const result = m.agentHealth({ lastRunAt: '2026-08-20T00:00:00Z', now: new Date('2026-08-23T12:00:00Z'), apiFailures: 3 });
  assert.equal(result.healthy, false);
  assert.ok(result.blockers.includes('shadow_run_stale'));
  assert.ok(result.blockers.includes('repeated_api_failures'));
  assert.equal(result.writes_allowed, false);
});

test('full Shadow Agent V2 cannot write or execute', () => {
  const result = m.fullShadowAgentV2({ conversions: { metaBookings: 2, ga4Bookings: 2 } });
  assert.equal(result.mode, 'shadow_v2');
  assert.equal(result.writes_allowed, false);
  assert.equal(result.execution_allowed, false);
  assert.equal(m.autonomySchedule().writes_allowed, false);
});