# Connection Materialization Plan

Goal: remove Philippe as manual middleware between Parma agents and external systems.

## Operating model

1. Provider credentials live only in backend secret storage.
2. Agents receive named capabilities, never raw credentials.
3. Read capabilities can be GREEN when already authorized and verified.
4. Writes retain separate permission classes and approval gates.
5. Connection loss becomes durable state with the smallest required human action; no repeated browser relay loops.
6. Connection health is normalized to `healthy`, `degraded`, `reauth_required`, `external_security_gate`, or `unavailable`.
7. `autonomous_read_allowed` is explicit and independent from mutation permission.
8. Delegation Policy v1.0 is durable state; authorization boundaries cannot self-expand.

## Priority order and current state

### P0-A — Shared capability discovery — IN PROGRESS
Protected connection registry/API modules exist. Registry health is normalized and secret-shaped keys are guarded. Runtime route integration remains blocked until the production dependency audit is green.

### P0-B — Wix direct backend read — EXTERNAL TOOL GATE
Canonical Parma site is pinned. Direct Wix invocation was re-tested on 2026-09-04 and the active Wix tool reports itself disabled. Do not ask Philippe to repeatedly relay reservations manually. Target remains durable reservation aggregate/status read, orders read and source health. If a supported direct path later requires provider owner OAuth, raise one minimal durable owner gate.

### P0-C — Railway direct operations read — VERIFIED / MATERIALIZATION PARTIAL
Direct authorized Railway read is verified for project, service, environment, deployment status/history, logs, runtime health and production domain. Production domain is `supportive-stillness-production-ec37.up.railway.app` on port 8080. Shared-agent backend materialization plus service-config/metrics validation remain. Deploy remains separately gated by Delegation v1.0 YELLOW-A.

### P0-D — Google Ads + GA4 consolidation — LIVE READ VERIFIED / SHARED CONTRACT PARTIAL
Production runtime evidence shows Google and GA4 source health true; Google test and campaign intelligence requests returned 200. Existing backend OAuth/read paths should be surfaced through the shared capability contract after the security gate is cleared.

### P1 — Meta consolidation — READ DEGRADED / WRITE BLOCKED
Production runtime evidence shows Meta source health true and read-only preflight ready, while write readiness is false. Account/security/payment/write recovery remains separate from read access and from all spend/activation mutations.

### P1 — GitHub backend capability — CHAT CONNECTED / BACKEND MATERIALIZATION PENDING
Current connector is useful for engineering. Persistent agents should eventually consume scoped repository capabilities through the Control Tower/backend rather than depend on one chat session.

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

`qs` has been safely remediated to 6.16.0 with an npm-generated lockfile and clean install. A new advisory published 2026-09-03 affects `stream-json<=3.4.0`; `google-ads-api@24.1.0` currently depends on the 1.x stream-json interface, while the fixed stream-json line begins at 3.5.0 and uses a substantially reworked ESM/module architecture. The audit remains fail-closed. Do not weaken the audit, force a breaking google-ads-api downgrade, or blindly override stream-json 3.x. Syntax and tests run diagnostically even when audit fails, but deployment remains blocked until all security gates are green.
