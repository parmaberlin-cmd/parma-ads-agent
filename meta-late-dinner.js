const { buildPausedReservationDraft, assertPausedOnly } = require('./meta-paused-draft-next');

const LATE_DINNER_PROFILE = Object.freeze({
  label: 'Late Dinner',
  start_hour: 20,
  end_hour: 23,
  radius_km: 3,
  age_min: 23,
  age_max: 60,
  daily_budget_eur: 6,
  duration_days: 14,
  destination: 'https://www.parmaberlin.de/reservations',
  platforms: ['instagram'],
  positions: ['stream','story','reels'],
  status: 'PAUSED',
});

function buildLateDinnerPausedDraft(input = {}) {
  const draft = buildPausedReservationDraft({
    ...input,
    dailyBudgetEur: input.dailyBudgetEur ?? LATE_DINNER_PROFILE.daily_budget_eur,
    durationDays: input.durationDays ?? LATE_DINNER_PROFILE.duration_days,
    destinationUrl: LATE_DINNER_PROFILE.destination,
  });
  draft.campaign.name = draft.campaign.name.replace('Reservations', 'Late Dinner');
  draft.adSet.name = draft.adSet.name.replace('Reservations', 'Late Dinner');
  draft.adSet.adset_schedule = [{start_minute:20*60,end_minute:23*60,days:[0,1,2,3,4,5,6]}];
  draft.ad.name = 'Parma | Late Dinner | Reel | Jetzt reservieren';
  draft.creative.name = 'Parma | Late Dinner | Existing Reel | Reservations';
  draft.policy.late_dinner = {
    business_timezone:'Europe/Berlin',
    start_hour:20,
    end_hour:23,
    may_activate:false,
    requires_separate_activation_approval:true,
  };
  assertPausedOnly(draft);
  return draft;
}

function lateDinnerPublicSummary(draft) {
  assertPausedOnly(draft);
  return {
    profile:LATE_DINNER_PROFILE,
    campaign_status:draft.campaign.status,
    adset_status:draft.adSet.status,
    ad_status:draft.ad.status,
    daily_budget_eur:draft.budget.daily_eur,
    maximum_total_eur:draft.budget.maximum_total_eur,
    schedule:draft.adSet.adset_schedule,
    destination:LATE_DINNER_PROFILE.destination,
    reel_asset_configured:Boolean(draft.creative.source_instagram_media_id),
    activation_allowed:false,
    spend_allowed:false,
  };
}

module.exports={LATE_DINNER_PROFILE,buildLateDinnerPausedDraft,lateDinnerPublicSummary};