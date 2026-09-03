# Direct Connections Architecture

## Objective
Parma agents must not use Philippe as middleware between the agent and business software. Human interaction is reserved for authentication/consent, payment/security challenges, and policy-defined external mutation gates.

## Design rule
Agents talk to the Parma Ads Agent backend/control plane. The backend owns durable service integrations, normalized read models, permission gates, audit and source health. Chat sessions are disposable clients, not credential stores.

## Connection classes

### A. Durable read connections — target autonomous
- Google Ads API: campaign/query/conversion diagnostics.
- GA4 Data API: event/funnel/attribution diagnostics.
- Wix API: Table Reservations and order ground truth, aggregate/no-PII by default.
- Meta Marketing API: account/campaign/issue diagnostics.
- Public web/local-search evidence where no authenticated API is required.

### B. Durable bounded-write connections — separate permission
Future mutations use narrowly scoped backend actions with audit, simulation, rollback and explicit delegation. Read authorization never implies write/spend authorization.

### C. Human-only gates
Initial OAuth/app authorization, passkey/2FA, CAPTCHA, payment/billing/security restrictions, consent that the provider requires from the account owner, and RED mutations not already delegated.

## Credential architecture
- No password, passkey, access token, refresh token, API key or client secret in chat, prompts, GitHub, logs, state JSON or artifacts.
- Provider credentials live only in the authorized runtime secret store/environment.
- Agents receive capabilities and sanitized results, never raw secrets.
- OAuth refresh must be backend-managed where provider policy permits.
- Connection state records provider/account/site/property IDs, scopes, health and last verified read, but never secrets.

## Shared connection registry
Each integration should expose a normalized status:
`provider`, `account_ref`, `resource_ref`, `read_scope`, `write_scope`, `health`, `last_verified_at`, `reauth_required`, `human_gate_reason`, `source_of_truth`, `pii_policy`.

Required behavior:
1. Test existing connection without Philippe.
2. Refresh credentials automatically where supported.
3. If healthy, execute allowed read autonomously.
4. If unhealthy, classify the exact blocker.
5. Ask Philippe only when the blocker genuinely requires account-owner interaction.
6. After the human gate is cleared, resume automatically from durable state rather than asking him to repeat the workflow.

## Priority implementation order
1. Wix durable read connection: Table Reservations created-date/status/source aggregate; later direct-order aggregates. This removes the current manual Wix-AI relay.
2. Google Ads + GA4 connection health consolidation: already operational reads become explicit shared connection-registry capabilities.
3. Meta durable read health and smallest possible account/security human gate.
4. Shared connection-health endpoint and agent capability discovery.
5. Bounded mutation adapters only after read paths and audit are stable.

## Wix acceptance criteria
- Correct site identity is pinned by stable site ID, not display name.
- Read reservations by creation timestamp over an exact window.
- Return aggregate created/confirmed/pending/cancelled/non-cancelled/online counts without PII by default.
- Preserve the fact that current reservation records do not expose retrospective Ads/GA4 attribution identifiers.
- No site/settings/tracking mutation in the read adapter.
- Reauthentication is the only routine point where Philippe should be needed.

## Autonomy invariant
A provider UI or provider AI assistant is a fallback, not the primary integration. If a stable API exists, the backend API connection is the target operating path.

## Safety invariant
Autonomy means fewer unnecessary human handoffs, not weaker controls. Observation, recommendation, permission and execution remain separate states.
