# Direct Order Measurement Contract

Status: diagnostic contract only. It does not alter GA4, Wix, Ads or marketplace configuration.

## Business outcomes

`direct_order_completed` means a verified completed order placed through Parma-controlled ordering infrastructure. It must be proven from order-system ground truth, not inferred from a page view, checkout start, ad click or generic `booking_completed` event.

`marketplace_order_completed` means an order completed through Wolt, Lieferando, Uber Eats or another marketplace. It is commercially distinct because margin, customer ownership and attribution differ from a direct order.

`reservation_completed` remains a separate outcome. A table reservation is never interchangeable with an order.

`probable_walk_in` is an analytical hypothesis derived from local-intent demand and never a counted conversion unless later reconciled to appropriate ground truth.

## Funnel signals

Possible signals may include order page view, menu/product view, add to cart, begin checkout, payment attempt and purchase/order confirmation. Signal names must be discovered from actual instrumentation before becoming canonical.

Observation != business outcome. A funnel event can support diagnosis without receiving conversion credit.

## Required dimensions before optimization

For a signal to become a trusted direct-order conversion, verify:
1. semantic identity with successful order completion;
2. exact source system and generator;
3. counting behavior and deduplication/order ID where available;
4. date/timezone basis;
5. attribution scope;
6. cancellation/refund handling where material;
7. agreement with order-system ground truth over a mature exact-date window.

Until these are verified, `optimization_allowed=false` for conversion-dependent order optimization.

## Channel economics

Direct orders and marketplace orders must be valued separately. The agent must not assume one euro of marketplace revenue equals one euro of direct revenue. Future value inputs may include gross revenue, food cost, payment fee, marketplace commission, incremental labor/packaging and repeat-customer value. Unknown values remain unknown rather than guessed.

## Ads guardrails

- Do not negative local/near-me terms solely because direct-order conversions are absent.
- Do not increase budget from unverified order signals.
- Do not optimize toward marketplace clicks if the commercial objective is direct ordering without an explicit business-value comparison.
- Do not combine reservation and order events into a single canonical conversion merely to increase conversion volume.
