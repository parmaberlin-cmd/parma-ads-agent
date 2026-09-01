# Google Ads ↔ GA4 reconciliation plan

## Scope

Read-only diagnostic work only. No tracking, conversion action, campaign, ad, keyword, bidding, budget, credential, activation, or spend mutation is authorized or required for this phase.

## Exact historical window

The production Shadow collector defines a 30-day window as **completed UTC calendar days only**: it sets `end` to yesterday at UTC midnight and counts backward inclusively. For the 2026-09-01 run, the exact historical window is therefore **2026-08-02 through 2026-08-31 inclusive**. This is the window to use for the first Wix/GA4/Ads ground-truth comparison. Timezone differences must still be documented rather than silently treated as equivalent.

## Verified Google Ads observations

Campaign: `23276824770`.

Existing recent intelligence showed primary Google Ads conversions and a single contributing conversion action named `www.parmaberlin.de (web) booking_completed`. These values must not be assumed equivalent to GA4 event counts until date basis, timezone, attribution semantics, counting semantics, and reporting lag are reconciled.

## Verified GA4 observations

GA4 access is healthy. In the previously observed rolling 30-day window:

- `booking_completed`: 927 total; 106 attributed to `google/cpc` using `sessionSource/sessionMedium`.
- booking quality: 795 users, 863 sessions; the existing coarse duplication heuristic did not flag duplication.
- `table_reservation_completed`: 11 total; 1 `google/cpc`.
- `reservation`: 2 total; 0 `google/cpc`.
- expected `reservation_page_view` and `reservation_start`: configured by the agent, but not observed in GA4.

These facts support hypotheses only. They do not yet prove what business action each event represents.

## Required reconciliation dimensions

1. Use identical explicit calendar dates on Google Ads and GA4.
2. Verify Google Ads account timezone and GA4 property timezone before comparing daily boundaries.
3. Distinguish Google Ads attribution/reporting date from GA4 event date. A conversion can be associated with an earlier ad interaction in Ads while GA4 records the event when it occurs.
4. Record the Google Ads attribution model/counting configuration for the contributing conversion action where the read API exposes it.
5. Treat GA4 `sessionSource/sessionMedium` as session attribution, not as proof of Google Ads conversion credit.
6. Allow for conversion/reporting lag; avoid treating the newest day as fully settled.
7. Check duplicate-event risk using event counts versus users/sessions, but do not conclude absence of duplication from the current coarse threshold alone.

## CI regression on PR #149

The backend change increments the read-only Google intelligence response contract from `reader_version:3` to `reader_version:4` and adds `exact_date_range`.

The failed CI run was not a runtime/API regression. The suite had one stale contract assertion in `test/google-campaign-intelligence-registration.test.js` that still required the literal `reader_version:3`. The run otherwise passed 401 of 402 tests; dependency audit and syntax checks were green. The assertion was updated to require `reader_version:4` and `exact_date_range`. The subsequent CI run #438 completed successfully.

No merge or deploy has been performed.

## Wix ground-truth status

The connected Wix account currently returns zero sites, and resolving a site named `Parma` also returns no site context. Therefore the agent cannot currently read real table-reservation records from Wix. No ground-truth reservation count has been obtained through the connector.

Minimum external evidence needed to continue without changing tracking: the number of successful online table-reservation submissions **created between 2026-08-02 and 2026-08-31 inclusive**. If Wix makes it immediately visible, a separate count of those later cancelled is useful, but no reservation IDs or guest personal data are required.

## Current hypotheses (not causes)

- `booking_completed` may represent a broader Wix/site action than a completed table reservation.
- `table_reservation_completed` may be closer to the business event of interest.
- `reservation_page_view` and `reservation_start` may be custom/expected names that are never emitted by the current Wix reservation implementation, or equivalent steps may be emitted under different names.
- attribution/date/timezone/reporting differences may explain part of the Ads↔GA4 gap even after the correct event is identified.

None of these is promoted to a demonstrated root cause without Wix ground truth or controlled event-level evidence.

## Fail-closed rules

Until reconciliation is demonstrated:

- no budget increase;
- no schedule optimization based on isolated conversion timestamps;
- no negative keywords solely because registered bookings are zero;
- no canonical GA4 event remapping;
- no tracking changes;
- no ad/campaign execution.
