# Conversion semantics diagnostic plan — 2026-09-01

Status: diagnostic only; no merge/deploy; no tracking/campaign/budget/spend mutation.

## Evidence currently established

- Google Ads campaign conversion breakdown reports a conversion action named `www.parmaberlin.de (web) booking_completed`.
- GA4 observes `booking_completed`, `table_reservation_completed`, and `reservation` at materially different volumes.
- These names do not establish business semantics. The hypothesis that `booking_completed` is semantically too broad remains unproven until corroborated by Wix reservation ground truth and/or stronger event-flow evidence.
- The current GA4 attribution reader uses session-scoped `sessionSource` / `sessionMedium`; this is not automatically equivalent to Google Ads conversion attribution.
- Current Google Ads standard conversion metrics and GA4 event-date counts are not temporally equivalent by construction.
- The current Wix connector is deliberately excluded from this diagnostic because the user identified the connected account as the wrong Wix account. Ground truth will be reintroduced only after correct access is supplied.

## Read-only diagnostics now implemented on this branch

1. Google Ads conversion action metadata
   - name / resource / status
   - origin / type / category
   - `primary_for_goal`
   - `include_in_conversions_metric`
   - `counting_type`
   - attribution model + data-driven status
   - click-through and view-through lookback windows
   - GA4-linked event/property metadata when exposed

2. Temporal reconciliation
   - retain standard `metrics.conversions` / `metrics.all_conversions` as the interaction-date view
   - query `metrics.conversions_by_conversion_date` / `metrics.all_conversions_by_conversion_date`
   - segment conversion-date metrics by conversion action resource/name
   - emit `date_basis: conversion_date`
   - keep both views; never overwrite one with the other
   - exact reconciliation window for the September 1 completed-day run remains 2026-08-02 through 2026-08-31 inclusive, subject to timezone reconciliation

3. Timezone evidence
   - collector exists for Google Ads `customer.time_zone`
   - GA4 property timezone must still be read through an appropriate read-only source before calendar-day equivalence can be asserted
   - do not assume Europe/Berlin

4. GA4 event semantics
   - exact-date diagnostic reader profiles selected events by `date`, `eventName`, `sessionSource`, and `sessionMedium`
   - measures `eventCount`, `totalUsers`, and `sessions`
   - derives active dates, maximum daily event count, events/user, events/session, and session-attributed google/cpc event counts
   - every event remains `semantic_identity: unverified`
   - attribution is explicitly labelled `session_source_medium`, not Google Ads conversion credit

5. Conversion confidence
   - numerical similarity alone cannot yield high confidence
   - semantic identity, timezone, date basis, attribution compatibility, counting understanding, data maturity, and ground truth are separate evidence dimensions
   - optimization remains blocked unless confidence becomes high

6. Search / keyword / RSA / delivery diagnostics
   - deterministic search-term intent clustering
   - local and `near_me` intent carries explicit walk-in measurement risk
   - no negative keyword is supported from unverified conversion evidence alone
   - cross-ad-group keyword overlap detection is descriptive/proposal-only
   - rank-vs-budget diagnostic blocks spend escalation while conversion integrity is unverified
   - device and hour diagnostics remain descriptive and cannot authorize schedule changes
   - geo interest-vs-presence diagnostics remain descriptive and cannot authorize targeting changes
   - RSA structural analysis no longer treats zero registered conversions as a high-severity performance fault unless conversion evidence is explicitly trusted

7. Meta issue propagation
   - known Meta code `2490455` remains classified as `account_security_or_payment_restriction`
   - repeated appearance across campaign/ad set/ad can be labelled an `account_level_pattern_candidate`
   - the detector always emits `cause_proven: false`
   - human Meta account UI may still be required to prove/resolve the underlying account condition

## CI / validation record

- Earlier full PR regression run: 411/411 tests passed, zero production dependency vulnerabilities at that checkpoint.
- A later focused diagnostic run initially failed because `ga4-event-semantics.js` required `axios` at module load while the lightweight branch workflow intentionally does not install dependencies. This was a test-harness dependency-loading issue, not a live GA4/Google API regression.
- The module was changed to lazy-load the HTTP client only when the live reader is invoked, while allowing injection for tests.
- Follow-up dedicated run `33527574037`, job `99922218326`: SUCCESS.
- The branch workflow has since been expanded to cover RSA conversion-evidence safeguards and Meta propagation diagnostics as well.
- Live new diagnostic readers remain intentionally undeployed.

## Confidence rule

Numerical similarity alone must not produce high conversion-integrity confidence. Confidence requires evidence across:
- semantic identity,
- comparable time basis,
- compatible attribution basis,
- timezone alignment,
- counting configuration,
- reporting maturity,
- and external/business ground truth where available.

Until those conditions are satisfied, conversion integrity remains degraded / optimization unsafe and any semantic mismatch remains a hypothesis rather than a demonstrated cause.

## Publication gate

All work in this branch is diagnostic/read-only design. Do not merge or deploy without an explicit pre-publication scope check. Do not modify tracking, Google Ads, GA4 configuration, Wix, Meta, campaigns, budgets, bids, ads, keywords, credentials, or spend.