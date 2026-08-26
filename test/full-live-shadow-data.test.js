const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFunnelInput } = require("../full-live-shadow-data");

test("missing reservation page events remain unknown instead of declaring an outage", () => {
  const result = buildFunnelInput(
    { live_sources: { google: { totals: { clicks: 20 } } } },
    {
      access_ok: true,
      funnel: {
        event_names: ["reservation_page_view", "reservation_start", "booking_completed"],
        totals: { reservation_page_view: 0, reservation_start: 0, booking_completed: 4 },
        google_cpc: { reservation_page_view: 0, reservation_start: 0, booking_completed: 1 },
      },
    }
  );

  assert.equal(result.landingAvailable, null);
  assert.equal(result.reservationPageObserved, false);
  assert.equal(result.bookingCompletedObserved, true);
});

test("observed reservation page events positively establish availability", () => {
  const result = buildFunnelInput(
    { live_sources: { google: { totals: { clicks: 20 } } } },
    {
      access_ok: true,
      funnel: {
        event_names: ["reservation_page_view", "reservation_start", "booking_completed"],
        totals: { reservation_page_view: 10, reservation_start: 2, booking_completed: 1 },
        google_cpc: { reservation_page_view: 5, reservation_start: 1, booking_completed: 1 },
      },
    }
  );

  assert.equal(result.landingAvailable, true);
  assert.equal(result.reservationPageObserved, true);
});
