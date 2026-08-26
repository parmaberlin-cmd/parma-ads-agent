# Parma Ads Agent — Master Roadmap

## Baseline
- Infrastructure progress: ~65%
- Observed autonomy baseline: ~42%
- Current P0: make the DNA/state architecture persistent and bootstrap-capable, while unblocking authenticated Google Ads reads in parallel.

## Milestones

### M0 — DNA v1.2 ACTIVE
DONE when genome materialization is internally consistent, JSON state is valid, Bootstrap Test passes, Recovery Test passes, and no architecture P0 remains.

### M1 — Google Ads end-to-end
DONE when /tools/google/test succeeds through Parma Agent authentication, live campaign metrics can be read, and the same date-window values are independently matched against Google Ads.

### M2 — Google intelligence
DONE when campaigns, search terms, keywords, ads/assets, conversion signals and budget/impression constraints feed evidence-based recommendations with confidence and risk.

### M3 — Google + GA4 decision engine
DONE when cross-source reconciliation and commercial recommendations are reliable enough to enter shadow/canary evaluation with measured outcomes.

### M4 — Meta + Google integrated control
DONE when both channels feed the same state, policy, risk and measurement system and can be prioritized comparatively.

### M5 — Persistent autonomous operator
DONE when scheduler/event orchestration continues collect -> validate -> analyze -> detect -> prioritize -> propose -> execute-within-delegation -> measure -> history across restarts, with Philippe involved only for RED decisions or genuinely external requirements.

## Parallel workstreams
- Control Tower: genome/state/roadmap/progress and cross-agent routing.
- Google: Google Ads + GA4 end-to-end capability.
- Meta: Meta/Instagram read and controlled execution path.
- Engineering: backend, auth integration, persistence, tests, CI, deploy safety.
- Intelligence: decision quality, confidence, fitness and phenotype measurement.
- Automation: scheduler, event bus, leases, watchdog, recovery and genome sync.

## Progress rule
No percentage increases from repeated debugging attempts, documentation alone, or code that has not produced a verified capability. Each capability promotion must cite its DONE criteria and evidence.

## Current immediate sequence
1. Validate materialized DNA/state files.
2. Bootstrap a fresh agent from genome + current state only.
3. Recovery-test a second fresh agent.
4. Promote DNA v1.2 to ACTIVE if all gates pass.
5. Run workstreams in parallel, with G-017 routed to Engineering and Google end-to-end validation resumed as soon as authentication is fixed.