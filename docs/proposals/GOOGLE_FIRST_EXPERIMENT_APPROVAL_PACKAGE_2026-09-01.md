# Google First Experiment Approval Package — 2026-09-01

Status: **proposal only**. No Google Ads write, publication, merge, deploy, budget change or spend authorization is included.

## Why this is the first candidate

Fresh live evidence shows two RSA structures with a material structural asymmetry:

- `Gruppo di annunci 1`: **POOR**, 7 headlines, 2 descriptions.
- the second observed ad group: **GOOD**, 15 headlines, 4 descriptions.

At the same time, three BROAD keywords are duplicated across the two groups: `beste pizza berlin`, `pizza napoletana berlin`, and `pizza bio berlin`. Changing RSA structure and keyword routing simultaneously would make later interpretation weaker. The sequencing guard therefore places **RSA structural repair first**, then duplicate-routing observation.

## Proposed mutation

Target: `Gruppo di annunci 1` only.

Change class: ad creative assets only.

Explicit non-changes:

- budget: **€0 change**
- bids: no change
- keywords: no change
- negatives: no change
- geography: no change
- schedule: no change
- tracking/conversions: no change
- landing page: no change
- campaign status: no change

Proposed RSA assets are machine-validated in `rsa-local-experiment-proposal.js`: **15 headlines + 4 descriptions**, all within Google RSA character limits, no duplicate assets. The complete set uses only project-supported local/product/CTA themes and is not published.

## Hypothesis

A structurally complete RSA aligned to Kreuzberg/Wrangelkiez, bio/sourdough and explicit visit/reserve/order intents may improve query-message continuity compared with the current 7/2 POOR RSA.

This is a hypothesis, not a predicted customer count.

## Evaluation hierarchy

Because conversion semantics remain unverified, the experiment must not be declared a business winner from current registered conversions.

1. **Structural:** asset validity, policy eligibility, Google ad-strength change.
2. **Traffic:** impressions, clicks, CTR and CPC, with the same budget/bids/keywords where possible.
3. **Intent routing:** whether near-me/local query families continue receiving appropriate messaging.
4. **Business outcome:** reservations/direct orders only after measurement identity and ground truth are verified.
5. **Walk-ins:** remain a known unmeasured channel; near-me traffic cannot be called waste solely from online conversion absence.

## Observation and rollback

- Do not combine this test with keyword consolidation.
- Capture a pre-change asset snapshot before any future publication.
- Observe long enough to avoid reacting to a single evening/day; exact duration should be set at execution time from traffic volume and measurement maturity.
- Rollback action: restore the previous RSA asset set for `Gruppo di annunci 1`.
- Rollback must not alter budget or unrelated campaign settings.

## What remains a separate gate

Even though the proposal is structurally ready for review, **execution is not authorized**. Publishing the RSA is an external Google Ads mutation and requires the appropriate human/write gate. The agent must not interpret approval of this document, merge/deploy permission, or a future measurement fix as implicit Ads-write permission.

`ready_for_approval_review=true`

`ready_for_execution=false`

`spend_authorized=false`

`writes_allowed=false`