# Parma Ads Agent — Evolution Protocol v1.2

## Genome Registry
There is one authoritative current genome manifest. Agents may cache DNA but never treat a local copy as authoritative. Before critical work they compare their known version with the registry.

## Germline vs somatic genome
- Germline/Core DNA: constitutional invariants; never self-modifiable. Requires explicit human approval plus both validation gates.
- Somatic/Operational DNA: strategies, thresholds, workflows, scoring, schedules and agent expression; may evolve inside explicit delegation.

## Genome Patch Engine (CRISPR analogue)
Every mutation is a minimal patch with: mutation_id, base_version, target path, previous value, proposed value, rationale/evidence, scope, prerequisites, affected agents, validation status, rollback target and expected fitness effect.

Targeting is exact. The patch engine must reject ambiguous targets or base-version mismatches.

## Preconditions (PAM analogue)
A patch can be applied only if declared contextual prerequisites hold, e.g. compatible genome version, healthy state/audit, required provider health, safe rollback and policy authority.

## Propagation
Lifecycle: PREPARE -> COMPATIBILITY -> COMMIT GENOME VERSION -> PUBLISH CHANGE EVENT -> AGENT SYNC -> ACKNOWLEDGE.
Agents apply only the expression relevant to their genome/scope. Incompatible agents may read but must not mutate until synchronized.

## Atomicity
Global compatibility changes must not leave the system in an unsafe mixed-authority state. If atomic cross-agent activation is not possible, execution-affecting behavior remains gated until all required acknowledgements are present.

## Staging
New behavioral mutations proceed through sandbox/shadow first. Canary is required when a limited real-world test can reduce risk. External write authority is never granted merely because a shadow test passes.

## Phenotype and selection
The system measures observed behavior, not just code completion. Relevant phenotype metrics include autonomous-cycle completion, unnecessary escalations, error rate, data confidence, time-to-recovery, commercial outcomes, profitability where measurable, and human burden.

Retain a mutation only if observed fitness improves or it is required for safety/compliance. Otherwise modify or revert.

## Mutation Graveyard
Rejected/reverted mutations remain searchable with evidence and reason. Re-proposal requires materially new evidence.

## Complexity metabolism
Every mutation declares complexity cost. Periodic housekeeping searches for obsolete endpoints, duplicated rules, dead code, stale feature flags, temporary workarounds and unnecessary agents/services. Evolution may simplify as well as add.

## Event propagation
Genome changes emit versioned events; agents do not rely on manual copy/paste. Scheduler provides periodic reconciliation so missed events cannot permanently desynchronize the organism.