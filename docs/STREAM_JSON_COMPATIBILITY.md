# Google Ads streaming dependency remediation

GHSA-528h-pc64-c93x affects stream-json <=3.4.0. The installed
google-ads-api 24.1.0 (latest checked 2026-09-04) declares ^1.8.0.
Do not force the suggested google-ads-api downgrade or exempt the advisory.

The local private @parma/stream-json-compat package replaces that dependency
with a minimal facade over the genuine npm stream-json 3.5.0 release, installed
as stream-json-modern. No old stream-json implementation is shipped. The facade
is not a general replacement: only the SDK's Parser, parser() and StreamArray
entry points are exported. Other legacy subpaths fail closed.

The SDK still uses Node streams; modern generator factories are converted using
their upstream asStream APIs. Its undeclared stream-chain import is pinned
explicitly to 2.2.5; the modern parser has its own stream-chain 4 dependency.
Node >=22.12 is required for synchronous require of ESM; production engines
allow Node 22.12+ through 24. No Google API version, query, credentials, campaign,
budget or authorization scope changes are made.

Validation must include npm ci --ignore-scripts, npm ls, unmodified production
npm audit, full tests, syntax checks and CI. Tests cover split UTF-8 input, packed
and default options, precise string metrics, summaries, malformed JSON, error
envelopes and the actual SDK queryStream with a mock HTTP adapter (no network).
The owner still must complete live MCP consent; mocked tests are not live Ads
validation. Retire this facade when upstream supports a patched parser directly.

Reference: https://github.com/advisories/GHSA-528h-pc64-c93x
