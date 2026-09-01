const test = require('node:test');
const assert = require('node:assert/strict');

function parseExactDateRange(query = {}) {
  const start = query.start ? String(query.start) : null;
  const end = query.end ? String(query.end) : null;
  if (!start && !end) return { provided:false };
  if (!start || !end) return { provided:true, valid:false, error:'start and end must be provided together' };
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start) || !datePattern.test(end)) return { provided:true, valid:false, error:'start and end must use YYYY-MM-DD' };
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return { provided:true, valid:false, error:'start must be on or before end' };
  const days = Math.floor((endMs - startMs) / 86400000) + 1;
  if (days > 90) return { provided:true, valid:false, error:'exact date range must be 90 days or fewer' };
  return { provided:true, valid:true, start, end, days };
}

test('accepts an exact inclusive date range for reconciliation', () => {
  assert.deepEqual(parseExactDateRange({ start:'2026-08-03', end:'2026-09-01' }), {
    provided:true, valid:true, start:'2026-08-03', end:'2026-09-01', days:30,
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
