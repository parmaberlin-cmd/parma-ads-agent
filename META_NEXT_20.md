# Meta second 20 — real preflight hardening

1. Register the real preflight endpoint in the runtime bootstrap — done.
2. Require the existing Parma API-key authorization — done.
3. Add `Cache-Control: no-store` and `Pragma: no-cache` — done.
4. Normalize and validate the Meta ad-account identifier — done.
5. Fail closed before HTTP when required runtime configuration is incomplete — done.
6. Require the proposed start time to be at least 15 minutes in the future — done.
7. Use a GET-only Meta transport for the entire endpoint — done.
8. Verify the ad account is readable without returning its ID — done.
9. Verify the account timezone matches `Europe/Berlin` (configurable) — done.
10. Verify the account currency matches `EUR` (configurable) — done.
11. Reuse the existing Page / Instagram / Reel discovery path — done.
12. Paginate campaign inspection so hidden duplicates are not missed — done.
13. Detect duplicate campaign names even when the duplicate is on a later page — done.
14. Paginate creative inspection and reuse one exact matching creative — done.
15. Block duplicate creatives instead of creating another one — done.
16. Validate campaign→adset, adset→ad and ad→creative relationships and fail closed on mismatch — done.
17. Return explicit `level_1_green`, `level_2_green`, and `payload_contract_green` booleans — done.
18. Add deterministic blocker grouping and safe next-action guidance; it never grants writes — done.
19. Expand regression/adversarial tests for runtime config, auth, cache headers, pagination, duplicates, account timezone/currency and relationships — done.
20. Add all new runtime/preflight modules to syntax CI and document the endpoint safety contract — done.

## Two-level validation before runtime execution

**Level 1 — executable validation:** exact-head GitHub CI must pass syntax checks and the complete test suite.

**Level 2 — architecture/safety validation:** verify the runtime route is API-key protected, uses a GET-only Meta transport, returns no Meta object IDs/tokens, does not import or invoke the Meta write transport, leaves the actual create route separately gated, and is evaluated against the current `main` merge result.

## Exit criteria before the real PAUSED one-shot

- latest GitHub CI green on the exact head/merge result;
- runtime real-preflight endpoint deployed and called read-only;
- `ready=true`;
- `levels.level_1_green=true`;
- `levels.level_2_green=true`;
- `levels.payload_contract_green=true`;
- `blockers=[]`;
- any partial chain is recognized and reusable rather than duplicated;
- `maximum_attempts=1`, `may_activate=false`, `may_spend=false`;
- the actual write remains a separate explicitly authorized PAUSED-only action.
