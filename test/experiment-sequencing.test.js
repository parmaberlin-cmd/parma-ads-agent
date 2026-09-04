const test = require('node:test');
const assert = require('node:assert/strict');
const { planExperimentSequence } = require('../experiment-sequencing');

test('fixes RSA structural asymmetry before duplicate keyword routing', () => {
  const out = planExperimentSequence({
    rsa_diagnostics:[{ad_strength:'POOR',issues:[{code:'few'}]},{ad_strength:'GOOD',issues:[]}],
    keyword_overlap:[{keyword:'beste pizza berlin',occurrences:2}],
    conversion_integrity:'unverified',
  });
  assert.equal(out.sequence[0].experiment, 'rsa_structural_rebuild');
  assert.equal(out.sequence[1].experiment, 'duplicate_keyword_routing_observation');
  assert.equal(out.simultaneous_rsa_and_keyword_mutation_supported, false);
  assert.equal(out.conversion_led_decision_supported, false);
});

test('verified conversion integrity still never grants execution permission', () => {
  const out = planExperimentSequence({conversion_integrity:'verified'});
  assert.equal(out.sequence[0].experiment, 'business_outcome_optimization');
  assert.equal(out.execution_authorized, false);
  assert.equal(out.writes_allowed, false);
});