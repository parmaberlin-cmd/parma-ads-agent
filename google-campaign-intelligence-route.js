const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
  collectCampaignOverview,
  collectCampaignAdGroups,
  collectCampaignNegativeKeywords,
  collectCampaignConfiguredDiagnostics,
} = require("./google-campaign-breakdowns");
const { collectCampaignConversionActions } = require("./google-conversion-action-breakdown");
const { collectResponsiveSearchAds } = require("./google-rsa-collector");
const { analyzeRsaSet } = require("./google-rsa-analysis");
const { evaluateScheduleActiveNow } = require("./google-time-utils");

function summarizeObservedPerformance(overview) {
  const rows = Array.isArray(overview) ? overview : [];
  const totals = rows.reduce((acc, row) => ({
    impressions: acc.impressions + Number(row?.impressions || 0),
    clicks: acc.clicks + Number(row?.clicks || 0),
    cost_eur: acc.cost_eur + Number(row?.cost_eur || 0),
    conversions: acc.conversions + Number(row?.conversions || 0),
  }), { impressions: 0, clicks: 0, cost_eur: 0, conversions: 0 });
  return { has_data: totals.impressions > 0 || totals.clicks > 0 || totals.cost_eur > 0 || totals.conversions > 0, totals };
}

function installGoogleCampaignIntelligenceRoute({
  app,
  requireApiKey,
  checkGoogleConfig,
  parseGoogleCampaignId,
  parseGoogleDays,
  parseGoogleReadMode,
  getGoogleDateRange,
  googleTimezone,
  getGoogleCustomer,
  cleanGoogleError,
}) {
  app.get("/tools/google/campaign/:id/intelligence", requireApiKey, async (req, res) => {
    if (!checkGoogleConfig(res)) return;
    const campaignId = parseGoogleCampaignId(req.params.id);
    const days = parseGoogleDays(req.query.days);
    const readMode = parseGoogleReadMode(req.query.read_mode);
    if (!campaignId) return res.status(400).json({ success:false, source:"google_ads", error:"campaign id must contain 1 to 20 digits" });
    if (days == null) return res.status(400).json({ success:false, source:"google_ads", campaign_id:campaignId, error:"days must be an integer between 0 and 90; 0 means today" });
    if (!readMode) return res.status(400).json({ success:false, source:"google_ads", campaign_id:campaignId, error:"read_mode must be historical or today_intraday" });

    try {
      const customer = getGoogleCustomer();
      const timezone = googleTimezone();
      const dateRange = getGoogleDateRange({ days, readMode, timezone });
      const { start, end } = dateRange;
      const effectivePeriodDays = Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
      const [overview, ad_groups, search_terms, keywords, devices, hours, geography, rsa_ads, conversion_actions, negative_keywords, configured_state] = await Promise.all([
        collectCampaignOverview({ customer, campaignId, start, end }),
        collectCampaignAdGroups({ customer, campaignId, start, end }),
        collectCampaignSearchTerms({ customer, campaignId, start, end }),
        collectCampaignKeywords({ customer, campaignId, start, end }),
        collectCampaignDevices({ customer, campaignId, start, end }),
        collectCampaignHours({ customer, campaignId, start, end }),
        collectCampaignGeography({ customer, campaignId, start, end }),
        collectResponsiveSearchAds({ customer, campaignId, start, end }),
        collectCampaignConversionActions({ customer, campaignId, start, end }),
        collectCampaignNegativeKeywords({ customer, campaignId }),
        collectCampaignConfiguredDiagnostics({ customer, campaignId }),
      ]);
      const scheduleCheck = evaluateScheduleActiveNow(configured_state?.ad_schedule || [], { timezone });
      const observedSummary = summarizeObservedPerformance(overview);
      const intradayNotice = dateRange.intraday ? {
        mode: "intraday_partial_possible",
        explicit_today_mode: readMode === "today_intraday",
        note: observedSummary.has_data
          ? "Intraday Google Ads data can be delayed or partial."
          : "No intraday delivery is currently visible; this can mean no activity yet or delayed reporting.",
      } : null;
      res.json({
        success:true,
        source:"google_ads",
        mode:"read_only_intelligence",
        reader_version:5,
        campaign_id:campaignId,
        read_mode: dateRange.read_mode,
        period_days:effectivePeriodDays,
        requested_period_days:days,
        exact_date_range:true,
        date_range:{start,end,timezone:dateRange.timezone,intraday:dateRange.intraday},
        configured_state,
        observed_performance:{overview, ad_groups, search_terms, keywords, devices, hours, geography, rsa_ads, rsa_analysis:analyzeRsaSet(rsa_ads), conversion_actions, negative_keywords},
        inferred_diagnosis:{
          campaign_scheduled_to_run_now:scheduleCheck.scheduled_to_run_now,
          schedule_reason:scheduleCheck.reason,
          campaign_primary_status:configured_state?.campaign?.primary_status || null,
          campaign_primary_status_reasons:configured_state?.campaign?.primary_status_reasons || [],
          potential_negative_keyword_conflicts:configured_state?.negative_keyword_conflicts || [],
          intraday_reporting_notice:intradayNotice,
        },
        overview,
        ad_groups,
        search_terms,
        keywords,
        devices,
        hours,
        geography,
        rsa_ads,
        rsa_analysis:analyzeRsaSet(rsa_ads),
        conversion_actions,
        negative_keywords,
        writes_allowed:false,
        execution_allowed:false,
        spend_allowed:false,
      });
    } catch (error) {
      res.status(500).json({ success:false, source:"google_ads", campaign_id:campaignId, error:cleanGoogleError(error), writes_allowed:false, execution_allowed:false, spend_allowed:false });
    }
  });
}

module.exports = { installGoogleCampaignIntelligenceRoute };
