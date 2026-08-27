const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
} = require("./google-campaign-breakdowns");

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
    if (!days) return res.status(400).json({ success:false, source:"google_ads", campaign_id:campaignId, error:"days must be an integer between 1 and 90" });

    try {
      const customer = getGoogleCustomer();
      const { start, end } = getGoogleDateRange(days);
      const [search_terms, keywords, devices, hours, geography] = await Promise.all([
        collectCampaignSearchTerms({ customer, campaignId, start, end }),
        collectCampaignKeywords({ customer, campaignId, start, end }),
        collectCampaignDevices({ customer, campaignId, start, end }),
        collectCampaignHours({ customer, campaignId, start, end }),
        collectCampaignGeography({ customer, campaignId, start, end }),
      ]);
      res.json({ success:true, source:"google_ads", mode:"read_only_intelligence", campaign_id:campaignId, period_days:days, date_range:{start,end}, search_terms, keywords, devices, hours, geography, writes_allowed:false, execution_allowed:false, spend_allowed:false });
    } catch (error) {
      res.status(500).json({ success:false, source:"google_ads", campaign_id:campaignId, error:cleanGoogleError(error), writes_allowed:false, execution_allowed:false, spend_allowed:false });
    }
  });
}

module.exports = { installGoogleCampaignIntelligenceRoute };
