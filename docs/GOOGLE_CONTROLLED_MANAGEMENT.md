# Controlled Google campaign management — preparation only

## Delivered
Pure, offline proposal evaluator in google-controlled-proposals.js. No routes,
MCP tools, API mutation adapter, credentials, scheduling or platform writes.
Existing autonomy-policy and read-only connector remain unchanged.

Supported proposal types: daily campaign budget, pause, resume, exact/phrase
negative keyword. RSA edits, targeting and bidding changes are not implemented.
Every result remains execution_allowed=false, writes_allowed=false and
spend_allowed=false, even when policy_fit=true. This is NOT an authorization
decision or proof that an owner approved anything.

Inputs must eventually come from trusted server-side sources: authenticated owner
policy, complete account inventory and conversion validation. Never accept model-
supplied policy_fit, approval booleans, inventory completeness or conversion trust
as authority for writes. No real owner limits are configured by this change.

Proposal includes before state, policy/snapshot digests, immutable-content ID,
creation and expiry timestamps. Digests bind content but are NOT signatures or
approval tokens. Freshness and policy expiry are enforced; shared budgets are
blocked pending dedicated treatment. Account totals conservatively include paused
campaign budgets. Budget arithmetic uses integer micros and checks safe integers.

Daily budget totals are configuration ceilings, NOT a hard actual-spend cap.
Before any live rollout, separately design actual-spend tracking, period/timezone,
reporting-delay handling and stop behavior; do not promise an exact spend ceiling
from daily-budget settings alone.

## Acceptance status
Preparation component implemented with automated positive/adversarial tests.
Live controlled management NOT complete or enabled.

## Remaining gates before any external write
1. Owner supplies allowed campaign IDs/actions, budget limits and validity period.
2. Trusted read adapter collects fresh whole-account budget inventory, IDs and
   conversion integrity; resolve shared budgets explicitly.
3. Persist authenticated approval bound to exact proposal digest, expiry and owner;
   no caller-provided booleans. Initially require approval for each proposal.
4. Durable audit journal and idempotency ledger; account-level serialization and
   fresh before-state check prevent concurrent/cumulative changes escaping limits.
5. Separate disabled-by-default mutation adapter with allowlisted fields, platform
   validation, explicit write consent/scope and emergency stop. Do not repurpose
   parma.read or weaken existing global promotion/execution gates.
6. Post-write readback, partial-failure handling and reviewed compensation. Never
   blindly retry uncertain writes or treat budget rollback as recovery of spend.
7. Test and review independently before owner-authorized live validation.

Tests use synthetic policies only. No campaign, budget, announcement, credentials
or spend has been changed by this preparation.
