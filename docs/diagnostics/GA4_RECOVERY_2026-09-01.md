# GA4 production recovery — 2026-09-01

## Status

Production shadow health after OAuth reauthorization:

- Google source healthy: `true`
- GA4 source healthy: `true`
- Meta source healthy: `true`
- GA4 source error: `null`
- Writes allowed: `false`
- GA4 configuration complete: `true`
- Funnel configuration complete: `true`
- Funnel observation complete: `false`

## Tracking observations

- `booking_completed`: configured and observed
- `reservation_page_view`: configured but not observed
- `reservation_start`: configured but not observed
- Funnel rates cannot yet be computed
- Conversion integrity: `degraded`
- Conversion integrity confidence: `medium`
- Optimization allowed: `false`
- Integrity issue: `conversion_sources_disagree`

## Interpretation

GA4 access/authentication is no longer the blocker. The next P0 is measurement integrity: reconcile Google Ads conversions with GA4 `booking_completed`, then determine why the two upstream reservation events are not being observed.

## Safety posture

No campaign, budget, ad, keyword, targeting, activation, or spend changes are part of this recovery. Optimization remains fail-closed until conversion integrity is trusted.

## Next actions

1. Reconcile Google Ads conversions with GA4 `booking_completed` for the same date range and attribution scope.
2. Inspect instrumentation and event naming for `reservation_page_view` and `reservation_start`.
3. Verify whether the reservation flow happens on a different origin/domain or loses client/session continuity.
4. Preserve near-me search traffic until walk-in/Maps attribution is better understood.
5. Diagnose rank loss before considering budget increases.
6. Prepare, but do not publish, a replacement for the POOR RSA.
