# Wix direct-read gate — 2026-09-04

## Target

Direct, recurring, read-only access to the canonical Parma Wix site without using Philippe as a data relay.

Canonical site:
- name: `PARMA di VINIBENEDETTI`
- site id: `66c11302-8e6f-4b7b-86ba-000d67bd839b`

## Latest probe

A direct Wix site-list probe was attempted again on 2026-09-04. The active Wix tool environment returned that the Wix tool is disabled and instructed the agent not to issue further Wix calls in that session.

This is classified as `unavailable`, not `reauth_required`: there is no owner action Philippe can currently perform inside Wix that is known to clear this tool-environment gate. Therefore no human escalation is justified yet.

## Acceptance criteria when a supported direct path becomes available

1. Resolve the canonical site by stable site ID.
2. Confirm site context and installed restaurant/table-reservation capability without exposing unnecessary PII.
3. Discover the official reservation query/list endpoint from Wix documentation; never guess endpoint or request shape.
4. Read reservations by reservation creation timestamp for exact date windows.
5. Aggregate Confirmed/Pending/Cancelled/non-cancelled/online counts.
6. Preserve Wix source `ONLINE` as Wix ground truth; do not invent Google/Maps/Ads attribution when Wix does not expose it.
7. Read orders only as aggregate/business data unless row-level detail is explicitly needed.
8. No Wix mutation is required for the read adapter.
9. If provider OAuth/owner consent is genuinely required, raise one minimal owner gate and resume from durable state afterward.
