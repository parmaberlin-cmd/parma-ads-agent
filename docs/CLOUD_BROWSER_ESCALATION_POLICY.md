# External UI / Cloud Browser Escalation Policy

Status: durable operating policy for issue #143.

## Default
Repository analysis, code changes, tests, public research and authenticated read-only API/connector diagnostics should use their direct interfaces. A browser-authenticated UI is not the default operating surface.

## Escalate to authenticated UI only when
1. the task genuinely requires an external account UI; and
2. connector/API/repository evidence cannot complete it safely; and
3. the task is not merely being moved to a browser for convenience.

Examples: OAuth consent, account security/payment verification, infrastructure UI that has no authorized API path, or a site-builder action that is explicitly approved.

## Human involvement
Request the user only for genuine credential entry, consent, security/payment verification, irreversible actions, external publication, or spend-affecting authorization. Never use the user as a relay for data that the Agent can retrieve through an available authorized interface.

## Blocker behavior
When one task reaches a browser/human gate, persist the blocker and continue unrelated GREEN work. Do not repeatedly ask for the same unavailable access.

## Safety
Secrets must not be copied into project state, logs, issues, prompts or screenshots. Browser access does not weaken campaign, tracking, budget, spend, publication or irreversible-action gates.

## Acceptance criteria
- ordinary repository/read-only work does not escalate to browser UI;
- browser escalation requires an authenticated external-UI need plus unavailable direct interface;
- user involvement is limited to genuine human gates;
- a blocked UI task does not stop unrelated GREEN work;
- no secret-handling or spend/write safety gate is weakened.
