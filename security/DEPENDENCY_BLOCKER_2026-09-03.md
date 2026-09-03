# Dependency security blocker — 2026-09-03

CI production dependency audit fails on `qs@6.15.3` through Express 4.22.2 / body-parser after newly published advisories.

## Required remediation

- Target patched `qs@6.16.0`.
- Prefer a lockfile-consistent transitive override/update over a forced Express 5 migration.
- Regenerate `package-lock.json` with npm, do not hand-edit dependency metadata if avoidable.
- Run `npm audit --omit=dev --audit-level=moderate`.
- Then run syntax checks and the complete test suite.
- Preserve Express 4 runtime behavior unless a separate migration is deliberately validated.

## Safety

Do not weaken the audit threshold to hide the finding. Do not deploy until CI is green. This blocker is independent from campaign/tracking/spend permissions.
