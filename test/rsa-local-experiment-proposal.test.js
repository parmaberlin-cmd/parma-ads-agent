const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLocalRsaExperimentProposal } = require('../rsa-local-experiment-proposal');

test('local RSA proposal fills 15 headlines and 4 descriptions within limits', () => {
  const out = buildLocalRsaExperimentProposal();
  assert.equal(out.headlines.length, 15);
  assert.equal(out.descriptions.length, 4);
  assert.equal(out.asset_validation.proposal_valid, true);
  assert.equal(out.asset_validation.invalid_assets.length, 0);
  assert.equal(out.ready_for_approval_review, true);
});

test('proposal changes no budget bidding keywords targeting tracking or landing page', () => {
  const out = buildLocalRsaExperimentProposal();
  assert.equal(out.budget_change_eur, 0);
  assert.equal(out.bid_change, false);
  assert.equal(out.keyword_change, false);
  assert.equal(out.targeting_change, false);
  assert.equal(out.tracking_change, false);
  assert.equal(out.landing_page_change, false);
});

test('approval readiness never becomes execution permission', () => {
  const out = buildLocalRsaExperimentProposal();
  assert.equal(out.ready_for_execution, false);
  assert.equal(out.publication_authorized, false);
  assert.equal(out.spend_authorized, false);
  assert.equal(out.writes_allowed, false);
  assert.match(out.rollback, /Restore/);
});