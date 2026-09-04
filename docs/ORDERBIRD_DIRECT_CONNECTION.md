# orderbird automatic read connection

Status: implementation-ready read-only ingestion scaffold is present; provider-supported machine-to-machine transport is not yet authorized/verified.

## Objective

Use orderbird PRO / MY orderbird as Parma's economic ground truth. POS revenue remains a separate fact layer from Google Ads, GA4 and Wix attribution.

## Provider evidence reviewed on 2026-09-04

Official orderbird sources support these statements:

- Product Partners can integrate from simple data exchange through complete product integration: https://www.orderbird.com/en/partner
- orderbird exposes a dedicated ISV Partner Request qualification form: https://www.orderbird.com/en/isv-partner-request
- MY orderbird provides CSV/data exports and DATEV XML export capabilities: https://support.orderbird.com/de_DE/daten-exporte and https://support.orderbird.com/de_DE/datev-xml-export
- ADDISON OneClick can automatically transfer revenue data after merchant-side enablement/consent: https://support.orderbird.com/de_DE/daten-exporte/addison-oneclick-aktivieren
- DATEV reporting assigns revenue to the day on which the shift was opened, so business-date and shift-open semantics must remain explicit: https://support.orderbird.com/de_DE/datev-export/warum-datev-export

No public merchant self-service API specification, OAuth client-registration flow, token endpoint or API-key provisioning flow was verified in this research pass.

## Transport policy

Accepted, in priority order:

1. Official orderbird partner/ISV API or provider-issued read transport.
2. Another orderbird-supported automatic machine delivery into Parma-controlled infrastructure.
3. Provider-supported scheduled export delivery only if it is genuinely automatic after one-time setup.

Rejected:

- MY orderbird login scraping.
- Password replay.
- Persisted browser cookies/sessions.
- Guessed or reverse-engineered private endpoints/authentication.
- Recurring manual exports by Philippe.

## Implemented before provider authorization

- `orderbird-adapter.js`: read-only, fail-closed provider adapter. It refuses reads until a transport explicitly declares itself provider-supported and permanently rejects mutations.
- `orderbird-normalize.js`: aggregate POS normalization with `source_kind=pos_ground_truth` and `attribution_kind=none`; gross/net/tax, discounts, cancellations, payment methods, categories, articles, tables and hourly buckets are supported.
- `orderbird-ingestion.js`: idempotent source+business-date upsert contract, completed-day ingestion and 7-day backfill helper.
- `test/orderbird-integration.test.js`: mutation denial, provider gate, non-attribution, PII rejection and idempotent backfill tests.
- Connection registry entry remains unavailable/fail-closed until real provider access exists.

## Data minimization

Initial ingestion stores aggregates only. Customer names, emails, phone numbers, guest names, receipt identifiers/text and similar receipt/customer-level PII are rejected by the ingestion boundary. Any later need for receipt-level data requires a separate justification and authorization.

## Ground-truth rules

- orderbird POS totals are economic facts, not marketing attribution.
- Ads/GA4/Wix events may be compared with POS totals but must not rewrite them.
- Preserve gross, net and tax totals as provided by the official source.
- Preserve Berlin-local business date and separate it from UTC and shift-open-date semantics.
- Reconciliation must use completed periods and documented rounding semantics.

## Acceptance gate

The connection can become usable only after all of the following are true:

1. orderbird confirms an official machine-to-machine path for this merchant/integration.
2. Account/business scope is verified without exposing secrets in GitHub, chat or shared state.
3. One completed day reconciles to MY orderbird under matching report semantics.
4. Gross/net/tax reconcile within provider rounding rules.
5. Mutation denial remains tested.
6. Health distinguishes healthy, unavailable and owner/provider authorization gates.
7. Seven-day backfill is idempotent.
8. Daily completed-day ingestion runs without owner interaction.

## Current external gate

The code can safely wait in fail-closed state. The next non-code step is provider access qualification through orderbird's official Product/ISV Partner channel or an equivalent orderbird-supported merchant integration path. Philippe should only be involved when orderbird explicitly requires merchant-owner consent or credentials/authorization that only he can grant.
