function finite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ratio(a, b) {
  const x = finite(a), y = finite(b);
  return x != null && y != null && y > 0 ? x / y : null;
}

function buildConversionReconciliation(input = {}) {
  const adsPrimary = finite(input.ads_primary_conversions);
  const adsAll = finite(input.ads_all_conversions);
  const adsByConversionDate = finite(input.ads_primary_by_conversion_date);
  const ga4Booking = finite(input.ga4_booking_completed);
  const ga4BookingGoogleCpc = finite(input.ga4_booking_completed_google_cpc);
  const ga4Table = finite(input.ga4_table_reservation_completed);
  const ga4TableGoogleCpc = finite(input.ga4_table_reservation_completed_google_cpc);
  const ga4Reservation = finite(input.ga4_reservation);
  const wixGroundTruth = finite(input.wix_online_reservations);

  const evidence = {
    ads_primary: adsPrimary,
    ads_all: adsAll,
    ads_primary_by_conversion_date: adsByConversionDate,
    ga4_booking_completed: ga4Booking,
    ga4_booking_completed_google_cpc_session_scope: ga4BookingGoogleCpc,
    ga4_table_reservation_completed: ga4Table,
    ga4_table_reservation_completed_google_cpc_session_scope: ga4TableGoogleCpc,
    ga4_reservation: ga4Reservation,
    wix_online_reservations: wixGroundTruth,
  };

  const comparisons = {
    ads_all_to_primary_ratio: ratio(adsAll, adsPrimary),
    ga4_booking_to_ads_primary_ratio: ratio(ga4Booking, adsPrimary),
    ga4_booking_google_cpc_to_ads_primary_ratio: ratio(ga4BookingGoogleCpc, adsPrimary),
    ga4_table_to_ads_primary_ratio: ratio(ga4Table, adsPrimary),
    ga4_table_google_cpc_to_ads_primary_ratio: ratio(ga4TableGoogleCpc, adsPrimary),
    ga4_booking_to_table_ratio: ratio(ga4Booking, ga4Table),
    wix_to_ga4_table_ratio: ratio(wixGroundTruth, ga4Table),
    wix_to_ads_primary_ratio: ratio(wixGroundTruth, adsPrimary),
  };

  const blockers = [];
  if (!input.timezone_aligned) blockers.push("timezone_not_aligned");
  if (!input.date_basis_aligned) blockers.push("date_basis_not_aligned");
  if (!input.attribution_compatible) blockers.push("attribution_not_compatible");
  if (!input.counting_understood) blockers.push("counting_not_understood");
  if (!input.semantic_identity_verified) blockers.push("semantic_identity_unverified");
  if (wixGroundTruth == null) blockers.push("business_ground_truth_missing");

  return {
    evidence,
    comparisons,
    observations: {
      numerical_similarity_is_not_identity: true,
      ga4_google_cpc_scope: "session_source_medium",
      google_ads_scope: "ads_attribution",
      semantic_cause_proven: false,
    },
    blockers,
    conversion_integrity: blockers.length ? "unverified" : "candidate_verified",
    optimization_allowed: blockers.length === 0 && input.semantic_identity_verified === true && wixGroundTruth != null,
    requires_write: false,
  };
}

module.exports = { buildConversionReconciliation };
