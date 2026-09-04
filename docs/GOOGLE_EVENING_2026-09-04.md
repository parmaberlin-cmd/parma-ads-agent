# Google Ads operational handoff — 2026-09-04 19:15 Europe/Berlin

## Verified production
Deployment 5ca99524-2a23-49ba-8025-7669e1bffc2a SUCCESS, commit 1e6177e029906d2e7ed1551daddf9e663c9ade4b.
Includes #196 same-day operational diagnostics and #198 executor clock correction.
#196 exact CI head b0559ed7dc7525eb3df26b2e0e97ccd8dbd4df84: test 33899243607 and audit 33899243606 PASS.
#198 exact CI head a90775abdfcbe0e5f76af3666f5aad0fc040295d: test 33899414530 (636/636), dependency audit, syntax and audit 33899414443 PASS.
Reader completed all sections without errors at 17:15:45Z. Google connector post-deploy connected=true.
No Google Ads mutations executed. No changes to autonomous architecture or Primary Conversion.

## Budget and today's delivery
Enabled 23276824770 Dinner: EUR3.50 configured/day, 27 impressions, 2 clicks, EUR0.03 reported.
Enabled 23853417314 Pizza Kreuzberg: EUR4.00 configured/day, 0 impressions/clicks/cost reported.
Total enabled configured budget EUR7.50 <= EUR10. Four paused campaigns excluded from enabled total.
The cage covers configured budgets, NOT an actual daily billable-cost hard cap.
Runtime readToday reported EUR0.03 and 0 change rows; reporting/history may lag and are NOT final/reconciled.
17h: 7 impressions, 0 clicks. 18h: 20 impressions, 2 clicks. No 19h row yet; not proof of stopped delivery.
Both clicks mobile. Search terms: pizza in meiner nähe (EUR0.02, broad beste pizza berlin) and pizzeria (EUR0.01, broad pizza kreuzberg).

## Actual Friday schedules and strategy
Dinner: 17:00–24:00. Pizza Kreuzberg: 20:30–24:00. Both already include 22:00–23:00.
19:00–20:30 preserve Dinner delivery and near-me traffic.
20:30–22:00 second campaign starts on existing schedule; do not diagnose its earlier zero traffic as a delivery failure.
22:00–23:00 preserve both schedules; evaluate segment separately using hours/clicks/cost/local intent, not booking counts.
Keep EUR3.50/EUR4.00 unchanged pending permitted intent cleanup. No evidence supports calling a new allocation optimal yet.
Do not pause broad beste pizza berlin wholesale: it currently supplies a protected near-me query.
Both campaigns currently MAXIMIZE_CONVERSIONS (SDK enum 10). This is pre-existing, not an endorsed trustworthy signal; do not change bidding or conversions in this task without the appropriate policy.

## Local / creatives
Dinner positive geo setting PRESENCE_OR_INTEREST; second PRESENCE. Search partners false for both.
Geo IDs were read; named geography/radius interpretation not inferred.
Dinner RSA predominantly Italian; one GOOD (15/4 assets), one POOR (7/2). Second has English Late Dinner copy and another GOOD RSA.
No new claims about hours/prices/organic certification published.
Keyword report lacks negative flag: do NOT classify zero-impression competitor keywords as active positive targeting without criterion verification.

## Intent-based candidate, independent of conversions
EXACT negative candidate: sly restaurant berlin on 23853417314.
Yesterday 2026-09-03: 1 click, EUR4.97, matched broad pizzeria kreuzberg. Official identity verified: https://www.sly-berlin.com/en/dine-drink (another restaurant in Friedrichshain).
Not a generic local/near-me term. No conversion signal used.
Current campaign-level negative inventory (19 rows) does not include it; ad-group/shared-list duplicate checks still required at preflight.
No need to wait for reconciled booking_completed to assess this intent.

## Actual delegation gate
Current production owner mandate allowed_actions is ONLY set_daily_budget.
Current executor buildBudgetMutation rejects add_negative_keyword, scheduling, RSA and targeting.
New proposal specialist classifies external ad-platform changes NEEDS_HUMAN; AUTO_EXECUTABLE covers read/analysis/protected-intent guardrails, not Ads mutations.
Increasing budget is additionally blocked by existing conversion-integrity gate. EUR10 economic authorization is acquired and must NOT be requested again.
Do not disable any guardian or convert a proposal's rollback_possible flag into proof of a functioning rollback.
Needed scoped policy decision: permit bounded exact-negative execution for verified competitor intent, with explicit protected terms, maximum count, expiry, persistent audit, idempotency, kill switch, read-after-write and actual checked rollback support.
Until that explicit action-class delegation exists, do not extend live authority or execute negative writes.
