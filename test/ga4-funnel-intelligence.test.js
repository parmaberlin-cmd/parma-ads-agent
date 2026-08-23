const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeFunnel, reconcileConversions } = require("../ga4-funnel-intelligence");
const { buildFunnelInput } = require("../full-live-shadow-data");

test("GA4 funnel separates total traffic from google cpc", () => {
  const rows=[
    {dimensionValues:[{value:"reservation_start"},{value:"google"},{value:"cpc"}],metricValues:[{value:"4"}]},
    {dimensionValues:[{value:"booking_completed"},{value:"google"},{value:"cpc"}],metricValues:[{value:"2"}]},
    {dimensionValues:[{value:"booking_completed"},{value:"direct"},{value:"(none)"}],metricValues:[{value:"3"}]},
  ];
  const result=summarizeFunnel(rows,["reservation_start","booking_completed"]);
  assert.equal(result.totals.booking_completed,5);
  assert.equal(result.google_cpc.booking_completed,2);
});

test("conversion reconciliation fails closed when sources disagree", () => {
  assert.equal(reconcileConversions({googleAdsConversions:4,ga4GoogleCpcBookings:4}).automation_safe,true);
  assert.equal(reconcileConversions({googleAdsConversions:8,ga4GoogleCpcBookings:2}).automation_safe,false);
});

test("full funnel input uses google cpc reservation events", () => {
  const input=buildFunnelInput({live_sources:{google:{totals:{clicks:10}}}},{access_ok:true,google_cpc_booking_completed:2,funnel:{totals:{booking_completed:5},google_cpc:{reservation_page_view:8,reservation_start:4,booking_completed:2}}});
  assert.deepEqual({adClicks:input.adClicks,landingViews:input.landingViews,reservationStarts:input.reservationStarts,bookings:input.bookings},{adClicks:10,landingViews:8,reservationStarts:4,bookings:2});
});
