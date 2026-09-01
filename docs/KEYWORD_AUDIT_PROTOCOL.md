# Keyword Inventory Audit Protocol

The 29-keyword audit is a fresh-payload task. This protocol defines completion so the Agent cannot overclaim it from a partial snapshot.

For every keyword capture: text, match type, status, ad group, impressions, clicks, cost, CTR, avg CPC, quality/eligibility fields when available, registered conversions as unverified diagnostic evidence, and overlapping semantic theme.

## Structural checks
1. Exact duplicate across ad groups.
2. Same normalized phrase across match types.
3. Semantic overlap likely to route the same query family.
4. Keyword-to-ad-group intent mismatch.
5. High-cost / low-volume outlier (descriptive only).
6. High-volume theme with weak RSA coverage.
7. Local-intent keyword requiring walk-in protection.
8. Keyword with landing-path mismatch.

## Required output
- 29/29 inventory coverage or explicit incomplete count;
- overlap clusters;
- ad-group purpose map;
- consolidation candidates;
- expansion candidates derived from search terms;
- protected local-intent keywords;
- no keyword declared waste solely from registered conversion count;
- no write/execution permission.

## Priority cluster already observed
`beste pizza berlin` is a known cross-ad-group overlap candidate. It must be re-evaluated on fresh inventory together with `pizza napoletana berlin` and `pizza bio berlin`; prior overlap is evidence of structure, not proof of wasted spend.
