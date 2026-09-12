# Control Tower runtime

This branch moves continuation state out of chat and into a durable, fail-closed backend boundary without enabling any ad-platform mutation.

Persistent non-secret state includes goal, tasks, current/next task, task results, bounded errors/retries, blockers, event journal, revision and terminal state. Corrupt state is preserved and blocks continuation rather than being silently replaced. Writes are atomic and guarded by an exclusive lock; duplicate completed idempotency keys are skipped.

Runtime stops only at NEEDS_HUMAN, BLOCKED_EXTERNAL or DONE. Safe tasks automatically advance to the next dependency-ready task. Authorization-required actions are rejected by the existing autonomy policy before an executor is called.

The scheduler is opt-in (`AUTONOMOUS_WORK_LOOP_ENABLED=true`) and refuses ephemeral storage. This branch deliberately does not mount it into production `scheduler-bootstrap.js`; that is the YELLOW-A release gate after exact-head CI, restart/idempotency/concurrency review and production durable-volume verification.

No credentials, API keys, provider tokens, raw customer records or ad-platform write authority belong in Control Tower state. Unknown or secret-shaped state fails closed.
