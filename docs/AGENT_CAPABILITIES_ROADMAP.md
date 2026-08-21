# Parma Ads Agent V2 — Capability Roadmap

## Goal
Build a reliable decision-and-execution agent whose primary business objective is more qualified reservations, customers and revenue for Parma di Vinibenedetti. Optimization metrics such as CTR, CPC and reach are diagnostic signals, not final goals.

## Common decision loop
Every module feeds the same controlled loop:

1. Observe data.
2. Validate data quality and freshness.
3. Detect problem or opportunity.
4. Estimate business impact and confidence.
5. Rank the recommendation.
6. Preview the proposed action and expected effect.
7. Apply safety policy and determine whether explicit approval is required.
8. Execute only when permitted.
9. Verify the resulting external state independently.
10. Measure outcome after an appropriate observation window.
11. Record decision, evidence, expectation and result.

No recommendation may be treated as successful merely because an API call returned successfully.

## Parallel modules

### 1. Search Terms & Keyword Intelligence
Inputs: search terms, keywords, match type, cost, clicks, conversions/bookings, campaign/ad group.
Outputs: negative-keyword candidates, expansion candidates, match-type issues, wasted-spend alerts, confidence and evidence.
Safety: recommendations are read-only by default; keyword mutations require approval until explicitly delegated.

### 2. Conversion Integrity
Inputs: Google Ads conversions, GA4 booking_completed and relevant reservation events, timestamps and attribution metadata when available.
Outputs: tracking-health status, discrepancies, stale/missing signals, confidence downgrade for decisions based on suspect conversion data.
Rule: optimization that depends on conversions is blocked or downgraded when conversion integrity is not validated.

### 3. Meta / Instagram Creative Intelligence
Inputs: creative/Reel identity, spend, impressions, reach, frequency, clicks, CTR, CPC, actions and booking signals when available.
Outputs: creative winners/losers, fatigue warnings, insufficient-data state, test hypotheses and next creative experiment.
Rule: do not declare a winner before minimum evidence criteria are met.

### 4. Budget Optimizer
Inputs: spend, conversion volume/value when available, CPA/CPC, delivery status, confidence, recent trend and business constraints.
Outputs: keep/increase/decrease/reallocate recommendation with rationale, maximum proposed delta and expected risk.
Safety: no autonomous budget write. Every budget change remains approval-gated until a later explicit policy authorizes bounded autonomy.

### 5. Anomaly Detector
Inputs: current and historical delivery, spend, impressions, clicks, CPC/CTR, conversions, API/permission health.
Outputs: severity-ranked anomalies such as stopped delivery, sudden spend without results, conversion collapse, CPC spike, tracking failure or permission loss.
Rule: distinguish platform/access/tracking failures from marketing-performance failures.

### 6. Landing Page & Reservation Funnel Checker
Inputs: ad destination, landing-page availability/performance signals when available, GA4 funnel events and booking completion.
Outputs: broken-destination alerts, click-to-booking leakage, funnel-stage diagnosis and landing-page recommendations.
Rule: do not blame campaign targeting when downstream tracking/page health is uncertain.

### 7. Daily Manager
Inputs: outputs from all modules.
Outputs: maximum three primary priorities plus secondary observations. Each priority contains business impact, evidence, confidence, proposed action, approval requirement and next measurement time.
Rule: suppress duplicate alerts and low-value metric noise.

### 8. Decision Journal
For every material recommendation/action record:
- timestamp and channel;
- observed evidence and data window;
- data-quality status;
- diagnosis;
- confidence;
- expected business effect;
- proposed action;
- approval state;
- execution result;
- independent post-action verification;
- measurement window;
- actual result and retrospective assessment.

This journal is the basis for evaluating whether the agent's recommendations improve over time.

## Quality gates
A capability moves from development to operational only after:

1. deterministic unit/regression tests pass;
2. failure and missing-data cases are tested;
3. read-only preview output is reviewed on real or representative data;
4. important conclusions receive a second independent validation where practical;
5. write actions have explicit safety/approval policy;
6. external state is re-read after writes;
7. monitoring detects regressions.

## Delivery order
Work in parallel, but integrate in this order:

- Foundation: conversion integrity + anomaly detection + decision journal.
- Acquisition intelligence: search terms/keywords + Meta creative intelligence.
- Optimization: landing funnel + budget recommendations.
- Management: Daily Manager aggregation and prioritization.
- Controlled execution: preview -> approval -> write -> independent verification -> outcome measurement.

## Current safety policy
Until explicitly changed by Philippe:
- analysis and recommendations may run autonomously;
- campaigns may not be activated/published autonomously;
- delivery/spend may not be enabled autonomously;
- budget changes may not be applied autonomously;
- secrets/credentials must never be surfaced;
- sensitive production changes require explicit approval.
