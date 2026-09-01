const test = require('node:test');
const assert = require('node:assert/strict');
const { parseExactDateRange } = require('../google-campaign-intelligence-route');

test('accepts an exact inclusive date range for reconciliation', () => {
  assert.deepEqual(parseExactDateRange({ start:'2026-08-03', end:'2026-09-01' }), {
    provided:true,
    valid:true,
    start:'2026-08-03',
    end:'2026-09-01',
    days:30,
  });
});

test('keeps rolling-days behavior when exact dates are absent', () => {
  assert.deepEqual(parseExactDateRange({ days:'30' }), { provided:false });
});

test('fails closed when only one boundary is provided', () => {
  assert.equal(parseExactDateRange({ start:'2026-08-03' }).valid, false);
});

test('fails closed for malformed, reversed, or over-90-day ranges', () => {
  assert.equal(parseExactDateRange({ start:'2026/08/03', end:'2026-09-01' }).valid, false);
  assert.equal(parseExactDateRange({ start:'2026-09-01', end:'2026-08-03' }).valid, false);
  assert.equal(parseExactDateRange({ start:'2026-01-01', end:'2026-09-01' }).valid, false);
});
