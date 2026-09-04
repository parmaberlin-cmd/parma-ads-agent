# orderbird → Parma revenue ground truth

Status: transport-independent read-only ingestion implemented; provider-supported machine-to-machine transport still requires orderbird authorization/discovery.

## Invariants

- orderbird/POS revenue is economic ground truth, not marketing attribution.
- `source_kind=pos_revenue_ground_truth`; `attribution_kind=none`.
- No POS mutations.
- No browser scraping, password replay, copied cookies/sessions, guessed private endpoints, or credentials in repository/shared state.
- No customer or receipt PII is required for the initial contract.
- Berlin-local business date and orderbird shift-open date remain distinct.

## Initial normalized contract

Per business date, when the provider transport exposes them:
- gross revenue
- net revenue
- tax/VAT
- discounts
- cancellations/voids
- payment-method aggregates
- category/product-group aggregates
- article aggregates
- table aggregates
- shift aggregates
- hourly aggregates

The normalizer intentionally does not synthesize Google/Meta/GA4 attribution fields.

## Implemented transport-independent components

- fail-closed read-only adapter with explicit provider-supported transport flag;
- aggregate normalizer with PII rejection boundary;
- atomic durable JSON aggregate store keyed by source + business date;
- idempotent completed-day and configurable 1–90 day backfill ingestion;
- source/store/last-run health state and sanitized provider error state;
- tests for mutation denial, provider gate, PII rejection, attribution separation, durability/idempotency and health errors.

## Verified official provider evidence (2026-09-04)

Official orderbird materials confirm:
- MY orderbird exposes sales statistics, shifts, tax, tables, products/articles and exports;
- DATEV reports can be sent automatically to a configured tax-adviser email at the beginning of the following month;
- DATEV revenue is assigned to the day the shift was opened;
- orderbird Product Partners support everything from simple data exchange to complete product integration;
- orderbird provides an official ISV Partner Request qualification form.

No public merchant self-service API specification, OAuth client registration, merchant API-key provisioning flow or documented direct API endpoint was verified in the official public material reviewed.

## Transport decision

Preferred: official API / partner API / ISV data exchange capable of at least completed-day incremental reads.

Fallback: provider-supported automatic delivery (for example automatic DATEV email) can supply accounting totals without recurring manual export, but it is monthly and does not by itself satisfy the desired daily/hourly/article/table ground-truth contract. It must therefore not be misrepresented as the final connection.

## Acceptance gate

Connection may become usable only after:
1. orderbird identifies an official provider-supported machine transport;
2. Parma account/business scope is explicitly authorized;
3. one completed business day reconciles against MY orderbird under documented shift-date semantics;
4. gross/net/tax reconcile within documented rounding rules;
5. repeated backfill is idempotent;
6. no secret or PII is persisted in shared state;
7. automated incremental ingestion works without Philippe acting as middleware.
