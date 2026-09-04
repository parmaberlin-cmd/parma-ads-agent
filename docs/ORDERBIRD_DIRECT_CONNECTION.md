# orderbird automatic read connection

Status: provider-supported direct access path researched; machine-to-machine access not yet verified.

## Objective

Use orderbird PRO / MY orderbird as the economic ground-truth source for Parma. The backend should ingest read-only sales data automatically so agents can reconcile advertising and reservations against actual restaurant revenue without Philippe manually exporting files.

## Verified public capabilities (2026-09-04)

Official orderbird material confirms that MY orderbird exposes cloud sales reports and CSV exports for revenue analysis. The exported sales data includes total revenue, gross/net revenue, taxes, payment methods/tips, cancellations, discounts, tables, product groups and articles. orderbird also supports automatic monthly DATEV delivery to an configured adviser email and automatic revenue transfer through ADDISON OneClick. orderbird's partner program explicitly describes data exchange / complete product integration for product partners.

No public self-service API documentation, OAuth client-registration flow, token endpoint, or customer-facing API key workflow was found in the public documentation reviewed on 2026-09-04.

## Chosen architecture

Preferred transport, in order:

1. Official orderbird partner/API or other provider-supported machine-to-machine read access.
2. Provider-supported automatic data delivery into a Parma-controlled ingestion endpoint/mailbox if the official API is not available to a single merchant.
3. Scheduled export ingestion only as a fallback.

Browser scraping, password replay, copied session cookies and credential persistence are explicitly rejected. Agent chats must never hold orderbird credentials.

## Read-only target contract

The Parma backend should normalize orderbird data into non-PII aggregates with these capabilities:

- `revenue_daily_read`
- `revenue_shift_read`
- `receipt_aggregate_read`
- `payment_method_aggregate_read`
- `category_sales_read`
- `article_sales_read`
- `discount_aggregate_read`
- `cancellation_aggregate_read`
- `table_sales_read`
- `source_health`

Initial storage should contain aggregates only. Receipt/customer-level fields are not required for the marketing ground-truth objective and must not be persisted unless separately justified and authorized.

## Required invariants

- Read-only. No POS mutations.
- No credentials, tokens, passwords, cookies or raw authorization headers in repository state, logs, shared agent state or reports.
- Fail closed if account/business scope is ambiguous.
- Berlin-local business date must remain distinct from UTC and from orderbird shift-open date semantics.
- Preserve source timestamps and original gross/net/tax totals for reconciliation.
- Never infer Google/Meta attribution from orderbird receipts unless an explicit source identifier exists.
- Do not treat Ads/GA4 conversion counts as revenue ground truth.

## Acceptance criteria for direct connection

1. Official provider-supported authentication or machine-to-machine delivery path is identified.
2. Parma business/account scope is resolved without exposing credentials.
3. At least one completed-day read returns a revenue total that can be reconciled against MY orderbird for the same reporting semantics.
4. Gross, net and tax totals reconcile within documented rounding rules.
5. Read-only capability and mutation denial are both tested.
6. Health check distinguishes healthy, unavailable and reauthorization/security gates.
7. Credentials remain outside GitHub/shared state.
8. A 7-day backfill can run idempotently.
9. Daily incremental ingestion can run without owner interaction.
10. Failure creates a durable blocker and the smallest owner action only when orderbird actually requires one.

## Current blocker

Public documentation confirms integration/data-exchange support, but a public merchant self-service API specification was not found. The next step is provider/API access discovery and, if orderbird requires it, one owner/provider authorization gate. Until that gate is proven necessary, no manual action is required from Philippe.
