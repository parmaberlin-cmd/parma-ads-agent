const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeEventInventory } = require('../ga4-funnel-intelligence');
const { publicGa4Diagnostic } = require('../runtime-public-view');

function row(name, count) {
  return { dimensionValues:[{value:name}], metricValues:[{value:String(count)}] };
}

test('event inventory surfaces reservation-like alternatives without relabeling expected events', () => {
  const result = summarizeEventInventory([
    row('page_view', 100),
    row('booking_completed', 12),
    row('wix_reservation_started', 8),
    row('table_booking_opened', 5),
  ], ['reservation_page_view','reservation_start','booking_completed']);

  assert.equal(result.event_count, 4);
  assert.deepEqual(result.reservation_candidates, [
    {event_name:'wix_reservation_started', event_count:8},
    {event_name:'table_booking_opened', event_count:5},
  ]);
});

test('public GA4 diagnostic exposes aggregate counts and sanitized candidate names only', () => {
  const result = publicGa4Diagnostic({
    access_ok:true,
    configuration_complete:true,
    total_booking_completed:12,
    google_cpc_booking_completed:4,
    booking_quality:{event_count:12,users:10,sessions:11,duplication_risk:false},
    funnel:{completeness:{configuration_complete:true,observation_complete:false}},
    event_inventory:{event_count:35,reservation_candidates:[{event_name:'reserve form opened!',event_count:9}]},
  });
  assert.deepEqual(result.booking_counts,{total:12,google_cpc:4});
  assert.equal(result.event_inventory_count,35);
  assert.deepEqual(result.reservation_event_candidates,[{event_name:'reserve_form_opened_',event_count:9}]);
  assert.equal(JSON.stringify(result).includes('access_token'),false);
});
