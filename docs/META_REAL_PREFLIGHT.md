# Meta real preflight (read-only)

Endpoint: `GET /tools/meta/reservation-draft/real-preflight?starts_at=<future ISO time>`

Safety contract:

- Requires the existing Parma API key.
- Uses only Meta Graph `GET` calls.
- Does not create, update, pause, activate, publish, or delete Meta objects.
- Returns no Meta numeric object IDs or access tokens.
- Sends `Cache-Control: no-store` and `Pragma: no-cache`.
- Requires a start time at least 15 minutes in the future so the exact draft can be validated.
- Verifies Page, Instagram account, and source Reel through the existing discovery path.
- Verifies campaign name/objective/status and blocks duplicate named campaigns.
- Inspects existing ad sets and ads and blocks ambiguous/multiple chains.
- Searches for an existing matching creative so a previous partial attempt can be reused rather than duplicated.
- Blocks campaign/ad set/ad/creative relationship mismatches.
- Runs the two-level static preflight against the account-specific recovered chain.
- Reports only booleans/counts/blocker names, never object IDs.
- `maximum_attempts` is always 1.
- `may_activate`, `may_spend`, and `duplicates_allowed` are always false.

A `ready=true` result is permission to consider the separately authorized one-shot PAUSED test; it is not itself authorization to execute a write.

Required exit criteria before the one-shot PAUSED test:

1. latest GitHub CI green;
2. real runtime endpoint returns `ready=true`;
3. `blockers=[]`;
4. partial chain, if any, is recognized and reusable;
5. conservative payload contract is green;
6. a separate explicit human approval is still required for the actual write attempt.
