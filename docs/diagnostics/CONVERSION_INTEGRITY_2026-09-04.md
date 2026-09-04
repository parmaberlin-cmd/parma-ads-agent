# Conversion integrity checkpoint — 2026-09-04

Scope: read-only measurement integrity only. No campaign, budget, spend, tracking semantic, Primary Conversion, website, credential, orderbird, or deployment mutation is authorized by this document.

## Common business window

Canonical reconciliation window: **2026-08-02 through 2026-08-31 inclusive**, business timezone **Europe/Berlin**.

Wix ground truth uses **reservation `createdDate` converted to Europe/Berlin calendar date**. This is intentionally reservation-creation time, not the booked dining date.

Google Ads customer timezone was re-read live as Europe/Berlin. GA4 is healthy in production; exact-window event-date collection still needs to be materialized on current main before numerical one-to-one reconciliation is complete.

## Live Wix Table Reservations ground truth

Direct Wix read on 2026-09-04, Parma published site, Table Reservations Query Reservations, privacy-safe aggregation only:

- created reservations: **20**
- `RESERVED`: **9** — confirmed reservation state
- `HELD`: **10** — temporary hold; Wix lifecycle says it expires if not advanced, so this must **not** be renamed `Pending` or counted as a completed booking
- `CANCELED`: **1**
- non-canceled records: **19**, but this is **not** the same as 19 successful bookings because it includes 10 HELD records
- source: **20/20 `ONLINE`**

`ONLINE` proves only how Wix says the reservation was made. It does not distinguish Google Ads, Google organic, Maps, direct, referral, or another online path. No retroactive ad attribution is invented.

Privacy boundary: no guest names, phones, emails, reservation IDs, or free-text messages are persisted in this checkpoint.

## GA4 live production checkpoint

Production shadow health re-read 2026-09-04:

- GA4 source healthy
- `booking_completed`: 947 events, 796 users, 866 sessions, 113 events in `google/cpc` session scope
- `table_reservation_completed`: 12 events, 1 in `google/cpc` session scope
- `reservation`: 2 events, 0 in `google/cpc` session scope
- configured `reservation_page_view`: not observed
- configured `reservation_start`: not observed
- conversion integrity: degraded; optimization not allowed

These current production figures are a rolling shadow checkpoint, not yet the exact 2026-08-02..2026-08-31 reconciliation slice. They are semantic evidence, not the final aligned comparison.

### Semantic conclusions

1. `booking_completed` is **not a trustworthy table-reservation ground truth**. Its volume is orders of magnitude above the 20 Wix reservation records and therefore represents a broader/generic Wix/site booking signal or multiple business actions. It must not be treated as one real table reservation per event.
2. `table_reservation_completed` remains the strongest GA4 **candidate** for a reservation-completion signal, but candidate does not mean verified identity. Exact-window/day-level matching and controlled instrumentation evidence are still required.
3. `reservation` is too sparse to represent all reservation creation.
4. `reservation_page_view` and `reservation_start` are configured expectations but currently unobserved; funnel rates based on them are unavailable.
5. `google/cpc` in the GA4 reader is `sessionSource/sessionMedium` scope. It is not equivalent to Google Ads conversion credit.

## Google Ads semantics

Live Google reader connectivity was re-verified 2026-09-04; account timezone is Europe/Berlin and writes remain disabled.

The diagnostic contract already distinguishes:

- standard Google Ads conversion metrics, which are attributed/reportable on ad-interaction date semantics;
- `conversions_by_conversion_date`, which reports on conversion date;
- GA4 event date, which is when GA4 records the event;
- GA4 `sessionSource/sessionMedium`, which is session attribution and not Google Ads credit.

The known contributing Google Ads conversion action is `www.parmaberlin.de (web) booking_completed`. Its commercial meaning must remain untrusted until the GA4 event semantic identity is verified against Wix. No Primary Conversion change is authorized.

## Reliability classification

- **Wix reservation createdDate + status**: reliable business ground truth for reservation records created and their current Wix lifecycle status.
- **Wix source=ONLINE**: reliable only as Wix online-source classification; unreliable for channel attribution.
- **GA4 booking_completed**: reliable as an observed GA4 event name/count; unreliable as a real reservation count.
- **GA4 table_reservation_completed**: promising semantic candidate; not yet verified as one event per real reservation.
- **GA4 reservation**: observed but not a complete reservation ground truth.
- **GA4 google/cpc session scope**: useful session-attribution evidence; not Google Ads conversion attribution.
- **Google Ads booking_completed conversion**: reliable as Ads-reported conversion credit under its configured action; not reliable as a real reservation count until semantic reconciliation is complete.

## Before / after technical correction plan

No production tracking change is made in this checkpoint.

**Before:** agent can surface a large generic `booking_completed` count beside much smaller reservation-like events; Wix truth is not durably represented in the current production reconciliation; exact-date GA4 reconciliation is not exposed on current main.

**After candidate:** add a read-only conversion-integrity collector that accepts explicit start/end and timezone, stores only aggregate Wix counts by lifecycle status/source, reads GA4 candidate events on the identical event-date window, reads Google Ads both interaction-date and conversion-date metrics, and emits a fixed reconciliation object with semantic confidence and attribution-scope labels. It must fail closed when date basis/timezone/semantic identity differ.

Tests required before any deploy:

1. 2026-08-02..2026-08-31 Europe/Berlin fixture returns Wix 20 total / 9 RESERVED / 10 HELD / 1 CANCELED / 20 ONLINE.
2. HELD is never normalized to confirmed/completed/pending-without-qualification.
3. ONLINE is never normalized to google/cpc or Google Ads.
4. GA4 session attribution is labelled separately from Ads attribution.
5. Ads interaction-date and conversion-date fields cannot be silently compared as identical.
6. `booking_completed` cannot become verified reservation truth solely from numerical similarity.
7. no PII is persisted or logged.
8. optimization remains disabled while semantic identity is unverified.

Rollback: candidate is additive/read-only. Rollback is removal/disablement of the collector and restoration of the previous shadow schema; it must not require reverting any ad-platform, Wix, GA4, or site state.

## Orderbird extension boundary

Future orderbird revenue may attach to a verified business-date/economic-ground-truth layer. It must remain separate from reservation attribution: POS revenue does not retroactively prove that a Wix ONLINE reservation came from Google Ads.

## Current status

**BLOCKED_EXTERNAL for full event-level identity proof, but not for further engineering.** We have aggregate Wix truth and can safely build/test the fail-closed reconciliation layer. A later controlled real reservation test (or provider-supported correlation identifier that contains no prohibited PII) is needed to prove whether `table_reservation_completed` fires exactly once for a completed reservation. Any decision to change commercial conversion meaning or make another event Primary remains RED / NEEDS_HUMAN.
