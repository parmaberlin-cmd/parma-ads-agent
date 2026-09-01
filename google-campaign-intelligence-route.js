const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
  collectCampaignOverview,
  collectCampaignAdGroups,
} = require("./google-campaign-breakdowns");
const { collectCampaignConversionActions } = require("./google-conversion-action-breakdown");
const { collectResponsiveSearchAds } = require("./google-rsa-collector");
const { analyzeRsaSet } = require("./google-rsa-analysis");
const { parseExactDateRange } = require("./google-exact-date-range");

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
    const exactRange = parseExactDateRange(req.query);
    const days = exactRange.provided && exactRange.valid ? exactRange.days : parseGoogleDays(req.query.days);
    if (!campaignId) return res.status(400).json({ success:false, source:"google_ads", error:"campaign id must contain 1 to 20 digits" });
    if (exactRange.provided && !exactRange.valid) return res.status(400).json({ success:false, source:"google_ads", campaign_id:campaignId, error:exactRange.error });
    if (!days) return res.status(400).json({ success:false, source:"google_ads", campaign_id:campaignId, error:"days must be an integer between 1 and 90" });

    try {
      const customer = getGoogleCustomer();
      const { start, end } = exactRange.provided ? exactRange : getGoogleDateRange(days);
      const [overview, ad_groups, search_terms, keywords, devices, hours, geography, rsa_ads, conversion_actions] = await Promise.all([
        collectCampaignOverview({ customer, campaignId, start, end }),
        collectCampaignAdGroups({ customer, campaignId, start, end }),
        collectCampaignSearchTerms({ customer, campaignId, start, end }),
        collectCampaignKeywords({ customer, campaignId, start, end }),
        collectCampaignDevices({ customer, campaignId, start, end }),
        collectCampaignHours({ customer, campaignId, start, end }),
        collectCampaignGeography({ customer, campaignId, start, end }),
        collectResponsiveSearchAds({ customer, campaignId, start, end }),
        collectCampaignConversionActions({ customer, campaignId, start, end }),
      ]);
      res.json({ success:true, source:"google_ads", mode:"read_only_intelligence", reader_version:4, campaign_id:campaignId, period_days:days, date_range:{start,end}, exact_date_range:exactRange.provided, overview, ad_groups, search_terms, keywords, devices, hours, geography, rsa_ads, rsa_analysis:analyzeRsaSet(rsa_ads), conversion_actions, writes_allowed:false, execution_allowed:false, spend_allowed:false });
    } catch (error) {
      res.status(500).json({ success:false, source:"google_ads", campaign_id:campaignId, error:cleanGoogleError(error), writes_allowed:false, execution_allowed:false, spend_allowed:false });
    }
  });
}

module.exports = { installGoogleCampaignIntelligenceRoute };
