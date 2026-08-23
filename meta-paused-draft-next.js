const base = require("./meta-paused-draft");
const { convertDailyWindow } = require("./meta-timezone-schedule");

const META_API_VERSION = "v26.0";

function buildPausedReservationDraft(input) {
  const draft = base.buildPausedReservationDraft(input);
  draft.adSet.targeting = {
    ...draft.adSet.targeting,
    targeting_automation: {
      advantage_audience: 0,
    },
  };

  if (input?.accountTimezone) {
    const converted = convertDailyWindow({
      startsAt: input.startsAt,
      durationDays: input.durationDays || 14,
      sourceTimeZone: input.businessTimezone || "Europe/Berlin",
      targetTimeZone: input.accountTimezone,
      startHour: 17,
      endHour: 23,
    });

    if (!converted.safe) {
      throw new Error(converted.reason || "timezone_schedule_conversion_failed");
    }

    draft.adSet.adset_schedule = [{
      start_minute: converted.start_minute,
      end_minute: converted.end_minute,
      days: [0, 1, 2, 3, 4, 5, 6],
    }];
    draft.policy.schedule = {
      business_timezone: converted.source_timezone,
      account_timezone: converted.target_timezone,
      converted: true,
      stable_for_campaign: converted.stable,
    };
  }

  base.assertPausedOnly(draft);
  return draft;
}

function metaCompatibilitySummary() {
  return {
    api_version: META_API_VERSION,
    paused_only: true,
    targeting_automation_explicit: true,
    advantage_audience: 0,
    timezone_schedule_conversion: true,
    known_error_addressed: 1870227,
  };
}

module.exports = {
  ...base,
  META_API_VERSION,
  buildPausedReservationDraft,
  metaCompatibilitySummary,
};
