# Conversion semantics diagnostic plan — 2026-09-01

Status: diagnostic only; no merge/deploy; no tracking/campaign/budget/spend mutation.

## Evidence currently established

- Google Ads campaign conversion breakdown reports a conversion action named `www.parmaberlin.de (web) booking_completed`.
- GA4 observes `booking_completed`, `table_reservation_completed`, and `reservation` at materially different volumes.
- These names do not establish business semantics. The hypothesis that `booking_completed` is semantically too broad remains unproven until corroborated by Wix reservation ground truth and/or stronger event-flow evidence.
- The current GA4 attribution reader uses session-scoped `sessionSource` / `sessionMedium`; this is not automatically equivalent to Google Ads conversion attribution.
- Current Google Ads standard conversion metrics and GA4 event-date counts are not temporally equivalent by construction.

## Required read-only diagnostics before declaring a cause

1. Google Ads conversion action metadata
   - name / id / status
   - origin / type / category
   - `primary_for_goal`
   - `counting_type`
   - attribution model + data-driven status
   - click-through and view-through lookback windows
   - GA4-linked event/property metadata when exposed

2. Temporal reconciliation
   - retain standard `metrics.conversions` / `metrics.all_conversions` (interaction-date reporting)
   - add `metrics.conversions_by_conversion_date` / `metrics.all_conversions_by_conversion_date`
   - keep both views; never overwrite one with the other
   - compare mature windows separately from the most recent reporting-lag window

3. Timezone evidence
   - read Google Ads `customer.time_zone`
   - read GA4 property timezone through an appropriate read-only API before interpreting calendar-day boundaries
   - do not assume Europe/Berlin

4. GA4 attribution semantics
   - preserve current session-scoped attribution as one view
   - investigate event/key-event-scoped attribution as a separate view
   - never label session `google/cpc` counts as equivalent to Google Ads attributed conversions without validation

5. Event semantics
   - profile `booking_completed`, `table_reservation_completed`, and `reservation` independently
   - inspect date/hour/device/source distribution and event/session/user ratios where API-compatible
   - investigate co-occurring / preceding reservation-related events when feasible
   - Wix real reservation totals remain the preferred business ground truth

## Confidence rule

Numerical similarity alone must not produce high conversion-integrity confidence. Confidence requires evidence across:
- semantic identity,
- comparable time basis,
- compatible attribution basis,
- timezone alignment,
- reporting maturity,
- and external/business ground truth where available.

Until those conditions are satisfied, conversion integrity remains `degraded` / optimization unsafe and any semantic mismatch remains a hypothesis rather than a demonstrated cause.

## Publication gate

All work in this branch is diagnostic/read-only design. Do not merge or deploy without an explicit pre-publication scope check. Do not modify tracking, Google Ads, GA4 configuration, Wix, Meta, campaigns, budgets, bids, ads, keywords, credentials, or spend.