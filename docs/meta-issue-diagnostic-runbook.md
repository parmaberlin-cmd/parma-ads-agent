# Meta issue diagnostic runbook

This runbook is read-only. It never authorizes campaign activation, budget changes, or object creation.

## Decision order
1. Collect campaign, ad set and ad `issues_info` plus effective status.
2. Sanitize diagnostic text before reporting.
3. Classify only when the diagnostic text supports a known family; otherwise keep `unknown`.
4. Treat account/billing and policy/review issues as human/escalation candidates until separately validated.
5. Treat asset/permission, creative/media, targeting/placement, delivery-configuration and schedule issues as repair candidates only after the affected object and parent chain are identified.
6. Do not repair completed or intentionally paused historical campaigns merely to make the dashboard green.
7. Before any repair write, run the safe orchestrator preflight and preserve PAUSED state.
8. After any future repair write, verify Meta's returned status independently.

## Output contract
The diagnostic report may expose sanitized campaign/ad names and issue text, but must not print access tokens, secret values, or environment variables.
