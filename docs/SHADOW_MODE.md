# Agent Shadow Mode

`agent-shadow.js` is the cross-module orchestration layer for Parma Ads Agent V2.

It combines conversion integrity, anomaly detection, search-term intelligence, creative intelligence, funnel diagnostics, budget recommendations, Daily Manager prioritization, safety classification, business-value estimation, channel roles, scheduling, and the decision journal.

Current policy:
- read-only analysis only;
- `writes_allowed` is always `false`;
- unhealthy conversion integrity blocks budget escalation;
- activation, publishing, delivery, and budget writes remain approval-gated by the safety engine;
- external post-action verification is required before any future write can be considered successful.

This stage intentionally does not activate campaigns, publish ads, change budgets, or alter production credentials/configuration.
