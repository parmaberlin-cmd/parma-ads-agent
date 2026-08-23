# Meta next 20 — PAUSED-only path

1. Account-specific read-only preflight core — done.
2. Detect duplicate named campaigns — done.
3. Reject non-PAUSED campaign recovery — done.
4. Inspect existing ad sets read-only — done.
5. Reject multiple ad sets in one-shot chain — done.
6. Inspect existing ads read-only — done.
7. Reject multiple ads in one-shot chain — done.
8. Recover campaign ID without creating duplicate — done.
9. Recover ad set ID without creating duplicate — done.
10. Recover creative ID from existing ad — done.
11. Recover ad ID for verification-only path — done.
12. Combine account inspection with two-level static preflight — done.
13. Return explicit blockers without IDs/tokens — done.
14. Guarantee maximum_attempts=1 — done.
15. Guarantee may_activate=false — done.
16. Guarantee may_spend=false — done.
17. Add reusable HTTP read-only preflight handler — done.
18. Add regression tests for empty/duplicate/active/partial account states — done.
19. Add new modules to syntax/CI validation — in progress on latest head.
20. Runtime account-specific read-only execution — intentionally pending CI green and deployment/runtime availability; no write is authorized by this step.

Exit criteria before live PAUSED creation: latest CI green; real account preflight ready=true; zero blockers; known partial chain reconciled; conservative payload contract green; exactly one explicit PAUSED-only attempt authorized separately.
