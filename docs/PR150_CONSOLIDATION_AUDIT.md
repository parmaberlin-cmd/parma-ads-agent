# PR #150 Consolidation Audit

Purpose: identify overlap/cleanup candidates without deleting or merging behavior prematurely.

## Keep as distinct machine-readable concerns
- `conversion-confidence.js`: confidence gate.
- `conversion-reconciliation.js`: cross-source evidence comparison.
- `temporal-reconciliation.js`: timezone/date-basis/attribution compatibility.
- `measurement-contract.js`: business-outcome evidence contract.
- `customer-funnel-integrity.js`: ordered funnel completeness/sanity.

These modules overlap conceptually but have different invariants. They should not be collapsed merely to reduce file count.

## Commercial stack
- `commercial-objective.js`: contribution-based objective.
- `customer-value-economics.js`: explicit break-even CPA / simplified LTV.
- `outcome-commercial-ranking.js`: only verified incremental outcomes may be ranked.
- `customer-acquisition-readiness.js`: cross-outcome readiness.

Future consolidation candidate: expose these behind one facade after their input contracts stabilize. Do not merge implementation now because value, readiness and ranking are intentionally independent safety gates.

## Google search stack
- `google-search-term-analysis.js`: primary intent taxonomy.
- `search-term-secondary-taxonomy.js`: privacy-safe refinement of primary `other`.
- `semantic-refinement-priority.js`: prioritizes unresolved aggregate cells.
- `negative-keyword-review.js`: proposal-only exclusion review.
- `keyword-portfolio-audit.js` and `keyword-consolidation-simulator.js`: keyword structure/routing.

No deletion candidate yet. The important consolidation is orchestration: primary taxonomy → secondary taxonomy → unresolved-cell priority → proposal review.

## Documentation cleanup candidates
Historical cycle/checkpoint documents should remain immutable evidence but should not be treated as current operating truth. `state/CURRENT_STATE.json`, `state/CAPABILITY_REGISTRY.json`, `state/AUTONOMOUS_BACKLOG.json`, `docs/MASTER_ROADMAP.md` and the PR body should be the current pointers.

Potentially stale-by-design documents include dated diagnostics/proposals and autonomous-cycle narratives. Keep them as historical evidence; add supersession pointers rather than rewriting history.

## Safety conclusion
There is no justified code deletion from the changed-file surface at this checkpoint. Consolidation should first happen through stable facades and authoritative-state pointers. Removing apparently duplicated guards could weaken fail-closed behavior.

`deletion_recommended=false`

`merge_deploy_authorized=false`
