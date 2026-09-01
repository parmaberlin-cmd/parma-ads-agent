# GA4 funnel root-cause checklist

Use this checklist before changing campaign optimization or weakening conversion-integrity gates.

## A. Event reality

- Confirm whether `reservation_page_view` is actually emitted in the browser.
- Confirm whether `reservation_start` is actually emitted in the browser.
- Search for semantically equivalent event names before concluding instrumentation is absent.
- Confirm `booking_completed` fires once per successful booking rather than on reload/revisit.

## B. Reservation boundary

- Identify the URL/origin for each step: restaurant landing page, reservation entry, reservation form, confirmation.
- Flag cross-domain transitions.
- Check whether the reservation provider carries GA client/session identifiers or linker parameters.
- Check whether referrer/source is reset at the provider boundary.

## C. Consent

- Determine whether analytics consent is denied or delayed on the first two steps but present on confirmation.
- Do not bypass consent to improve measurement.

## D. GA4 configuration

- Verify the production Measurement ID/tag on every relevant first-party page.
- Verify custom-event definitions if upstream events are derived rather than directly emitted.
- Verify event filters/data filters are not excluding upstream events.
- Verify time zone for the GA4 property before comparing hourly Google Ads segments.

## E. Ads import/attribution

- Enumerate the Google Ads conversion actions contributing to the campaign's reported 5 conversions.
- Determine whether the Ads conversion is imported from GA4 or originates from another Google conversion tag/action.
- Compare conversion date semantics with GA4 event date semantics.
- Compare attribution models/windows before treating count differences as instrumentation errors.

## Fail-closed rule

If any of A–E is unresolved, conversion-based campaign execution remains disabled. Read-only analysis and proposal preparation may continue.
