const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
  collectCampaignOverview,
  collectCampaignAdGroups,
  collectCampaignNegativeKeywords,
} = require("./google-campaign-breakdowns");
const { collectCampaignConversionActions } = require("./google-conversion-action-breakdown");
const { collectResponsiveSearchAds } = require("./google-rsa-collector");
const { analyzeRsaSet } = require("./google-rsa-analysis");

function installGoogleCampaignIntelligenceRoute({
  app,
  requireApiKey,
  checkGoogleConfig,
  parseGoogleCampaignId,
  parseGoogleDays,
  getGoogleDateRange,
  getGoogleCustomer,
  cleanGoogleError,
}) {
  app.get("/tools/google/campaign/:id/intelligence", requireApiKey, async (req, res) => {
    if (!checkGoogleConfig(res)) return;
    const campaignId = parseGoogleCampaignId(req.params.id);
    const days = parseGoogleDays(req.query.days);
    if (!campaignId) return res.status(400).json({ success:false, source:"google_ads", error:"campaign id must contain 1 to 20 digits" });
    if (days == null) return res.status(400).json({ success:false, source:"google_ads", campaign_id:campaignId, error:"days must be an integer between 0 and 90; 0 means today" });

    try {
      const customer = getGoogleCustomer();
      const { start, end } = getGoogleDateRange(days);
      const [overview, ad_groups, search_terms, keywords, devices, hours, geography, rsa_ads, conversion_actions, negative_keywords] = await Promise.all([
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
      ]);
      res.json({ success:true, source:"google_ads", mode:"read_only_intelligence", reader_version:4, campaign_id:campaignId, period_days:days, exact_date_range:true, date_range:{start,end}, overview, ad_groups, search_terms, keywords, devices, hours, geography, rsa_ads, rsa_analysis:analyzeRsaSet(rsa_ads), conversion_actions, negative_keywords, writes_allowed:false, execution_allowed:false, spend_allowed:false });
    } catch (error) {
      res.status(500).json({ success:false, source:"google_ads", campaign_id:campaignId, error:cleanGoogleError(error), writes_allowed:false, execution_allowed:false, spend_allowed:false });
    }
  });
}

module.exports = { installGoogleCampaignIntelligenceRoute };
