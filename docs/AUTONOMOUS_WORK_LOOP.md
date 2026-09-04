# Autonomous Work Loop v1

Goal: remove repeated human “proceed” prompts for safe work while preserving hard human gates.

Loop: PLAN -> EXECUTE -> VALIDATE_L1 -> VALIDATE_L2 (when live evidence is required) -> FIX (bounded) -> NEXT. Terminal/interruption states: NEEDS_HUMAN, BLOCKED_EXTERNAL, DONE.

The loop may autonomously select only actions already allowlisted by `autonomy-policy.js`. Campaign creation, activation, spend/budget changes and non-allowlisted external writes remain human-gated. Unknown actions fail closed.

## Two-level validation
L1 is deterministic/offline evidence: syntax, tests, invariants, schema and adversarial checks. L2 is runtime/live read-only evidence: source health, freshness, authenticated reads and post-condition/readback checks. A task that needs L2 cannot be marked done from L1 alone.

## Question engine
Before execution ask mechanically: Is evidence sufficient? fresh? source healthy? action allowlisted? external blocker? human approval required? If safe, continue without prompting Philippe. If not, stop with one precise owner action.

## Persistence contract
Durable state should contain only non-secret goal/task/evidence/blocker/next-action metadata. Chats are disposable clients, never the source of truth. Never persist credentials, raw customer data, raw search terms, or secret-shaped values.

## Anti-loop guarantees
Retries are bounded. Identical failed attempts without changed evidence must not rerun indefinitely. Dependencies must be complete. External permission/auth failures are blockers, not retry targets.

## v1 rollout
This module is deliberately pure and non-executing. First prove selection/gating semantics in CI. Runtime scheduler integration and durable state mutation are separate gates. This prevents a workflow-convenience feature from silently becoming an advertising execution authority.
