# Unattended Railway execution of authorised commercial jobs

Goal: after an authorised job is handed off, execution continues inside Railway
without the MacBook, a terminal, Codex or an ssh session staying connected.
Nothing here bypasses the existing control plane: a job is an ordinary signed
commercial plan executed by `google-ads-commercial-runner.js` through the
controlled mutation gateway.

## Components

| Piece | Responsibility |
| --- | --- |
| `scripts/submit-commercial-job.js` | Handoff. Validates the handoff file, binds the plan digest, signs the grant and durably queues the job. It never calls the Google Ads API and never executes the plan. |
| `google-ads-unattended-job-store.js` | Durable queue + checkpoints + machine-readable result on the Railway volume. HMAC-sealed and integrity-checked; jobs are written with `fsync` + atomic rename. |
| `google-ads-unattended-runner.js` | Always-on worker: classification from durable evidence, resume, reconciliation, dependency ordering, terminal results. |
| `google-ads-unattended-preload.js` | Service-side hook (loaded with `-r`) that starts the worker. Inert unless `GOOGLE_ADS_UNATTENDED_JOBS=enabled`. |
| `google-ads-operational-rest-transport.js` | Bounded REST transport used for every provider write (the gax/gRPC path hangs in this container). |

## Handoff

1. Operator/Codex writes a handoff file (plan + grant fields) and runs inside the
   container: `node scripts/submit-commercial-job.js /path/handoff.json`
   (`--dry-run` validates and prints the digest without queueing).
2. The script prints `{"status":"QUEUED","job_id":...,"plan_digest":...}` and
   exits. The ssh session may be closed immediately: the job is on the volume.
3. The service worker picks the job up on its next tick (default 15 s) and
   executes it in-process. No client connection participates in execution.

## Grant requirements (fail closed)

`job_signature_invalid`, `job_plan_digest_mismatch`, `job_customer_mismatch`,
`job_spend_must_remain_false`, `job_action_not_authorized`,
`job_action_count_exceeds_grant`, `job_authorization_expired` all stop the job
with `NEEDS_HUMAN` and zero provider calls. `spend_allowed` is a literal `false`
in both the plan and the grant; the runner additionally refuses spend/creation
actions, and activation stays behind
`authorization.activation_allowed`.

## Checkpoints derived from durable evidence

| Evidence in the commercial audit store | Checkpoint | Allowed follow-up |
| --- | --- | --- |
| nothing for the plan digest | `NOT_STARTED` | execute |
| `commercial_plan_execution_reserved`/`_started` only | `RESERVED_ZERO_PROVIDER_WRITE` | execute (no provider boundary was crossed) |
| `commercial_plan_provider_started` or a `change` record with `provider_write` | `PROVIDER_BOUNDARY_REACHED` | read-only reconciliation only; never re-write |
| `commercial_plan_failed_ambiguous` | `AMBIGUOUS` | read-only reconciliation only; never auto-retry |
| `commercial_plan_execution_completed` | `VERIFIED_COMPLETE` | terminal `DONE` |
| `commercial_plan_failed_zero_write` | `FAILED_SAFE` | execute again while attempts remain |

Because the checkpoint is recomputed from the volume after every start, a
Railway restart cannot cause a blind duplicate provider write: the only states
that may run again are those with durable proof that no provider write was sent.

## Results

Each job ends in a durable, machine-readable result file
(`results/<job_id>.json`, HMAC-sealed): `DONE`, `BLOCKED_EXTERNAL`,
`NEEDS_HUMAN` or `FAILED_SAFE`, with `state`, `plan_id`, `plan_digest`,
`attempts`, `provider_write`, `writes_executed`, per-action results, blockers
and evidence. `BLOCKED_EXTERNAL` keeps the job pending (for example while the
emergency stop is set); every other terminal result archives the job.

## Operational switches

* `GOOGLE_ADS_UNATTENDED_JOBS=enabled` – required opt-in for the worker.
* `GOOGLE_ADS_EMERGENCY_STOP=true` – hard stop; checked at job start and again
  immediately before every provider write. Jobs are preserved, not lost.
* `GOOGLE_ADS_WRITE_KILL_SWITCH` / `GOOGLE_ADS_COMMERCIAL_KILL_SWITCH` – remain
  `true` in production; the runner supplies the two values per job from the
  signed grant without mutating the environment or any Railway variable.
* `ADS_JOB_PATH` (optional) – job directory; defaults to
  `<RAILWAY_VOLUME_MOUNT_PATH>/parma-ads-jobs`.

## What is not automated

Nothing enables the worker, opens the kill switches, changes spend or deploys
itself. The current commercial changeset is not executed by this feature and
must still be handed off explicitly, plan by plan.
