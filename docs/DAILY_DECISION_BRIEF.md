# Daily Decision Brief Contract

Purpose: concise daily operating output for Parma Ads Agent. It must prioritize real customer/business value and avoid making Philippe middleware.

## 1. What changed
Only material changes since the prior durable checkpoint. Distinguish source observation from inference.

## 2. Why it matters
Translate platform metrics into possible effect on incremental verified customers, direct orders, reservations, walk-ins or margin. Unknown business effect must be labelled unknown.

## 3. Measurement integrity
State conversion confidence, attribution/date/counting compatibility, maturity and ground-truth status. If degraded, conversion-dependent optimization is blocked.

## 4. Autonomous GREEN work completed
List work actually executed and durable evidence produced. Do not ask permission for already delegated read-only/repo/test tasks.

## 5. Next autonomous action
Select the highest-value unblocked GREEN task. External blockers must not stop unrelated work.

## 6. Proposed mutations
For each future change: evidence, expected business effect, uncertainty, permission class, rollback, observation window and stop condition. Proposal != permission.

## 7. Human gate — only when genuine
Surface only credentials/consent/security/payment, publication/deploy, spend, tracking/campaign writes or data exclusively inaccessible without the user. Batch gates when possible.

## 8. Safety state
Explicit booleans: writes_allowed, spend_authorized, tracking_mutation_authorized, deploy_authorized. Missing permission means false.

## Integrated implementation (isolated candidate, 2026-09-01)

`daily-decision-brief.js` is called by `buildShadowAgentReport`, not a standalone
template. Bootstrap retains `decision_brief` in the completed snapshot, exposes
its five-or-fewer priorities in the sanitized summary and passes them to cycle
and history. A failed refresh preserves the previous completed snapshot and
marks the brief `last_refresh_failed`; its timestamp remains the original one.

Actions contain allowlisted evidence, a benefit **hypothesis**, risk, blocker,
next read-only step and explicit non-execution flags. An empty input produces
two diagnostic actions, not five invented marketing findings. The next action
is a proposal to the operator, not a new autonomous execution loop.

The report does not yet compute changes against yesterday's metrics, prove
incrementality or send a notification. No new scheduler or subscription is
activated. Existing scheduler behavior is tested with an injected transport.
Live collection, provider ground truth and production rollout remain separate
acceptance gates.

Legacy callers of `summarizeChannel` now receive null unknown metrics and
`observed_conversion_signals`; `bookings` and cost per booking require explicit
`booking_semantics_verified`. Legacy daily-manager fields remain for compatibility,
but runtime primary priorities and history prefer the evidence-based brief.

## Operational memory extension (isolated candidate, 2026-09-01)

The runtime now writes an additive `operational_checkpoint` into each bounded
history record and supplies previous history to the next report. Legacy records
remain readable; they are not invented as numeric baselines. Checkpoints include
only fixed metrics, source states, known action codes, period and an internal
reporting-scope fingerprint. Raw customer IDs, query text and error payloads are
not copied into the checkpoint. Scope fingerprints are not public report fields.

`decision_brief.changes` distinguishes new, persistent, no-longer-observed and
unverifiable priorities. Disappearance during a source/sub-collection failure
does not mean resolution. All priorities, including deferred ones, are compared
so movement in/out of the top five is not a new finding. Numerical differences
require the same reporting scope and exact dates and are labelled **same-window
revisions**. Overlapping 30-day windows are not presented as daily growth.

`notification_recommended` is a diagnostic suggestion only. No notification is
sent and no new scheduler is started. First baselines, corrupt history and gaps
over 48 hours remain explicitly unverified.

The sanitized health summary also exposes `daily_brief_text`, a fixed-vocabulary
Italian rendering. `decisionBriefView` rechecks freshness at request time: a
failed refresh, unknown/future timestamp or snapshot older than 36 hours replaces
old recommendations with a source-refresh diagnostic, downgrades public quality
and cycle validation, and withholds ordering-path claims. Stored history is not
mutated. Authenticated refresh errors now use a fixed error code, not raw errors.

`order_signals` uses known candidates from the existing GA4 event inventory;
no new API request is added. Purchase/checkout events are not automatically
verified sales and multiple completion candidates are never summed as orders.
Inventory coverage is explicitly limited. Wix/provider reconciliation remains
required for actual order and revenue claims.

`engineering_queue` summarizes the local workstream queue only. The selector
requires explicit GREEN read-only operations, ready status and met dependencies.
It skips owned/completed/boundary-blocked work and unchanged failed attempts.
Bounded retries require an explicitly retryable read, a due retry time and
remaining attempts (maximum three); authentication/permission failures are not
retried through this mechanism. Selection is never execution or authorization.

For a saved collector snapshot, a local offline renderer is available:

```sh
node scripts/render-offline-brief.js < snapshot.json
```

Input is capped at 1 MiB and invalid input errors do not echo its contents.
The tool does not collect live data, write files, send messages or execute actions.
