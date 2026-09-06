const test = require('node:test');
const assert = require('node:assert/strict');
const { getGoogleDateRange, evaluateScheduleActiveNow, parseGoogleReadMode } = require('../google-time-utils');

test('explicit today_intraday mode uses Europe/Berlin local day', () => {
  const now = Date.parse('2026-09-05T22:30:00Z'); // 2026-09-06 00:30 Europe/Berlin
  const range = getGoogleDateRange({ days: 1, readMode: 'today_intraday', timezone: 'Europe/Berlin', now });
  assert.deepEqual(range.start, '2026-09-06');
  assert.deepEqual(range.end, '2026-09-06');
  assert.equal(range.intraday, true);
});

test('historical days=1 remains yesterday semantics in Europe/Berlin', () => {
  const now = Date.parse('2026-09-05T22:30:00Z'); // 2026-09-06 00:30 Europe/Berlin
  const range = getGoogleDateRange({ days: 1, readMode: 'historical', timezone: 'Europe/Berlin', now });
  assert.deepEqual(range, {
    start: '2026-09-05',
    end: '2026-09-05',
    timezone: 'Europe/Berlin',
    read_mode: 'historical',
    intraday: false,
    partial_data_possible: false,
  });
});

test('DST boundaries keep local-date semantics stable for explicit today mode', () => {
  const beforeFallback = getGoogleDateRange({ days: 1, readMode: 'today_intraday', timezone: 'Europe/Berlin', now: Date.parse('2026-10-24T22:30:00Z') });
  const afterFallback = getGoogleDateRange({ days: 1, readMode: 'today_intraday', timezone: 'Europe/Berlin', now: Date.parse('2026-10-25T22:30:00Z') });
  assert.equal(beforeFallback.start, '2026-10-25');
  assert.equal(afterFallback.start, '2026-10-25');
});

test('schedule evaluation reports active, inactive and no-schedule states', () => {
  const active = evaluateScheduleActiveNow([{ day_of_week: 'MONDAY', start_hour: 9, start_minute: 'ZERO', end_hour: 22, end_minute: 'ZERO', status: 'ENABLED' }], {
    timezone: 'Europe/Berlin',
    now: Date.parse('2026-09-07T10:00:00Z'),
  });
  assert.equal(active.scheduled_to_run_now, true);
  const inactive = evaluateScheduleActiveNow([{ day_of_week: 'MONDAY', start_hour: 9, start_minute: 'ZERO', end_hour: 11, end_minute: 'ZERO', status: 'ENABLED' }], {
    timezone: 'Europe/Berlin',
    now: Date.parse('2026-09-07T12:00:00Z'),
  });
  assert.equal(inactive.scheduled_to_run_now, false);
  assert.deepEqual(evaluateScheduleActiveNow([], { timezone: 'Europe/Berlin' }), { scheduled_to_run_now: true, reason: 'no_ad_schedule_configured' });
});

test('read mode parser accepts today aliases and rejects unknown modes', () => {
  assert.equal(parseGoogleReadMode(undefined), 'historical');
  assert.equal(parseGoogleReadMode('today'), 'today_intraday');
  assert.equal(parseGoogleReadMode('intraday'), 'today_intraday');
  assert.equal(parseGoogleReadMode('today_intraday'), 'today_intraday');
  assert.equal(parseGoogleReadMode('historical'), 'historical');
  assert.equal(parseGoogleReadMode('future'), null);
});
