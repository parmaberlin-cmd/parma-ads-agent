# Direct orders: access-independent engineering workstream

## Objective and ownership

Help nearby customers order directly at https://www.parmaberlin.de/online-ordering.
Keep this work separate from PR #149 (Google exact dates), PR #150 (conversion
semantics and Google diagnostics), and the Wix reservation-ground-truth blocker.
Base for this change: main `52adcdd8f81ec46b59cdb22314c020b735e57a7f`.

No production deployment, tracking changes, advertising edits, account permission
changes, real orders or spend are part of this work. Code and tests on an isolated
branch are GREEN under the existing POLICY DNA. General delegation to advance
engineering is not permission to override production or advertising gates.

## Public-site audit — 2026-09-01, around 17:26 UTC / 19:26 Berlin

Inspected the public site as a visitor, with analytics cookies rejected. Did not
log into Wix, add a cart item, enter customer data, submit an order or pay.

Observed after dynamic rendering:

- The ordering page says it is accepting orders. Only pickup was observed;
  delivery availability remains unknown, not proven disabled.
- It advertises pickup within 20 minutes at Wrangelstraße 90.
- 29 product buttons were present in the product lists. Opening BIO MARGHERITA
  displayed an enabled add-to-cart button at EUR 10. This verifies product
  selection only, not cart persistence, checkout, payment or receipt.
- Empty Abendkarte/Feinkost sections and repeated sections remain visible next
  to the populated pizza list. An empty section is not an empty menu.
- Homepage main section “Order Your Pizza Now” links to Wolt, Lieferando and
  Uber Eats. A direct order link exists in navigation; it was not in that main
  order section.
- Homepage “View Our Full Menu” points to the homepage itself. This verifies
  the link destination, not whether an additional script intercepts the click.
- Homepage says 17–23 while the empty Abendkarte description says 18–23.
  Restaurant opening hours and specific-menu hours may intentionally differ.

The initial search rendering and first browser snapshot were incomplete. Later
rendering showed accepting orders and populated products. Do not use search
snippets, server-rendered placeholders or the saved historical fixture as a live
availability check. This is desktop evidence, not a mobile usability certification.

## Follow-up checkout check — 2026-09-01, 19:24 UTC / 21:24 Berlin

One BIO MARGHERITA was added to an initially empty guest cart. The cart retained
quantity 1, EUR 10 and free pickup. The normal checkout link opened the checkout
form with customer details (email, first/last name and phone), delivery-method and
payment sections. An account-sign-in option was present alongside the guest form.
Express-payment controls were visible but were **not** clicked or validated.

The check stopped before entering any personal data or submitting any checkout
step. No purchase/payment was attempted. The single test item was then removed;
the cart badge returned to 0. No existing customer cart or booking was changed.
Do not confuse the temporary guest cart/checkout with a completed order. Provider
storage and analytics side effects of ordinary page/cart navigation were not
inspected; no claim of zero page-view/cart telemetry is made.

Result: **desktop product-to-cart-to-checkout reachability PASS**. Payment success,
order receipt, restaurant notification, mobile behavior and order-event semantics
remain unverified. No site configuration, advertisement, budget or production
deployment was changed. The earlier observation is retained as historical evidence,
not silently overwritten or re-dated.

Replay the sanitized follow-up using
`node scripts/check-direct-orders.js docs/diagnostics/direct-order-checkout-observation-2026-09-01.json`.
The fixture uses the earliest verification timestamp conservatively; its later menu
recheck counted 20 rendered product controls (not the complete catalog). Like the
earlier fixture, it expires and must not be used as a permanent healthy signal.

## Implemented capability

`direct-order-readiness.js` is a pure evidence evaluator. It emits a fixed-schema
shadow diagnostic for the direct-order objective. `daily-shadow-report.js` accepts
optional `snapshot.direct_orders` evidence and includes its diagnostic separately
from channel bookings. It never converts `booking_completed`, `purchase`, a
positive source-health flag or an event count into verified orders by name alone.

It distinguishes:

- no usable evidence / stale evidence;
- explicitly unavailable step in a particular observation (not root cause);
- product selection verified;
- checkout reachable, still not proof of payment or order receipt;
- separately reconciled online-order outcomes.

Page availability observations expire after one hour. Independently verified
order semantics expire after seven days. These are conservative internal evidence
TTLs, not claims about Google/Wix reporting latency. No outcome numbers, CPA,
leakage rates, delivery radius or business uplift are invented.

All outputs preserve `writes_allowed:false`, `spend_authorized:false` and
`executable:false`. Even full evidence only enables an optimization **review**.
No payment/receipt certification is implemented. Raw URLs/query strings, free
text and unknown fields are not copied to output. Inputs must remain sanitized;
this is not a substitute for secret handling at the data-collection boundary.

## Run and integrate

Offline diagnostic of a sanitized observation:

```sh
node scripts/check-direct-orders.js docs/diagnostics/direct-order-observation-2026-09-01.json
node --test test/direct-order-readiness.test.js
```

The CLI uses the current clock: an old fixture correctly becomes unverified. For
deterministic tests only, call `assessDirectOrders(evidence, {now: new Date(...)})`.
The CLI does not read environment credentials or call external APIs, and rejects
files above 64 KiB. Input errors have fixed messages and never print file content.

Integration contract (caller-supplied facts):

```js
buildDailyShadowReport({
  ...existingSnapshot,
  direct_orders: sanitizedRenderedObservation
});
```

No production collector, scheduled browser session or endpoint is installed by
this change. Absence of `direct_orders` preserves existing report output. This
separates tested code readiness from deployed/live acquisition capability.

## Prioritized next actions

1. Verify mobile product-to-checkout journey without submitting an order; record
   explicit unknowns if the check is blocked. Do not assume pickup implies delivery.
2. Prepare homepage direct-pickup CTA alongside (not masquerading as) delivery
   partners, pointing to `/online-ordering`; actual website publication is gated.
3. Prepare a correction for the menu link and remove/reorganize empty and duplicate
   menu sections once the intended Wix structure is confirmed. Do not edit prices.
4. Validate an online-order outcome with provider records, cancellations/payment
   status and deduplication; do not substitute table reservations.
5. Only then review local acquisition proposals. Existing campaign destination,
   location targeting and tracking still need verified evidence. No budget change
   or promised customer increase is justified by this audit alone.

## Acceptance criteria

Engineering: tests prove missing/stale/loading evidence never becomes a false
outage; pickup is not delivery; empty sections are not empty inventory; booking
events are not orders; the daily report is backward compatible; arbitrary input
does not leak; all output stays non-executable. Run full regression and syntax.

Business activation: **not completed**. Requires live checkout/outcome validation,
approved publication where needed, and measurement of actual orders. Passing
software tests does not mean customers have been acquired.
