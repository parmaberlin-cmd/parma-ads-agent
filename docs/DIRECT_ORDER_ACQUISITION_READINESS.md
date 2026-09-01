# Direct Order Acquisition Readiness — no site write

## Goal
Turn high-intent mobile traffic into verified Parma-controlled orders where the current ordering system actually supports them, while keeping marketplace orders analytically separate.

## Readiness gates
1. Public path verified: search/ad → intended landing → order CTA.
2. Mobile continuity verified: CTA visible and destination current.
3. Order semantic verified: a completed signal maps to a real successful order, not page load or checkout start.
4. Deduplication verified using an order-safe identifier or platform ground truth without storing PII in Agent state.
5. Attribution/date/timezone contract explicit.
6. Cancellation/refund semantics explicit.
7. Contribution economics complete enough to compare direct and marketplace value.
8. Evidence mature and fresh.

## Mobile CTA hierarchy proposal
- Primary intent-specific action: Order when the query expresses order/takeaway intent.
- Reservation remains separate, never treated as an order.
- Visit/location action remains available for local/near-me intent because walk-ins may be under-measured.
- Marketplace choices should not obscure a verified Parma-controlled order path when direct ordering is actually available.

## Metrics
Observed: impressions, clicks, landing sessions, CTA interactions.
Verified outcomes: completed direct orders, completed marketplace orders where data exists, completed reservations.
Commercial: contribution per verified incremental outcome. Unknown inputs remain null.

## Failure rules
Do not optimize to add-to-cart/begin-checkout as if they were orders. Do not claim direct economics are superior until explicit fees/costs are known. Do not publish CTA changes from this branch.
