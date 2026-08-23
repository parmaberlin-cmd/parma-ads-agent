const test = require('node:test');
const assert = require('node:assert/strict');
const { median, mad, buildRobustBaseline, detectRobustAnomalies } = require('../statistical-baseline');

test('median and MAD resist single extreme outliers', () => {
  assert.equal(median([1, 1, 2, 2, 100]), 2);
  assert.equal(mad([1, 1, 2, 2, 100]), 1);
});

test('baseline requires enough observations', () => {
  const baseline = buildRobustBaseline([{ spend: 10, clicks: 10, bookings: 1 }], { minObservations: 7 });
  assert.equal(baseline.ready, false);
  assert.equal(baseline.writes_allowed, false);
});

test('baseline becomes ready after sufficient history', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ spend: 10 + (index % 2), clicks: 20 + (index % 3), impressions: 1000, bookings: 3 + (index % 2) }));
  const baseline = buildRobustBaseline(rows);
  assert.equal(baseline.ready, true);
  assert.equal(baseline.metrics.cpc.ready, true);
});

test('robust anomaly detection ignores normal variation and catches severe CPC spike', () => {
  const rows = [
    { spend: 10, clicks: 20, impressions: 1000, bookings: 3 },
    { spend: 11, clicks: 20, impressions: 1000, bookings: 3 },
    { spend: 10, clicks: 21, impressions: 1000, bookings: 3 },
    { spend: 11, clicks: 21, impressions: 1000, bookings: 4 },
    { spend: 10, clicks: 19, impressions: 1000, bookings: 3 },
    { spend: 11, clicks: 19, impressions: 1000, bookings: 3 },
    { spend: 10, clicks: 20, impressions: 1000, bookings: 4 },
    { spend: 11, clicks: 20, impressions: 1000, bookings: 3 },
  ];
  const baseline = buildRobustBaseline(rows);
  const normal = detectRobustAnomalies({ spend: 11, clicks: 20, impressions: 1000, bookings: 3 }, baseline);
  assert.equal(normal.anomalies.some((a) => a.metric === 'cpc'), false);
  const severe = detectRobustAnomalies({ spend: 60, clicks: 20, impressions: 1000, bookings: 1 }, baseline);
  assert.equal(severe.anomalies.some((a) => a.metric === 'cpc'), true);
  assert.equal(severe.writes_allowed, false);
});