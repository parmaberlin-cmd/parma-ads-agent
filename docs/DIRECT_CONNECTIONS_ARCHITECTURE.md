# Direct Connections Architecture

## Objective
Parma agents must not use Philippe as middleware between the agent and business software. Human interaction is reserved for authentication/consent, payment/security challenges, and policy-defined external mutation gates.

## Design rule
Agents talk to the Parma Ads Agent backend/control plane. The backend owns durable service integrations, normalized read models, permission gates, audit and source health. Chat sessions are disposable clients, not credential stores.

## Durable authorization
`state/DELEGATION_POLICY.json` is the durable authorization source for Delegation Policy v1.0. It separates GREEN autonomous work, YELLOW bounded execution and RED owner gates. Authorization boundaries cannot self-expand. Tool/provider-specific confirmation or security requirements remain binding even when an operation is otherwise delegated.

## Connection classes

### A. Durable read connections — target autonomous
- Google Ads API: campaign/query/conversion diagnostics.
- GA4 Data API: event/funnel/attribution diagnostics.
- Wix API: Table Reservations and order ground truth, aggregate/no-PII by default.
- Meta Marketing API: account/campaign/issue diagnostics.
- Railway: project/service/deployment/config/domain/logs/metrics health reads.
- GitHub: repository/branch/PR/issue/workflow reads and delegated engineering writes.
- Public web/local-search evidence where no authenticated API is required.

### B. Durable bounded-write connections — separate permission
Mutations use narrowly scoped backend actions with audit, simulation, rollback and explicit delegation. Read authorization never implies write/spend authorization. Delegation v1.0 permits bounded YELLOW classes only under their objective conditions.

### C. Human-only gates
Initial OAuth/app authorization, passkey/2FA, CAPTCHA, payment/billing/security restrictions, consent that the provider requires from the account owner, authorization changes and RED mutations.

## Credential architecture
- No password, passkey, access token, refresh token, API key or client secret in chat, prompts, GitHub, logs, state JSON or artifacts.
- Provider credentials live only in the authorized runtime secret store/environment.
- Agents receive capabilities and sanitized results, never raw secrets.
- OAuth refresh must be backend-managed where provider policy permits.
- Connection state records provider/account/site/property IDs, scopes, health and last verified read, but never secrets.
- Shared state is tested for secret-shaped keys before promotion.

## Shared connection registry
Normalized health is a closed enum:
`healthy`, `degraded`, `reauth_required`, `external_security_gate`, `unavailable`.

Each integration exposes explicit `autonomous_read_allowed` independently from mutation permission. Configuration presence, live provider health and verified capability are separate evidence layers.

Required behavior:
1. Test existing connection without Philippe.
2. Refresh credentials automatically where supported.
3. If healthy/degraded and autonomous read is explicitly allowed, execute verified read capabilities autonomously.
4. If unhealthy, classify the exact blocker.
5. Ask Philippe only when the blocker genuinely requires account-owner interaction.
6. An unavailable tool path is not automatically an owner gate.
7. After a genuine human gate is cleared, resume automatically from durable state rather than asking him to repeat the workflow.
8. Unknown connection/capability or mutation permission fails closed.

## Current verified state — 2026-09-04
- Railway direct read: verified, including domain, runtime logs, service configuration and 24h resource metrics. Production source tracks `main`; Railway `checkSuites` is false, so repository/delegation merge gates are critical.
- Google Ads + GA4: live production source health observed; Google test and campaign intelligence returned HTTP 200.
- Meta: read-only runtime preflight is ready; write readiness remains false.
- Wix: direct tool was re-probed and reported itself disabled in the active environment. Classified `unavailable`, not `reauth_required`; do not burden Philippe with speculative reauthentication.

## Priority implementation order
1. Restore production dependency audit green without unsafe overrides/downgrades.
2. Materialize protected connection-health/capability routes after CI is fully green.
3. Materialize Wix durable read when a supported direct tool/API path is available.
4. Consolidate Google Ads + GA4 reads behind shared capability discovery.
5. Consolidate Railway current verified read surfaces for fresh agents.
6. Preserve Meta read path while separating account/security/payment recovery and spend activation.
7. Bounded mutation adapters only within Delegation v1.0 and after audit/rollback controls are stable.

## Wix acceptance criteria
- Correct site identity is pinned by stable site ID, not display name.
- Read reservations by creation timestamp over an exact window.
- Return aggregate created/confirmed/pending/cancelled/non-cancelled/online counts without PII by default.
- Preserve the fact that current reservation records do not expose retrospective Ads/GA4 attribution identifiers.
- No site/settings/tracking mutation in the read adapter.
- Reauthentication is requested only when a real supported connection path proves it is required.

## Deploy invariant
A deployment is YELLOW-A only when CI is fully green, there is no new known vulnerability, the change is limited/tested, no credential/billing/owner/permission or spend increase is involved, healthcheck and rollback exist, and post-deploy verification plus rollback-on-failure are defined. Otherwise deployment is blocked/escalated.

## Autonomy invariant
A provider UI or provider AI assistant is a fallback, not the primary integration. If a stable API exists, the backend API connection is the target operating path.

## Safety invariant
Autonomy means fewer unnecessary human handoffs, not weaker controls. Observation, recommendation, permission, execution and result remain separate states.
