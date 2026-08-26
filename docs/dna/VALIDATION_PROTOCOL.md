# Parma Ads Agent — Validation Protocol v1.2

## Gate 1 — Architecture / Internal Coherence
A change must define target, inputs, outputs, ownership, dependencies, DONE criteria, failure behavior, rollback, observability, state effects and security implications. Reject contradictions, ambiguous authority, circular dependencies, unowned state, silent fallbacks and unverifiable success.

## Gate 2 — Fitness / Adversarial Validation
Actively try to break the proposed change. Evaluate autonomy, reliability, commercial value, speed, observability, recoverability, complexity cost, human burden and safety. Simulate relevant failures including provider outage, auth failure, stale state, database outage, Railway restart, duplicate execution, data conflict, excessive spend and human unavailability.

## Off-target scan
For every mutation verify that only declared targets/scopes change. Reject unexpected changes to Core DNA, delegation, spend controls, secrets, unrelated agents, schemas or runtime behavior.

## Regression gate
Previously verified invariants and capabilities must still pass. A mutation cannot trade away a constitutional invariant for performance.

## Runtime gates
Safe lifecycle: PROPOSE -> TARGET -> PRECONDITION CHECK -> VALIDATE 1 -> VALIDATE 2 -> OFF-TARGET -> REGRESSION -> SHADOW -> CANARY (when applicable) -> COMMIT -> PROPAGATE -> MEASURE -> RETAIN/REVERT.

## Bootstrap Test
A fresh agent with no historical conversation receives only current DNA, manifest and state. PASS only if it correctly identifies identity, mission, authority, prohibitions, current project state, next owned task, other agents and the conditions for human escalation.

## Recovery Test
A second fresh instance must resume from persistent state after the first instance is removed. PASS requires no dependence on hidden conversation history and no loss/duplication of owned work.

## Promotion
DNA becomes ACTIVE only when materialization/schema checks, Bootstrap Test and Recovery Test pass and there are no open architecture P0 blockers.

## DONE
A task is DONE only when implementation, tests, required validation gates, state update and critical regression checks pass. For live integrations, end-to-end verification is also required.