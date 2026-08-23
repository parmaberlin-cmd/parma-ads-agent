function partsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMinutes(date, timeZone) {
  const parts = partsInZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function zonedLocalToUtc({ year, month, day, hour, minute = 0, timeZone }) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60_000);
  const correctedOffset = offsetMinutes(instant, timeZone);
  instant = new Date(guess - correctedOffset * 60_000);
  return instant;
}

function addDaysYmd(ymd, days) {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function dayShift(base, target) {
  const baseUtc = Date.UTC(base.year, base.month - 1, base.day);
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  return Math.round((targetUtc - baseUtc) / 86_400_000);
}

function convertDailyWindow({
  startsAt,
  durationDays,
  sourceTimeZone = "Europe/Berlin",
  targetTimeZone,
  startHour = 17,
  endHour = 23,
}) {
  if (!targetTimeZone) throw new TypeError("targetTimeZone is required");
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 31) {
    throw new TypeError("durationDays must be an integer between 1 and 31");
  }
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || endHour <= startHour) {
    throw new TypeError("startHour/endHour must define a valid same-day window");
  }

  const startInstant = new Date(startsAt);
  if (Number.isNaN(startInstant.getTime())) throw new TypeError("startsAt must be valid");

  const sourceStart = partsInZone(startInstant, sourceTimeZone);
  const baseDate = { year: sourceStart.year, month: sourceStart.month, day: sourceStart.day };
  const mappings = [];

  for (let index = 0; index < durationDays; index += 1) {
    const ymd = addDaysYmd(baseDate, index);
    const startUtc = zonedLocalToUtc({ ...ymd, hour: startHour, timeZone: sourceTimeZone });
    const endUtc = zonedLocalToUtc({ ...ymd, hour: endHour, timeZone: sourceTimeZone });
    const targetStart = partsInZone(startUtc, targetTimeZone);
    const targetEnd = partsInZone(endUtc, targetTimeZone);

    mappings.push({
      start_minute: targetStart.hour * 60 + targetStart.minute,
      end_minute: targetEnd.hour * 60 + targetEnd.minute,
      start_shift: dayShift(ymd, targetStart),
      end_shift: dayShift(ymd, targetEnd),
    });
  }

  const first = mappings[0];
  const stable = mappings.every((mapping) =>
    mapping.start_minute === first.start_minute &&
    mapping.end_minute === first.end_minute &&
    mapping.start_shift === first.start_shift &&
    mapping.end_shift === first.end_shift
  );
  const sameTargetDay = first.start_shift === first.end_shift && first.end_minute > first.start_minute;

  return {
    safe: stable && sameTargetDay,
    stable,
    same_target_day: sameTargetDay,
    source_timezone: sourceTimeZone,
    target_timezone: targetTimeZone,
    start_minute: first.start_minute,
    end_minute: first.end_minute,
    day_shift: first.start_shift,
    reason: !stable
      ? "timezone_offset_changes_during_campaign"
      : !sameTargetDay
        ? "converted_window_crosses_account_day"
        : null,
  };
}

module.exports = {
  partsInZone,
  offsetMinutes,
  zonedLocalToUtc,
  convertDailyWindow,
};
