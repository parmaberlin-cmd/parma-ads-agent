# Controlled inventory collection — preparation milestone

The google-controlled-inventory.js module orchestrates a trusted read-only
fetchPage callback. google-controlled-inventory-reader.js now supplies that callback
using the existing google-ads-api SDK and configured environment credentials.
It is not connected to a route, MCP, or the production scheduler. No new live
collection, mutation or deployment has been performed in this development pass.

## Server callback contract

Input: customerId, pageToken (null for the first page), AbortSignal.
Output: customer_id, currency, time_zone, campaigns, next_page_token.
Each campaign has campaign_id, budget_id, daily_budget_micros (safe integer),
status (ENABLED or PAUSED), and shared_budget (boolean). No metric/date filter:
the future adapter must enumerate every non-removed campaign including zero-
traffic campaigns and validate resource/account ownership before normalizing.
IDs must be lossless strings. next_page_token must be explicitly null at the end.
Never accept the callback, normalized pages, or completeness flags from public
request bodies as authorization evidence. The adapter is still a prerequisite.

## Implemented checks

All pages consumed, 100 pages per scan / 10,000 campaigns / 60 seconds total.
Repeated tokens, duplicate campaign IDs, inconsistent shared budgets, invalid
amounts, missing fields, unknown states, currency other than EUR and wrong
accounts fail closed. Timezone must be recognized and consistent across pages.
Two independent complete scans must match after sorting. This detects observed
drift but does not create an atomic provider snapshot or rule out ABA changes.
The timestamp is collection start, not completion, to avoid understating age.
Underlying reader should honor AbortSignal; timeout prevents result use even
if a callback ignores cancellation. No automatic retries. Provider errors are
replaced by fixed codes; partial results and page tokens are never returned.

Returned snapshot matches the proposal evaluator. Conversion trust is always
false until a separate trusted evidence path exists. Shared budgets remain
blocked by the evaluator. Success means inventory collection passed these checks,
not that campaign execution, approval, or spending is authorized.

## Validation and remaining work

Offline tests exercise pagination, second-scan drift, paused campaigns, metadata,
hostile input, sanitized provider failures, shared budgets and proposal integration.
Live stream-completeness validation, durable snapshot storage,
conversion provenance, owner policy UI, approval journal and execution path remain
unfinished. Existing 50-task backlog is retained; do not mark all trusted-input
tasks complete on the strength of these offline checks.

## SDK adapter and diagnostic command

Run `node scripts/run-google-controlled-inventory.js` only in the authorized server
environment with existing Google configuration. Output includes success, counts,
collection time and fixed blockers; no credentials, IDs or raw API errors.
The adapter uses google-ads-api 24.1.0 queryStream (inspected from the pinned npm
package). Each scan reads customer metadata and every non-removed campaign to
stream completion. There are no metric, date or campaign-ID filters. Normalized
pages of 1,000 are local slices of this fully consumed stream, not provider pages.
The 10,000-row limit is checked while consuming the stream. Identifiers and linked
resource names are validated against the configured account. Only DAILY budgets
are accepted; lifetime/custom periods, missing sharing flags and unsafe numeric
IDs/amounts block the entire inventory. Timeout withholds results, but this SDK
does not expose AbortSignal cancellation through queryStream; a pending network
read may finish after timeout and is never used as a successful result.

Offline validation: 60/60 tests across reader, inventory and current proposal
evaluator; includes a 1,001-campaign stream and errors after partial delivery.
No full repository regression or live provider test has been claimed.
Reference: https://developers.google.com/google-ads/api/reference/rpc/v24/BudgetPeriodEnum.BudgetPeriod
