# Issue #280 — AutonomousRuntime controlled-readiness contract (offline only)

Status: **LIVE_PENDING / AUTONOMOUS_VERIFIED=FALSE**. This document is preparation, not an approval, deployment or runtime receipt.

## Audited code boundaries
- One `AutonomousRuntime` and one `RecurringObjectiveScheduler` are constructed in `autonomous-runtime-service.js`. The scheduler calls the existing runtime's `submit` method; it is not a second executor.
- Runtime state: `AUTONOMOUS_RUNTIME_STATE_PATH` > `RAILWAY_VOLUME_MOUNT_PATH/parma-autonomous-runtime.json` > `/tmp/parma-autonomous-runtime.json`.
- Schedule state: `RECURRING_OBJECTIVE_STATE_PATH` > `RAILWAY_VOLUME_MOUNT_PATH/parma-recurring-objectives.json` > `/tmp/parma-recurring-objectives.json`.
- Both state files are separate. `runtime.submit` atomically rejects an already persisted objective ID; scheduler only records a recovered marker when the existing persisted objective's original task specification matches. A conflict or missing lookup produces a persisted scheduler `NEEDS_HUMAN` reconciliation blocker and audit event, not a false success.
- Lock contention MUST NOT advance the scheduler scan cursor. Runtime claims MUST NOT dispatch two tasks within one objective concurrently. Expired read-only leases may replay only when the action is positively allowlisted; ambiguous controlled/unregistered leases stop for human review.
- The kill switch inhibits **new claims**, not cancellation of an already in-flight provider request. No provider-write or spend authority is acquired from task names, scheduler registration or `allowed:true` when standing delegation is required.
- Objective-level `DONE` requires validation. `BLOCKED_EXTERNAL` means provider, capability or validation failure. `NEEDS_HUMAN` includes missing scoped authority, ambiguous crash outcomes and scheduler replay discrepancies. `FAILED` means offline validation/CI or infrastructure proof failed; it is an operator reporting category, not a current runtime terminal value. `LIVE_PENDING` means readiness evidence unavailable, not an executed task.

## Railway read-only inventory (2026-10-18 review)
- Project `affectionate-luck`; environment `production`; service `supportive-stillness`.
- Source repo `parmaberlin-cmd/parma-ads-agent`, branch `main`; one service in this project/environment, one configured replica, no service cron.
- Existing volume `supportive-stillness-volume` mounted at `/data`; service deployment last reported SUCCESS (2026-10-15). No staged changes seen.
- Names include `RAILWAY_VOLUME_MOUNT_PATH` but not `AUTONOMOUS_RUNTIME_STATE_PATH` or `RECURRING_OBJECTIVE_STATE_PATH`. Environment-variable **values are redacted**. With the documented code precedence the expected state files would be `/data/parma-autonomous-runtime.json` and `/data/parma-recurring-objectives.json` **if** the runtime sees the volume mount path as `/data`. This is an inference, not proof of effective paths or file contents.
- Configured one-replica topology does **not** prove one active executor on the running process or prevent another independently deployed process elsewhere. Disk survival through a restart has NOT been demonstrated. Both remain LIVE_PENDING.
- No Railway restart/deploy or state-file inspection was performed.

## Offline CI / negative evidence
Require successful jobs for the **actual final head SHA**: GitHub Actions `test`, `audit`; include regression tests for objective ID collision, task idempotency, sequential claiming, crash/lease recovery, bounded retries, kill switch, fail-closed unknown and delegated actions, scheduler payload mismatch, missing lookup, lock contention, matching recovery and redacted audit. Do not treat passing tests as LIVE evidence.

## Mac E2E preflight — NO LIVE EXECUTION
Separate projects: control-plane draft `parmaberlin-cmd/personal-os-control#40` and backend draft `parmaberlin-cmd/parma-ads-agent#279`. Both remain draft/not merged at review. The control-plane documented contract is in `personal-os-control/docs/step3-scoped-e2e-contract.md` and `docs/step3-e2e-review-and-rollout.md`.

From the **existing Mac checkout of `personal-os-control`**, offline checks only:

```sh
git status --short
git branch --show-current
git rev-parse HEAD
npm run validate:all
```

Expected control review commit at inspection: `af8bbc9c51f86c5eb6efd1f8d51918bcb1ef7239`. The commands do not switch branches or touch operational grant, provider, key, executor or Railway. Record the actual checkout SHA; results on another SHA cannot validate the draft.

A future *separately authorized* Mac E2E must bind exactly one `google_ads.read` R and correlated `step7.evidence.read` E to independently proven principal authority, immutable grant/manifest/task digests, Mac/cloud executor/key identities, customer/Dinner scope, and maximum **15-minute** expiry. Grant and individually signed tasks are distinct. Reserve globally consumed request IDs before access. Original signed ACK must be durably stored, verified and independently GET-read-back; receipt and actual CURRENT must be verified separately, then CURRENT reread and audited. Reject expired/tampered/replayed or ambiguous requests; no auto retry after ambiguous provider effect. Existing control PR #40 states the principal verifier remains **test-only**, so principal proof is NOT LIVE-ready.

Do **not** create/consume a grant, POST ingress, run R or E, access private signing keys or materialize CURRENT under this authorization.

## Bounded controlled rollout / rollback (preparation only)
1. Obtain separate explicit approvals for merge and for deploy, each naming commit SHA and exact scope. Do not infer permission from earlier grants or approvals.
2. Before any submit, read-only verify deployed SHAs, effective state paths, volume access, scheduler marker durability, a single running executor, current kill-switch state, clock/TTL identity bindings and a trusted principal verifier. Stop if any item is unknown.
3. Start with one approved diagnostic/read-only objective; require independent audit receipt and DONE. Never enable Google Ads/Meta writes, publishing, spending or credential changes.
4. Stop criteria: mismatched IDs/digests, scheduler `NEEDS_HUMAN`, unverified volume or worker identity, lock ambiguity, expired grant, missing signed ACK/read-back, inconsistent CURRENT, non-read-only claim, repeated/replayed request, CI drift or unexpected provider access.
5. Rollback requires a **separate** operational approval: engage kill switch to block new claims, suspend the executor/deployment using an authorized method, preserve volumes/audit, return to known-good build. Verify no further claims before considering restore. Never delete/overwrite state as rollback.
6. Capture exact SHAs, timestamps, run/job IDs, redacted objective/task IDs, audit trail, status snapshots, volume mount and restart results, signed ACK proof, receipt and CURRENT digest/verification as applicable. A 200 HTTP response is not evidence of seated customers, revenue or completed E2E.

## Handoff contract to Control Tower 01
Report `STATO`, `RISULTATO VERIFICATO`, `MODIFICHE ESEGUITE`, `TEST E CI`, `DECISIONI`, `PERMESSI VERIFICATI`, `BLOCCANTI`, `PROSSIMO PASSO`, `DOVE CONTINUARE`. Label each fact VERIFIED, INFERRED, STALE or LIVE_PENDING; distinguish offline patch vs deployed code. Do not set `AUTONOMOUS_VERIFIED=TRUE` without full separately authorized E2E evidence. Issue #280 remains open and PR #281 remains draft until explicitly approved.
