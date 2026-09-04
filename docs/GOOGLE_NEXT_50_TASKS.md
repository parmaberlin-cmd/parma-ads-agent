# Next 50 tasks — controlled Google management

Backlog, not completed work or a promise of background execution. All development
defaults to offline/read-only. D = owner decision/access required before activation.
Existing proposed scope does not authorize launching these changes on Ads.

## Trusted inputs
1. Build whole-account campaign inventory adapter.
2. Fetch and reconcile budget resource IDs.
3. Verify inventory pagination completeness.
4. Model shared budget membership and account impact.
5. Read authoritative account currency and timezone.
6. Reject inconsistent snapshots across collector calls.
7. Add immutable versioned snapshot persistence.
8. Verify conversion evidence provenance server-side.
9. Provide an owner policy editor with validation (D).
10. Version owner policies with explicit revocation.

## Approval lifecycle
11. Bind approval to authenticated owner identity.
12. Bind approval to exact proposal and account.
13. Store signed single-use approval records.
14. Implement approval expiry enforcement.
15. Invalidate approval when proposal content changes.
16. Invalidate approval when owner limits change.
17. Add explicit rejection state.
18. Add cancellation before dispatch.
19. Require reconfirmation after material account drift.
20. Display concise before/after owner review.

## Execution infrastructure — disabled until reviewed
21. Design account-level write serialization.
22. Implement durable idempotency keys.
23. Implement crash-safe execution journal.
24. Re-read relevant resources immediately before dispatch.
25. Distinguish failed, successful and uncertain outcomes.
26. Prevent automatic retries on uncertain writes.
27. Build allowlisted Google mutation adapter, disabled by default.
28. Validate proposed requests with supported platform validation.
29. Separate write scope and consent from parma.read (D).
30. Add owner emergency stop and revocation checks.

## Financial and reliability safeguards
31. Add actual-spend collection separately from budget configuration.
32. Define daily/monthly spend objectives and limits with owner (D).
33. Model reporting delays without claiming exact hard spend caps.
34. Track cumulative budget changes across proposals.
35. Add change-frequency limits and cooldowns (D).
36. Read back and compare every applied change.
37. Handle partial mutation failures explicitly.
38. Prepare conditional compensation, never blind rollback.
39. Test journal recovery after interruption.
40. Test conflicting proposals from concurrent sessions.

## Campaign quality and measured outcomes
41. Prepare RSA editing proposals with field validation.
42. Check German copy and destination consistency.
43. Separate dine-in and direct-order proposal objectives.
44. Detect conflicts between negative and active keywords.
45. Validate presence-based local targeting before proposing changes.
46. Compare ad schedules with verified ordering availability.
47. Distinguish completed orders from generic booking events.
48. Build controlled before/after performance comparisons.
49. Add evidence-based proposal outcome evaluations.
50. Prepare an owner-approved limited live acceptance trial (D).

Sequence: trusted inputs -> approvals -> execution infrastructure -> safeguards
-> live trial. Campaign-quality analysis can proceed in read-only alongside this.
No numeric owner budget limits are supplied by this backlog.
