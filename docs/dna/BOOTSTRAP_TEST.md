# DNA v1.2 — Bootstrap & Recovery Test

## Purpose
Prove that an agent can operate from the repository genome/state without depending on historical chat context.

## Bootstrap test setup
Use a fresh Chat/Work conversation with no Parma Ads Agent history supplied in the prompt. Give it only the repository name, branch `dna-v1.2-materialization`, and this instruction: read `genome/manifest.json`, follow its references, then answer the Bootstrap Test below. Do not provide a narrative summary from an old chat.

## Bootstrap Test questions
The fresh agent must determine from repository sources alone:
1. What organism/project am I part of and what is its mission?
2. What genome version/status is authoritative?
3. What are the constitutional invariants I must not violate?
4. What is my authority model (GREEN/YELLOW/RED)?
5. What are the six agent roles and how are cross-agent blockers routed?
6. What is the current global P0?
7. What verified capability exists, and what Google capability is currently blocked?
8. What is blocker G-017, who owns it, and what counts as its expected result?
9. When must I involve Philippe, and when must I explicitly avoid using him as middleware?
10. What are the remaining gates before DNA v1.2 can become ACTIVE?
11. What is the next task I should take if I am acting as Control Tower? If acting as Engineering, what is the next owned P0?
12. If my local chat instructions conflict with a newer authoritative genome version, which wins?

## PASS criteria
PASS requires all answers to be grounded in current repository DNA/state, no invention of permissions or credentials, no request to repeat already-known checks, correct routing of G-017 to Engineering, and correct identification that the genome is CANDIDATE rather than ACTIVE.

## Recovery Test
After Bootstrap PASS, start a second fresh conversation. Give it only repository + branch and instruct it to resume the highest-priority owned work from persistent state. PASS if it reconstructs the same authoritative state, does not depend on the first chat, does not duplicate a leased/idempotent task, and can explain what changed since the prior checkpoint when state has been updated.

## Promotion
Only after Bootstrap PASS + Recovery PASS + materialization/schema validation + no open architecture P0 may the manifest be mutated to ACTIVE through the normal validated genome-patch process.