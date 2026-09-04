# Isolated read-only integration — 2026-09-01

## Scope and provenance

Integrated on `integration/readonly-operational-report`, based on main
`52adcdd8f81ec46b59cdb22314c020b735e57a7f`:

- PR149: `95376d8fecf9d6b56b23a9e23a8a0c9244fbc81b` (already an ancestor of PR150).
- PR150: `3dd89b9aa977978aa30ed838c19cdfa517f4f8e6`.
- PR151: `c57a4574f25b4bdf1e2106b2a1c1ce31c0956841`.

All three integrate without conflicts; the untouched combined baseline passed
469 tests. No production merge/deploy, ad mutation, credential change or spend.
Other branches remain unchanged. Later commits from another workstream are not
implicitly included in this checkpoint.

## Function / acceptance status

| Function | Acceptance evidence | Result |
| --- | --- | --- |
| Isolated integration | All three heads present in ancestry; full regression | Completed locally |
| Conversion confidence | All seven reconciliation dimensions must pass; similar counts alone insufficient | Completed locally |
| Runtime conversion gate | Missing/malformed metrics, future collection timestamps, unknown semantics block optimization | Completed locally |
| Funnel diagnosis | Missing counts or unverified populations cannot become leakage/outage findings | Completed locally |
| Operational report | Up to five actions; numeric/boolean evidence, benefit hypothesis, blocker and no-write state | Completed locally |
| Runtime cycle | Actual bootstrap exercised with fake collector; real local history persistence; overlapping refresh coalescing, failure preservation and recovery | Completed offline |
| Scheduler | Fake clock/transport; overlap guard; no immediate permission retry; sanitized response/error logs | Completed offline |
| Business impact | Real direct orders, fulfilled orders, incremental customers and margin | Not verified |
| Production | Live collection on this exact integrated build and authenticated endpoint comparison | Not performed; no deploy |

## Corrected failure modes

1. A confidence average could previously be high with one failed dimension.
   All seven now have to be explicitly true. These are diagnostic input claims,
   not authentication or mutation authorization; collectors must not fabricate them.
2. The runtime and legacy shadow engine could accept similar Ads/GA4 counts as
   sufficient evidence. The runtime now consumes `conversion_evidence`; absent
   reconciliation stays unverified. Numerical differences remain descriptive
   until the populations, semantics and periods have been reconciled.
3. Missing clicks/bookings could turn into zero or a -100% trend. Unknown
   metrics now stay null in the affected summary, trend and decision paths.
4. A zero reservation-page event count could become click-to-landing leakage.
   Leakage now requires explicit measurement and population comparability.
   A directly observed unavailable page still produces an outage finding.
5. The integrated runtime withholds conversion-dependent keyword proposals,
   waste amounts, budget scenarios and creative outcome rankings when their
   evidence is unverified. It retains source/delivery and descriptive intent work.
   Revenue estimates require verified business-value inputs, not default spend
   and party-size assumptions attached to ambiguous conversion events.
6. The legacy Meta-click/GA4-google-cpc comparison is removed from integrated
   recommendations because those are different populations.
7. Scheduler calls cannot overlap, arbitrary response status/error strings are
   not logged, and failed history persistence cannot appear as a completed stage.

## Verification

- `node --test`: 525 passing after 56 added regression/integration cases.
- `npm run check`: passed; added modules also exercised by the test suite.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.
- `git diff --check`: passed.
- Bootstrap tests stub collectors/server/preflight: no Google, Meta, Railway,
  real scheduler or account operation occurs. Local history uses a unique
  temporary test directory and is cleaned up afterwards.
- Synthetic verified-evidence fixture lives under `test/fixtures/`; it is not
  imported by production collectors and proves no live business outcome.

## Remaining limits / next safe work

This candidate makes the existing report more conservative; it does not prove
that every legacy standalone analyzer is suitable for autonomous execution.
In particular older standalone attribution helpers are still advisory and must
not be treated as execution authorization. No policy/execution guardian changes.

No live observation or Wix count was invented to unblock measurement. The
direct-order browser observations from PR151 remain dated historical evidence,
expire as configured, and do not prove successful payment or restaurant receipt.

The next technical gate is review of this integration and CI on its exact tree.
Production rollout is separate; after an authorized rollout, read the live
summary and compare `decision_brief`, source freshness and conversion gates.
Provider order evidence can be reconciled when access becomes available without
blocking unrelated code, test and descriptive diagnostics.
