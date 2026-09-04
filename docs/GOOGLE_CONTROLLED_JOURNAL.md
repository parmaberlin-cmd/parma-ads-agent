# Proposal decision journal — preparation only

## Delivered

`ControlledProposalJournal` in google-controlled-journal.js generates a proposal
through the existing evaluator, then persists its exact content, account, content
digest, expiry and decision history. States are proposed, approved, rejected,
cancelled and expired. Approval can be cancelled; rejected/cancelled/expired
records cannot be reapproved. Exact duplicate proposal IDs are rejected.
An approval record never authorizes execution: every returned object explicitly
sets execution_allowed, writes_allowed and spend_allowed to false. There is no
dispatcher, writer, HTTP route, scheduler or MCP tool added by this module.

## Trusted integration boundary — not wired in production

The constructor requires a private absolute directory, a separate integrity key
(Buffer, at least 32 random bytes in deployment), an owner-authentication resolver
and a server clock. Tests use synthetic keys and identities only. No production
secret or configuration has been added. The resolver must authenticate and
authorize the owner independently of all request-body values and return their
stable opaque subject. Existing parma.read OAuth scope does not authorize approval.
Never construct the resolver from a body-supplied actor_id or approval boolean.
Policy and snapshot inputs must come from trusted server-side sources; journal
validation is not proof of owner policy provenance. There is no automatic bridge
from the existing read-only MCP token to this approval interface.

The recorded approval is bound to the exact proposal digest, including its policy
and snapshot digests. `approval_current` checks record state and time only; it is
NOT permission to execute and does not revalidate live policy revocation or account
drift. A future executor must separately resolve current policy, re-read provider
state, check revocation, serialize account writes, validate scope and consume a
single-use execution authorization. No executor is implemented here.

## Persistence and failure behavior

Private directory 0700; file and lock 0600. HMAC-SHA256 detects changes to stored
payloads. Data is integrity-protected, not encrypted; proposal text may include
negative keywords. No OAuth tokens or client secrets belong in proposals.
Updates acquire an exclusive filesystem lock, reload the current state, write a
unique temporary file, fsync it, rename atomically, and fsync the directory.
Conflicting writers fail instead of overwriting each other. Multi-instance tests
verify preservation of previous records. Use only a filesystem with these semantics;
this is not a distributed lock or an account-level Google execution lock.

Malformed JSON, altered content, wrong keys, symlink/hardlink journal files and
disappearance of a previously loaded file fail closed. Corrupt state is not
silently replaced. Capacity is bounded at 1,000 proposals and 3 MiB payload.
A stale lock after a crash deliberately blocks future writes. Recovery requires
operator inspection that no writer remains; no automatic lock stealing or expiry.
An I/O failure after rename can have an uncertain persistence outcome: read the
journal before retrying. Exact duplicate IDs prevent blindly inserting twice;
this does not provide idempotency for future platform writes.

## Verified offline

Tests exercise restart, persisted exact content, trusted actor resolution, digest
mismatch, expiration boundary, clock reversal, rejection/cancellation transitions,
duplicate insertion, independent writer instances, lock contention, corrupted
content, wrong keys, invalid kill-switch values, permissions, symlinks and missing
files. The full repository suite is recorded in BATCH_50_2026-09-04.md.
