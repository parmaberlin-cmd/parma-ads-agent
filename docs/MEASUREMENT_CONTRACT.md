# Measurement Contract

Status: diagnostic contract. No campaign, tracking, budget, bid, keyword, ad, Wix or Meta write is authorized by this document.

## Purpose

The Agent must optimize for real commercial outcomes, not for event names or platform counters. A metric may be observed without being trusted as a business outcome.

## Evidence classes

1. **Observed platform signal** — a count reported by Google Ads, GA4, Meta or Wix.
2. **Semantic hypothesis** — a proposed meaning for that signal, not yet proven.
3. **Verified measurement** — a signal whose event meaning, date basis, attribution basis, counting rule and business ground truth are sufficiently reconciled.
4. **Recommendation** — a proposed action based on evidence and confidence.
5. **Permission** — an independent authorization gate. Prediction or confidence never creates permission.
6. **Execution result** — measured outcome after an authorized action.

Observation != hypothesis != recommendation != permission != execution != result.

## Canonical business outcomes

### Online table reservation
A successful customer reservation that exists in the restaurant's actual reservation system. GA4 event names are not canonical merely because they contain `booking` or `reservation`.

Preferred ground truth: Wix Table Reservations once the correct account/site is connected.

### Walk-in / offline customer
A customer who arrives without an online reservation. Search terms such as `near me`, local neighborhood searches, brand queries and `open now` can plausibly influence walk-ins. The absence of a registered online booking must never be treated as proof that these searches are waste.

### Google Ads primary conversion
A conversion credited by Google Ads to a primary conversion action according to Google Ads attribution, counting and reporting semantics. It is not automatically equal to a GA4 event count.

### Google Ads all conversions
A broader Ads metric that may include secondary or otherwise non-primary conversion actions. It must not be used as a direct proxy for real reservations without action-level reconciliation.

### GA4 booking_completed
Observed GA4 event. Business meaning currently **unverified**.

### GA4 table_reservation_completed
Observed GA4 event and a strong semantic candidate for completed table reservation measurement, but numerical similarity to Google Ads is not semantic proof.

### GA4 reservation
Observed GA4 event. Business meaning currently **unverified**.

## Required reconciliation dimensions

A conversion signal cannot reach HIGH trust unless the relevant dimensions are verified:

- semantic identity;
- same or explicitly reconciled calendar window;
- Google Ads account timezone vs GA4 property timezone;
- interaction-date vs conversion-date basis;
- compatible attribution scope;
- counting type / primary-secondary inclusion;
- attribution lookback and reporting lag maturity;
- business ground truth when available.

## Attribution contract

`sessionSource` / `sessionMedium` is session-scoped GA4 attribution. A `google/cpc` session count is not equivalent by definition to a Google Ads attributed conversion. The Agent must label the attribution scope on every cross-platform comparison.

## Date contract

For the 2026-09-01 completed-day comparison, the intended 30-day interval is 2026-08-02 through 2026-08-31 inclusive. This date range must still be interpreted using each platform's actual reporting timezone and date basis.

## Optimization gates

Until conversion integrity is HIGH / verified:

- no budget increase justified by registered CPA or conversions alone;
- no keyword exclusion solely because registered conversions are zero;
- no schedule change based solely on registered conversion timestamps;
- no geo targeting change based solely on conversion absence;
- no RSA performance verdict based solely on conversion counts;
- no canonical GA4 event remapping;
- no tracking mutation.

Structural and descriptive diagnostics remain allowed: CTR, CPC, impression share, rank/budget loss, asset coverage, keyword overlap, query intent, device share, hour distribution and geographic observation categories.

## Confidence rule

Numerical similarity is evidence worth investigating, not proof. A 10 vs 11 count can remain LOW/MEDIUM confidence if semantics, attribution, timezone or ground truth are unknown.

## Permission rule

Even a verified measurement or HIGH-confidence recommendation does not authorize an external write. Campaign, spend, tracking, credentials, payment/security and other gated changes remain subject to independent policy approval.
