# Owner mandate — 4 September 2026

Philippe explicitly clarified that EUR 10 is the sum of configured average daily budgets of ENABLED Google Ads campaigns, not a hard daily incurred/billed-cost limit. Overdelivery is not represented as a code-guaranteed cost cap. Today's cost report can lag and is not definitive.

Account: 7376153998. This deployment's mandate expires at the end of 4 September in Europe/Berlin (21:59:59 UTC). Expiry stops the job, never expands authority. Only existing campaign budget updates are supported. Schedule, keyword, conversion and status mutations are unsupported, preserving 22–23 and near-me queries.

The old actual-cost semantic remains the default executor mode and its tests remain. The internal runner explicitly selects enabled_configured_daily_budget. Before every send it requires a complete fresh account inventory, rejects shared/unknown budgets and verifies both current and proposed enabled totals <= 10,000,000 micros. It cannot prevent an independent person/tool from changing Google Ads concurrently; matching reads are not an atomic Google compare-and-swap.

The independent conversion-integrity gate is unchanged: increases remain blocked by the current reader's untrusted-conversion classification. An economic delegation does not change conversion semantics or self-authorize a failed policy gate.

Runtime entrypoint: google-controlled-runner.js, invoked by the startup preload only when GOOGLE_CONTROLLED_BUDGET_JOB=true and the kill switch is explicitly false. Without an action it only checks inventory/storage. GOOGLE_CONTROLLED_BUDGET_ACTION, if provided by an authorized operator, is parsed as a proposal action and cannot override limits, account, approval flags, snapshots or guards. This is not exposed to read-only MCP.

Approved policy-fit proposals are journalled under the deployed owner mandate on the /data volume. HMAC audit, account locking, durable pending marker, no automatic transport retries and immediate provider readback are retained. Rollback is recorded as a new proposal and must pass the same guards; it is not an unchecked budget increase. An uncertain result blocks further account execution.
