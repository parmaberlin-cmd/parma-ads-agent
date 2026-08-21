# Parma Ads Agent — Shadow Report

Date: 2026-08-21
Mode: SHADOW / READ-ONLY
Writes allowed: NO

## Data quality

Status: DEGRADED / PARTIAL

Reason: Google Ads campaign reporting showed 0 conversions while the active GA4-imported `booking_completed` action showed conversion activity in the same recent reporting window. This means conversion attribution/integrity was not reliable enough for budget optimization at the time of inspection. Meta live data was not re-read for this report because the Railway connector was unavailable from ChatGPT during generation.

## Google Ads observations

- Two active Search campaigns were inspected.
- Campaign conversion goals were corrected and saved so both campaigns now use:
  - `Prenotazione appuntamenti`
  - `Ottieni indicazioni stradali`
- Generic goals such as `Altro`, `Contatti`, and call-lead goals were removed from campaign-specific optimization.
- Google Display Network was enabled inside both Search campaigns and was removed from both.
- Google Search Partners remained disabled.
- Search-term negatives were added manually for clearly irrelevant queries discovered in the report.

### Dinner campaign historical window

Observed report window: 22 Jul 2026 — 20 Aug 2026.

- 507 clicks
- 14,313 impressions
- €103.71 total cost
- Active Search keywords: 469 clicks, 12,058 impressions, €94.12
- Display leakage: 38 clicks, 2,255 impressions, €9.59 before Display was disabled
- `beste pizza berlin` appeared twice as broad match in separate ad groups:
  - 233 clicks, €55.16
  - 151 clicks, €22.06
  - combined: 384 clicks, €77.22
- Both `beste pizza berlin` entries were marked limited by low quality.
- Main active keywords observed were broad match.

## Shadow diagnosis

### Priority 1 — Conversion integrity

Status: HIGH PRIORITY / BLOCK BUDGET ESCALATION

The Agent should not increase budgets until fresh post-change Google Ads conversion data can be reconciled with GA4 `booking_completed`. The historical 0-conversion campaign view is not trustworthy enough to decide which keywords truly generate bookings because the campaigns had been optimizing against the wrong conversion goals.

### Priority 2 — Search traffic quality

Status: ATTENTION REQUIRED

Broad match is generating most of the traffic. `beste pizza berlin` alone consumed the majority of the Dinner campaign's observed keyword spend. Do not remove it immediately after the conversion-goal repair; instead collect a clean post-change observation window and then compare broad vs phrase/exact candidates.

### Priority 3 — Network leakage

Status: CORRECTED

Display traffic was mixed into both Search campaigns. It has now been disabled. This should make future Search performance data cleaner and more intent-driven.

## Agent recommendation

For the next observation window:

1. Keep budgets unchanged.
2. Do not make additional large structural keyword changes immediately.
3. Re-read campaign metrics after fresh data accumulates.
4. Validate Google Ads conversions against GA4 bookings.
5. Re-evaluate `beste pizza berlin` and other broad-match keywords after conversion integrity becomes healthy.
6. When Meta live access is available again, add Meta campaign/creative performance into the same Daily Manager report.

## Safety decision

- Budget increase: BLOCKED until conversion integrity is healthy.
- Campaign activation/publishing: REQUIRES EXPLICIT HUMAN APPROVAL.
- Budget writes: REQUIRES EXPLICIT HUMAN APPROVAL.
- Read-only analysis: ALLOWED.
- PAUSED-only draft preparation: ALLOWED only within existing write-gate policy.

## Current Agent state

The integrated shadow orchestrator is now in `main`, and the full pull-request CI validation passed successfully before merge. The current stage is analysis-only. No campaign, budget, delivery, or credential changes were performed by the Agent while producing this report.
