# Connection Materialization Plan

Goal: remove Philippe as manual middleware between Parma agents and external systems.

## Operating model

1. Provider credentials live only in backend secret storage.
2. Agents receive named capabilities, never raw credentials.
3. Read capabilities can be GREEN when already authorized and verified.
4. Writes retain separate permission classes and approval gates.
5. Connection loss becomes durable state with the smallest required human action; no repeated browser relay loops.

## Priority order

### P0-A — Shared capability discovery
Materialize protected backend endpoints for capability discovery and health. Required contracts already exist in `connection-api.js`, `connection-registry.js`, and `connection-runtime-health.js`. Runtime route integration remains blocked until the dependency-audit issue is resolved and CI is green.

### P0-B — Wix direct backend read
Target capabilities: reservation aggregate/status read, orders read, source health. Canonical Parma site is recorded in the non-secret registry. One-time OAuth/API authorization may be required, after which recurring reservation/order reads must not require Philippe.

### P0-C — Railway direct backend operations read
Target capabilities: service/deployment status, logs, environment health and service configuration metadata. Tokens belong in Railway/backend secret storage. Deploy remains a separate explicit gate.

### P0-D — Google Ads + GA4 consolidation
Existing backend OAuth/read paths should be surfaced through the shared capability contract so every authorized Parma agent can consume them without recreating auth state.

### P1 — Meta consolidation
Preserve existing diagnostics while separating account/security/payment recovery from normal read access and from all spend/activation mutations.

### P1 — GitHub backend capability
Current chat connector is useful for engineering, but persistent agents should eventually consume scoped repository capabilities through the Control Tower/backend rather than depending on a specific chat session.

## Definition of done per provider

A provider is DIRECT when all are true:
- backend credential/config presence can be detected without exposing values;
- a provider-specific live read health probe succeeds;
- capability resolver marks only verified capabilities usable;
- credentials survive agent/chat restart through provider/backend secret storage;
- a fresh agent can discover and use the capability without Philippe opening a page;
- expired/revoked auth produces one durable blocker and one minimal human recovery action;
- read access cannot imply mutation permission.

## Current security blocker

On 2026-09-03 CI began failing before syntax/tests because `qs@6.15.3`, pulled through Express 4.22.2/body-parser, received new security advisories. `qs@6.16.0` is the patched line. Do not silence the audit or force an Express 5 migration merely to make CI green. Resolve the transitive dependency safely, regenerate the lockfile, then run the complete regression suite before runtime route integration or deployment.
