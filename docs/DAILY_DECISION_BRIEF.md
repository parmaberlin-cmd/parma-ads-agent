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
