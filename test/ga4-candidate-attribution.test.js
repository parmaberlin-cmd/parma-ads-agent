const test = require('node:test');
const assert = require('node:assert/strict');
const { publicCandidateAttribution, publicGa4Diagnostic } = require('../runtime-public-view');

test('candidate attribution preserves aggregate total and google/cpc counts only', () => {
  const ga4 = {
    access_ok:true,
    configuration_complete:true,
    funnel:{completeness:{configuration_complete:true,observation_complete:false}},
    candidate_attribution:{
      event_names:['table_reservation_completed','reservation'],
      totals:{table_reservation_completed:11,reservation:2},
      google_cpc:{table_reservation_completed:10,reservation:1},
    },
  };
  assert.deepEqual(publicCandidateAttribution(ga4),[
    {event_name:'table_reservation_completed',total:11,google_cpc:10},
    {event_name:'reservation',total:2,google_cpc:1},
  ]);
  assert.deepEqual(publicGa4Diagnostic(ga4).reservation_candidate_attribution,publicCandidateAttribution(ga4));
});
