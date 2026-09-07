'use strict';

const DEFAULT_GOOGLE_TIMEZONE = 'Europe/Berlin';
const DAY_SEQUENCE = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MINUTE_VALUE = { ZERO: 0, FIFTEEN: 15, THIRTY: 30, FORTY_FIVE: 45 };

function parseGoogleReadMode(value) {
  if (value == null || value === '') return 'historical';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'historical') return 'historical';
  if (normalized === 'today_intraday') return 'today_intraday';
  return null;
}

function localDateInTimezone(now = Date.now(), timezone = DEFAULT_GOOGLE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function shiftIsoDate(dateText, deltaDays) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new TypeError('invalid_date');
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));
  return date.toISOString().slice(0, 10);
}

function getGoogleDateRange({ days, readMode = 'historical', timezone = DEFAULT_GOOGLE_TIMEZONE, now = Date.now() }) {
  if (!Number.isInteger(days) || days < 0 || days > 90) throw new TypeError('invalid_days');
  const today = localDateInTimezone(now, timezone);
  if (readMode === 'today_intraday') {
    return {
      start: today,
      end: today,
      timezone,
      read_mode: 'today_intraday',
      intraday: true,
      partial_data_possible: true,
    };
  }
  if (readMode !== 'historical') throw new TypeError('invalid_read_mode');
  if (days === 0) {
    return {
      start: today,
      end: today,
      timezone,
      read_mode: 'today_intraday',
      intraday: true,
      partial_data_possible: true,
    };
  }
  const end = shiftIsoDate(today, -1);
  const start = shiftIsoDate(end, -(days - 1));
  return {
    start,
    end,
    timezone,
    read_mode: 'historical',
    intraday: false,
    partial_data_possible: false,
  };
}

function minuteValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return MINUTE_VALUE[String(value || '').toUpperCase()] ?? 0;
}

function normalizeDay(value) {
  if (typeof value === 'number') return DAY_SEQUENCE[value - 1] || null;
  const text = String(value || '').trim().toUpperCase();
  return DAY_SEQUENCE.includes(text) ? text : null;
}

function nextDay(dayName) {
  const index = DAY_SEQUENCE.indexOf(dayName);
  if (index < 0) return null;
  return DAY_SEQUENCE[(index + 1) % DAY_SEQUENCE.length];
}

function getLocalClock(now = Date.now(), timezone = DEFAULT_GOOGLE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(now));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = String(byType.weekday || '').toUpperCase();
  const hour = Number(byType.hour || 0);
  const minute = Number(byType.minute || 0);
  return { day, hour, minute, minute_of_day: (hour * 60) + minute };
}

function evaluateScheduleActiveNow(rows, { timezone = DEFAULT_GOOGLE_TIMEZONE, now = Date.now() } = {}) {
  const activeRows = (rows || []).filter((row) => String(row?.status || '').toUpperCase() === 'ENABLED');
  if (activeRows.length === 0) {
    return { scheduled_to_run_now: true, reason: 'no_ad_schedule_configured' };
  }
  const clock = getLocalClock(now, timezone);
  for (const row of activeRows) {
    const day = normalizeDay(row?.day_of_week);
    if (!day) continue;
    const start = (Number(row?.start_hour || 0) * 60) + minuteValue(row?.start_minute);
    const end = (Number(row?.end_hour || 0) * 60) + minuteValue(row?.end_minute);
    if (end > start) {
      if (clock.day === day && clock.minute_of_day >= start && clock.minute_of_day < end) {
        return { scheduled_to_run_now: true, reason: 'active_schedule_window' };
      }
      continue;
    }
    const wrapsTo = nextDay(day);
    if ((clock.day === day && clock.minute_of_day >= start) ||
        (clock.day === wrapsTo && clock.minute_of_day < end)) {
      return { scheduled_to_run_now: true, reason: 'active_schedule_window_overnight' };
    }
  }
  return { scheduled_to_run_now: false, reason: 'outside_configured_schedule' };
}

module.exports = {
  DEFAULT_GOOGLE_TIMEZONE,
  parseGoogleReadMode,
  localDateInTimezone,
  shiftIsoDate,
  getGoogleDateRange,
  evaluateScheduleActiveNow,
};
