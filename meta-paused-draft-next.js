const base = require("./meta-paused-draft");

const META_API_VERSION = "v26.0";

function buildPausedReservationDraft(input) {
  const draft = base.buildPausedReservationDraft(input);

  // Marketing API v25+ requires an explicit Advantage Audience choice for
  // normal ad-set creation. Omitting targeting_automation is rejected with
  // OAuthException code 100 / subcode 1870227.
  draft.adSet.targeting = {
    ...draft.adSet.targeting,
    targeting_automation: {
      advantage_audience: 0,
    },
  };

  base.assertPausedOnly(draft);
  return draft;
}

function metaCompatibilitySummary() {
  return {
    api_version: META_API_VERSION,
    paused_only: true,
    targeting_automation_explicit: true,
    advantage_audience: 0,
    known_error_addressed: 1870227,
  };
}

module.exports = {
  ...base,
  META_API_VERSION,
  buildPausedReservationDraft,
  metaCompatibilitySummary,
};
