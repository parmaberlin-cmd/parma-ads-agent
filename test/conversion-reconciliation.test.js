const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConversionReconciliation } = require("../conversion-reconciliation");

test("current-looking counts remain unverified without semantic and business ground truth", () => {
  const out = buildConversionReconciliation({
    ads_primary_conversions: 10,
    ads_all_conversions: 73,
    ga4_booking_completed: 927,
    ga4_booking_completed_google_cpc: 106,
    ga4_table_reservation_completed: 11,
    ga4_table_reservation_completed_google_cpc: 1,
    ga4_reservation: 2,
    timezone_aligned: false,
    date_basis_aligned: false,
    attribution_compatible: false,
    counting_understood: false,
    semantic_identity_verified: false,
  });
  assert.equal(out.comparisons.ads_all_to_primary_ratio, 7.3);
  assert.equal(out.comparisons.ga4_table_to_ads_primary_ratio, 1.1);
  assert.equal(out.observations.numerical_similarity_is_not_identity, true);
  assert.equal(out.observations.semantic_cause_proven, false);
  assert.equal(out.conversion_integrity, "unverified");
  assert.equal(out.optimization_allowed, false);
  assert.ok(out.blockers.includes("business_ground_truth_missing"));
});

test("missing evidence remains null rather than becoming a false zero", () => {
  const out = buildConversionReconciliation({ ads_primary_conversions: 10, ads_all_conversions: 73 });
  assert.equal(out.evidence.ga4_booking_completed, null);
  assert.equal(out.evidence.wix_online_reservations, null);
  assert.equal(out.comparisons.ga4_booking_to_ads_primary_ratio, null);
  assert.equal(out.comparisons.wix_to_ads_primary_ratio, null);
});

test("even aligned platforms stay blocked when semantic identity is unverified", () => {
  const out = buildConversionReconciliation({
    ads_primary_conversions: 10,
    ga4_table_reservation_completed: 10,
    wix_online_reservations: 10,
    timezone_aligned: true,
    date_basis_aligned: true,
    attribution_compatible: true,
    counting_understood: true,
    semantic_identity_verified: false,
  });
  assert.equal(out.optimization_allowed, false);
  assert.deepEqual(out.blockers, ["semantic_identity_unverified"]);
});

test("verified semantics plus ground truth can clear the matrix without authorizing a write", () => {
  const out = buildConversionReconciliation({
    ads_primary_conversions: 10,
    ga4_table_reservation_completed: 10,
    wix_online_reservations: 10,
    timezone_aligned: true,
    date_basis_aligned: true,
    attribution_compatible: true,
    counting_understood: true,
    semantic_identity_verified: true,
  });
  assert.equal(out.conversion_integrity, "candidate_verified");
  assert.equal(out.optimization_allowed, true);
  assert.equal(out.requires_write, false);
});
