# Parma private MCP — implemented, disabled pending deployment/configuration

## Scope and evidence (2026-09-03)

The custom-plugin UI is available. This change adds the official SDK's Streamable HTTP
transport, three read-only tools and an owner-only OAuth provider using the SDK's
authorization/token/revocation handlers. No Google Ads mutations or GBP capability.

MCP is disabled by default. Missing/invalid configuration or unreadable token storage
blocks MCP only, leaving the existing app running. /health/mcp exposes fixed safe status
labels; enabled:true is NOT a live connection acceptance test.

## Authentication boundaries

- One explicitly preregistered ChatGPT confidential client, client_secret_post.
  No dynamic registration or machine-to-machine grants.
- Authorization-code + PKCE S256, exact redirect/resource binding, issuer identification
  on successful and error redirects. Access restricted to scope parma.read.
- A dedicated Google Web OAuth client is used ONLY for openid/email sign-in.
  Existing Ads/GA4 OAuth credentials and scopes are untouched.
- Verified owner email, Google signature/audience/issuer/expiry, nonce,
  Secure/HttpOnly/SameSite browser cookie and explicit CSRF-protected read-only consent.
- Single-use 60-second codes; access at most one hour; rotating refresh tokens with
  a 30-day absolute grant lifetime. Owner reconnects after 30 days, not indefinite autonomy.
  Replay revokes the refresh family; the revocation endpoint also revokes its family.
- Raw access/refresh tokens are returned ONLY through the OAuth token endpoint.
  Model tools never return tokens; disk stores hashes only.
- Store: HMAC integrity, private permissions, atomic rename/fsync, exclusive write lock
  and optimistic revision check. Missing/corrupted state or write conflict fails closed.
- Supported initial deployment: one process/replica and persistent volume.
  Restart during sign-in requires repeating consent; issued tokens survive restart.
  A crash leaving tokens.json.lock blocks writes: an operator must verify that no
  writer is running before removing that specific stale lock.

## Read boundaries

| Tool | Internal GET route |
| --- | --- |
| parma_shadow_health | /health/agent-shadow-summary |
| parma_google_test | /tools/google/test |
| parma_campaign_intelligence | /tools/google/campaign/{digits}/intelligence?days=1..90 |

Fixed loopback destination; no redirects/proxy/arbitrary URLs or methods; 30-second
reader timeout; 2 MiB output; 32 KiB MCP request; 4 concurrent requests; 120/min global
rate cap; Host/Origin allowlists. Root response allowlists preserve existing diagnostic
schemas. Recursive filtering blocks configured credentials and recognizable secret
keys/values; it is defense in depth, not a universal detector. Raw provider errors
are not forwarded. All MCP calls require server-side authorization.

## Tests and release requirements

52 targeted tests cover owner/nonce/audience/issuer/expiry, cookie/CSRF/races/replay,
code/client/redirect/resource/scope binding, rotation/revocation, storage tamper/failure/
conflicts, GET forwarding, disabled behavior, metadata, real SDK initialization/list/call
and SDK client-secret/PKCE token exchange. Google identity/read calls are mocked.

Run npm run check, npm run check:mcp, npm run test:mcp, npm test and
npm audit --omit=dev --audit-level=moderate. Full local suite and syntax checks passed
on the final isolated worktree based on main, including issuer metadata. Validate CI too.
Audit initially identified moderate qs advisories. Pinning patched qs@6.16.0 removed
them without migrating Express 4 to 5. Latest local audit: zero findings.

No live Google OAuth, Ads read or production connection test has passed for this MCP.

## Deployment sequence — operator access still required

1. Isolated PR from current main, excluding earlier local Wix changes. Pass exact-commit
   CI. Deploy with PARMA_MCP_ENABLED absent/false.
2. Verify production /health/mcp reports disabled and legacy health remains healthy.
3. Authorized Google Cloud operator creates a dedicated Web OAuth client for sign-in.
   Exact callback: existing Railway HTTPS origin + /mcp/oauth/google/callback.
   Do NOT change the Ads/GA4 client, scopes or refresh token.
4. Enter new configuration through Railway's protected variable UI. Generate fresh
   random secrets there or in the owner's password manager, never in chat or the repo.

| Variable | Required role |
| --- | --- |
| PARMA_MCP_PUBLIC_ORIGIN | Existing HTTPS Railway origin, no trailing slash or path |
| PARMA_MCP_OWNER_EMAIL | Exact verified owner Google email |
| PARMA_MCP_CLIENT_ID | Dedicated private ChatGPT client identifier |
| PARMA_MCP_CLIENT_SECRET | New random secret, at least 32 characters |
| PARMA_MCP_REDIRECT_URI | Exact callback shown by ChatGPT; issuer-aware stable URI is https://chatgpt.com/connector_platform_oauth_redirect |
| PARMA_MCP_GOOGLE_CLIENT_ID | Dedicated Google Web sign-in client ID |
| PARMA_MCP_GOOGLE_CLIENT_SECRET | Dedicated Google Web sign-in client secret |
| PARMA_MCP_STATE_DIR | Absolute persistent-volume subdirectory ending in /mcp-auth |
| PARMA_MCP_STORE_KEY | New random HMAC key, at least 43 characters, preserved across deployments |
| PARMA_MCP_SINGLE_REPLICA_CONFIRMED | true only after verifying one process/replica and durable storage |
| PARMA_MCP_ENABLED | true LAST, after prerequisite checks |

Existing PARMA_AGENT_API_KEY and PORT are used normally server-side. Do not extract
credentials from old chat messages or put them in model-visible tool arguments.

5. Deploy; verify configured health, discovery, unauthenticated 401, and output safety.
   Only then provide the verified /mcp URL. Enter the private ChatGPT client credentials
   in secure advanced OAuth fields (not the Google client secret and not chat).
6. Owner completes Google sign-in and Parma read-only consent. Test actual tool discovery,
   Google connection and campaign intelligence in a fresh ChatGPT conversation.
   Only this completes acceptance: CI/deploy/form/health alone do not prove connection.

## Rollback

Set PARMA_MCP_ENABLED=false. This unmounts MCP/OAuth routes but retains safe health.
Preserve the token store for diagnosis. Never delete a volume or rotate existing
Ads/GA4 credentials to undo this connector.

## Official references

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
