# Controlled Ads Audit v1 canonical migration

## Purpose

Recover from the known legacy serialization defect without erasing evidence. The legacy file remains the source artifact; migration creates a separately verifiable replacement chain from the exact JSON payload that survived on disk.

## Preconditions (fail closed)

1. Provider writes and unattended jobs are stopped before any apply step.
2. The outer HMAC of the legacy envelope verifies with the existing integrity key.
3. The first chain failure is exactly the operator-approved tuple `CHANGE_000253:record_hash`. Any earlier/different failure aborts.
4. The original file bytes are copied byte-for-byte to a read-only evidence file.
5. SHA-256 of those original bytes and the original envelope MAC are recorded in the migration manifest before a replacement can be activated.

## Deterministic reconstruction

- Parse the already-HMAC-verified legacy payload.
- Do not add, remove, reinterpret, or redact legacy payload fields.
- Canonicalize each persisted record through JSON semantics.
- Preserve every legacy `id`, `kind`, `created_at`, and persisted `payload`.
- Recompute `previous_hash` and `hash` sequentially from genesis.
- Append one new `audit` record named `controlled_ads_audit_migrated_v1` with source file SHA-256, source envelope MAC, source sequence/record count, first legacy failure id/class, migration algorithm version, and timestamp.
- Seal the replacement state with the same outer HMAC mechanism.
- Verify the replacement HMAC and complete hash chain before activation.

## Evidence and activation

The apply procedure must produce three artifacts in the audit directory: an immutable legacy evidence copy (exact original bytes), a migration manifest containing hashes/metadata only and never secrets, and the replacement audit envelope.

Activation must be atomic (rename on the same durable volume). The legacy evidence and manifest are never overwritten. If any verification fails, leave the original active file untouched.

After activation, keep Google Ads writes stopped. Independently reconcile provider state before deciding what to do with any queued job. In particular, do not replay v5 or v6 as part of migration.
