# Google Ads ↔ GA4 conversion reconciliation

## Current verified facts

For Google Ads campaign `23276824770`, the verified intelligence window 2026-07-28 through 2026-08-26 reported 5 Google Ads conversions. All 5 appeared in the Friday 18:00 day/hour segment. This concentration is treated as a tracking diagnostic signal, not as evidence that Friday 18:00 is intrinsically the best commercial slot.

Production GA4 access is now healthy. GA4 observes `booking_completed`, while `reservation_page_view` and `reservation_start` are configured but not observed. Runtime conversion integrity is therefore degraded and optimization is fail-closed.

## Reconciliation contract

Before any optimization uses conversion counts, compare like with like:

1. Identical date window.
2. Explicit Google Ads conversion action(s), not only aggregate campaign conversions.
3. GA4 `booking_completed` total and `google / cpc` subset.
4. Attribution/time semantics documented for both sources.
5. Duplicate-event risk checked using GA4 users/sessions quality metrics.
6. Time-zone assumptions made explicit.

A count mismatch must not be repaired by changing campaigns. It is first classified as instrumentation, attribution, import, time-window, duplicate-event, or source/medium continuity uncertainty.

## Decision gate

Until reconciliation reaches high confidence:

- no budget increase based on conversion CPA;
- no schedule optimization based on the Friday 18:00 concentration;
- no negative-keyword decision solely because a query has zero registered bookings;
- RSA and rank improvements may be prepared as proposals but not justified with untrusted conversion causality.

## Funnel instrumentation investigation

For `reservation_page_view` and `reservation_start`:

- verify the event names emitted by the website/reservation provider;
- determine whether navigation crosses to another domain/origin;
- determine whether consent state prevents analytics events before booking completion;
- verify that GA4 measurement is present on the relevant reservation steps;
- verify session/source continuity into `booking_completed`;
- do not infer that an event is absent merely because a custom event name differs.

## Success criteria

Reconciliation is complete only when the system can explain the relationship between Google Ads conversions and GA4 bookings, upstream reservation events are either observed or deliberately re-mapped to the actual instrumentation, and `conversion_integrity` can become trusted without weakening fail-closed safety.
