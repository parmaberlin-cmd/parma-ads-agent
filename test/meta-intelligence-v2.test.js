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

test('conversion confidence blocks mismatched attribution', () => {
  assert.equal(m.conversionConfidence({ metaBookings: 10, ga4Bookings: 3 }).optimization_allowed, false);
  assert.equal(m.conversionConfidence({ metaBookings: 10, ga4Bookings: 9 }).optimization_allowed, true);
});

test('decision confidence never authorizes execution', () => {
  const result = m.decisionConfidence({ evidenceCount: 10, dataConfidence: 'high', attributionConfidence: 'high', sampleSize: 50 });
  assert.equal(result.confidence, 'high');
  assert.equal(result.executable, false);
  assert.equal(result.writes_allowed, false);
});

test('waste detector identifies clicks without bookings', () => {
  const [waste] = m.wasteDetector([{ name: 'x', spend: 20, clicks: 30, bookings: 0 }]);
  assert.equal(waste.waste_score, 60);
  assert.equal(waste.waste_eur_estimate, 20);
});

test('opportunity detector requires conversion evidence', () => {
  assert.deepEqual(m.opportunityDetector([{ name: 'x', spend: 10, bookings: 1 }]), []);
  const opportunities = m.opportunityDetector([
    { name: 'a', spend: 20, bookings: 4 },
    { name: 'b', spend: 30, bookings: 2 },
  ]);
  assert.equal(opportunities[0].name, 'a');
  assert.equal(opportunities[0].executable, false);
});

test('budget simulator is simulation only', () => {
  const scenarios = m.budgetSimulator({ currentBudget: 6, conversionRate: 0.1, cpc: 0.5 });
  assert.ok(scenarios.length >= 4);
  scenarios.forEach((scenario) => {
    assert.equal(scenario.is_simulation, true);
    assert.equal(scenario.execution_allowed, false);
  });
});

test('experiment plans never activate', () => {
  const result = m.experimentPlan({ hypothesis: 'x', variants: ['a', 'b'] });
  assert.equal(result.activation_allowed, false);
  assert.equal(result.requires_human_approval, true);
});

test('winner requires minimum evidence', () => {
  assert.equal(m.evaluateWinner([{ name: 'a', clicks: 5, bookings: 1 }, { name: 'b', clicks: 6, bookings: 1 }]).winner, null);
  assert.equal(m.evaluateWinner([{ name: 'a', clicks: 40, bookings: 3, spend: 30 }, { name: 'b', clicks: 50, bookings: 4, spend: 60 }]).winner, 'a');
});

test('landing attribution does not invent reservation-start diagnostics when event is untracked', () => {
  const result = m.landingAttribution({ adClicks: 100, landingViews: 90, bookingStarts: 0, bookings: 4, bookingStartTracked: false });
  assert.equal(result.landing_to_start, null);
  assert.equal(result.start_to_booking, null);
});

test('booking value can estimate contribution margin', () => {
  const result = m.bookingValue({ bookings: 4, averageBookingValue: 40, averageMarginRate: 0.25 });
  assert.equal(result.estimated_value, 160);
  assert.equal(result.estimated_margin, 40);
});

test('daily manager caps priorities at three', () => {
  const result = m.dailyManager([{ severity: 'low' }, { severity: 'high' }, { severity: 'medium' }, { severity: 'critical' }]);
  assert.equal(result.length, 3);
  assert.equal(result[0].severity, 'critical');
});

test('weekly strategic report remains shadow-only', () => {
  const result = m.weeklyStrategicReport({ current: { spend: 10, bookings: 2 }, previous: { spend: 8, bookings: 1 } });
  assert.equal(result.writes_allowed, false);
  assert.equal(result.mode, 'shadow');
});

test('health monitor fails closed on stale runs and repeated API failures', () => {
  const result = m.agentHealth({ lastRunAt: '2026-08-20T00:00:00Z', now: new Date('2026-08-23T12:00:00Z'), apiFailures: 3 });
  assert.equal(result.healthy, false);
  assert.ok(result.blockers.includes('shadow_run_stale'));
  assert.ok(result.blockers.includes('repeated_api_failures'));
  assert.equal(result.writes_allowed, false);
});

test('full shadow v2 cannot write or execute', () => {
  const result = m.fullShadowAgentV2({ conversions: { metaBookings: 2, ga4Bookings: 2 }, meta: { clicks: 10 } });
  assert.equal(result.writes_allowed, false);
  assert.equal(result.execution_allowed, false);
  assert.equal(result.mode, 'shadow_v2');
});

test('autonomy schedule keeps writes disabled', () => {
  assert.equal(m.autonomySchedule().writes_allowed, false);
});