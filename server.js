const express = require("express");
const path = require("path");
const axios = require("axios");
const { GoogleAdsApi } = require("google-ads-api");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
let META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PARMA_AGENT_API_KEY = process.env.PARMA_AGENT_API_KEY;

if (META_AD_ACCOUNT_ID && !META_AD_ACCOUNT_ID.startsWith("act_")) {
  META_AD_ACCOUNT_ID = `act_${META_AD_ACCOUNT_ID}`;
}

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const metaClient = axios.create({
  baseURL: META_BASE_URL,
  timeout: 20000,
});

function requireApiKey(req, res, next) {
  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "");

  if (!PARMA_AGENT_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Server API key is not configured",
    });
  }

  if (!apiKey || apiKey !== PARMA_AGENT_API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  next();
}

function disableAdWrites(req, res) {
  return res.status(403).json({
    success: false,
    error: "Ad write operations are disabled pending explicit human approval",
  });
}

function checkMetaConfig(res) {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    res.status(500).json({
      success: false,
      error: "Meta configuration missing",
    });
    return false;
  }
  return true;
}

function cleanMetaError(error) {
  return error.response?.data || { message: error.message || "Unknown error" };
}

function eurToMetaCents(eur) {
  const value = Number(eur);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

async function getCampaigns() {
  const response = await metaClient.get(`/${META_AD_ACCOUNT_ID}/campaigns`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields:
        "id,name,status,effective_status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type,special_ad_categories",
      limit: 100,
    },
  });

  return response.data.data || [];
}

async function getCampaign(campaignId) {
  const response = await metaClient.get(`/${campaignId}`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields:
        "id,name,status,effective_status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type,special_ad_categories",
    },
  });

  return response.data;
}

async function campaignExists(campaignId) {
  const campaigns = await getCampaigns();
  return campaigns.some((campaign) => campaign.id === campaignId);
}

async function updateCampaignStatus(campaignId, status) {
  const response = await metaClient.post(`/${campaignId}`, null, {
    params: {
      access_token: META_ACCESS_TOKEN,
      status,
    },
  });

  return response.data;
}

async function getInsights(objectId, datePreset = "last_30d") {
  const response = await metaClient.get(`/${objectId}/insights`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      date_preset: datePreset,
      fields:
        "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type",
    },
  });

  return response.data.data || [];
}

async function getCampaignStructure(campaignId) {
  const campaign = await getCampaign(campaignId);
  const campaignInsights = await getInsights(campaignId, "last_30d");

  const adsetsResponse = await metaClient.get(`/${campaignId}/adsets`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields:
        "id,name,status,effective_status,daily_budget,lifetime_budget,bid_strategy,optimization_goal,billing_event,start_time,end_time,created_time,updated_time,targeting",
      limit: 100,
    },
  });

  const adsets = adsetsResponse.data.data || [];

  const enrichedAdsets = [];

  for (const adset of adsets) {
    const adsetInsights = await getInsights(adset.id, "last_30d");

    const adsResponse = await metaClient.get(`/${adset.id}/ads`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        fields:
          "id,name,status,effective_status,created_time,updated_time,creative{id,name,object_story_spec,thumbnail_url}",
        limit: 100,
      },
    });

    const ads = adsResponse.data.data || [];

    const enrichedAds = [];

    for (const ad of ads) {
      const adInsights = await getInsights(ad.id, "last_30d");
      enrichedAds.push({
        ...ad,
        insights_last_30d: adInsights,
      });
    }

    enrichedAdsets.push({
      ...adset,
      insights_last_30d: adsetInsights,
      ads: enrichedAds,
    });
  }

  return {
    campaign,
    insights_last_30d: campaignInsights,
    adsets: enrichedAdsets,
  };
}

function buildDinnerBaselineTemplate() {
  return {
    success: true,
    template_name: "Parma Dinner Walk-in Baseline",
    business_goal: "Riempire la sera con traffico spontaneo locale e profittevole.",
    principle:
      "Baseline first: non contraddire decisioni operative già validate senza motivo economico chiaro.",
    campaigns: [
      {
        name: "Parma Early Dinner Push",
        time_window: "17:00–20:30",
        default_budget_eur: 3.5,
        goal: "Innescare la serata e riempire i primi tavoli.",
      },
      {
        name: "Parma Late Dinner Push",
        time_window: "20:30–closing",
        default_budget_eur: 6,
        goal: "Intercettare persone già fuori o decisioni spontanee tardive.",
      },
    ],
    targeting_defaults: {
      geo_radius_km: "3–5 km dal locale",
      area: "Kreuzberg, Friedrichshain, Neukölln nord, Mitte sud",
      age: "24–55",
      placements: [
        "Instagram Stories",
        "Instagram Reels",
        "Facebook Feed",
        "Facebook Reels",
      ],
    },
    creative_direction: [
      "pizza calda / forno",
      "vino versato",
      "atmosfera serale",
      "Kreuzberg summer evening",
      "messaggio autentico, non discount cheap",
    ],
    guardrails: [
      "No campagne fuori Germania",
      "No radius enorme tipo 48 km",
      "No budget alto senza conferma",
      "No modifica di campagne recruiting per obiettivi dinner",
      "No full autopilot publishing senza approvazione",
    ],
  };
}


function normalizeGoogleCustomerId(value) {
  return String(value || "").replace(/\D/g, "");
}

function parseGoogleCampaignId(value) {
  const campaignId = String(value || "").trim();
  return /^\d{1,20}$/.test(campaignId) ? campaignId : null;
}

function parseGoogleDays(value) {
  const days = Number(value ?? 30);
  return Number.isInteger(days) && days >= 1 && days <= 90 ? days : null;
}

function formatGoogleDate(date) {
  return date.toISOString().slice(0, 10);
}

function getGoogleDateRange(days) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    start: formatGoogleDate(start),
    end: formatGoogleDate(end),
  };
}

function checkGoogleConfig(res) {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_DEVELOPER_TOKEN",
    "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_CUSTOMER_ID",
  ];

  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    res.status(500).json({
      success: false,
      error: "Google Ads configuration missing",
      missing_variables: missing,
    });
    return false;
  }

  return true;
}

function getGoogleCustomer() {
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  const config = {
    customer_id: normalizeGoogleCustomerId(process.env.GOOGLE_CUSTOMER_ID),
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  };

  const loginCustomerId = normalizeGoogleCustomerId(
    process.env.GOOGLE_LOGIN_CUSTOMER_ID
  );

  if (loginCustomerId) {
    config.login_customer_id = loginCustomerId;
  }

  return client.Customer(config);
}

function cleanGoogleError(error) {
  const firstError = Array.isArray(error?.errors) ? error.errors[0] : null;

  return {
    message:
      firstError?.message ||
      error?.message ||
      "Google Ads request failed",
    code: firstError?.error_code || null,
    request_id: error?.request_id || null,
  };
}

async function getGoogleCampaignMetrics(campaignId, days) {
  const customer = getGoogleCustomer();
  const { start, end } = getGoogleDateRange(days);

  const rows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);

  return rows.map((row) => ({
    campaign_id: String(row.campaign.id),
    campaign_name: row.campaign.name,
    status: row.campaign.status,
    channel_type: row.campaign.advertising_channel_type,
    impressions: Number(row.metrics.impressions || 0),
    clicks: Number(row.metrics.clicks || 0),
    cost_eur: Number(row.metrics.cost_micros || 0) / 1_000_000,
    ctr: Number(row.metrics.ctr || 0),
    average_cpc_eur: Number(row.metrics.average_cpc || 0) / 1_000_000,
    conversions: Number(row.metrics.conversions || 0),
    conversion_value: Number(row.metrics.conversions_value || 0),
  }));
}

app.get("/", (req, res) => {
  
  res.json({
    success: true,
    service: "Parma Growth Operator",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
  });
});

app.get("/meta/test", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const response = await metaClient.get(`/${META_AD_ACCOUNT_ID}`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        fields: "id,name,account_status,amount_spent",
      },
    });

    res.json({
      success: true,
      account: response.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/tools/score", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();

    const campaignsTotal = campaigns.length;

    const activeCampaigns = campaigns.filter(
      (campaign) =>
        campaign.status === "ACTIVE" ||
        campaign.effective_status === "ACTIVE"
    ).length;
    const campaignsWithoutData = activeCampaigns;

    const campaignsWithIssues = campaigns.filter(
      (campaign) =>
        campaign.effective_status === "WITH_ISSUES"
    ).length;

    let score = 100;
    const reasons = [];

    if (activeCampaigns === 0) {
      score -= 40;
      reasons.push("No active campaigns");
    }

    if (activeCampaigns === 1) {
      score -= 10;
      reasons.push("Only one active campaign");
    }
    if (campaignsWithoutData > 0) {
  score -= 15;
  reasons.push(`${campaignsWithoutData} active campaigns have no data`);
    }

    score -= campaignsWithIssues * 5;

    if (campaignsWithIssues > 0) {
  growthReasons.push(`${campaignsWithIssues} campaigns have issues`);
}

    if (score < 0) score = 0;

    let status = "healthy";

    if (score < 80) status = "warning";
    if (score < 60) status = "needs_attention";
    if (score < 40) status = "critical";

    res.json({
      success: true,
      growth_score: score,
      status,
      reasons,
      summary: {
        campaigns_total: campaignsTotal,
        campaigns_active: activeCampaigns,
        campaigns_with_issues: campaignsWithIssues,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});
app.get("/tools/active-campaigns/report", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();

    const activeCampaigns = campaigns.filter(
      (campaign) =>
        campaign.status === "ACTIVE" ||
        campaign.effective_status === "ACTIVE"
    );

    const report = await Promise.all(
  activeCampaigns.map(async (campaign) => {
    const response = await metaClient.get(`/${META_AD_ACCOUNT_ID}/insights`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        date_preset: "last_30d",
        level: "campaign",
        filtering: JSON.stringify([
          { field: "campaign.id", operator: "IN", value: [campaign.id] },
        ]),
        fields: "spend,impressions,reach,clicks",
      },
    });

    const metrics = response.data.data || [];

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      effective_status: campaign.effective_status,
      metrics_status: metrics.length ? "has_data" : "no_data",
      metrics,
    };
  })
);

    res.json({
  success: true,
  generated_at: new Date().toISOString(),
  active_campaigns: report,
  summary: {
    active_campaigns: report.length,
    campaigns_with_data: report.filter(
      (campaign) => campaign.metrics_status === "has_data"
    ).length,
    campaigns_without_data: report.filter(
      (campaign) => campaign.metrics_status === "no_data"
    ).length,
  },
});
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});
app.get("/tools/recommendations", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();

    const activeCampaigns = campaigns.filter(
      (campaign) => campaign.status === "ACTIVE" || campaign.effective_status === "ACTIVE"
    );

    const campaignsWithIssues = campaigns.filter(
      (campaign) => campaign.effective_status === "WITH_ISSUES"
    );

    const pausedCampaigns = campaigns.filter(
      (campaign) => campaign.status === "PAUSED" || campaign.effective_status === "PAUSED"
    );

    const recommendations = [];

    if (activeCampaigns.length === 0) {
      recommendations.push({
        priority: "high",
        type: "meta_campaigns",
        message: "No active Meta campaigns found. Consider activating a small test campaign.",
      });
    }

    if (activeCampaigns.length === 1) {
      recommendations.push({
        priority: "medium",
        type: "meta_campaigns",
        message: "Only one Meta campaign is currently active. Review whether this is intentional.",
      });
    }

   if (campaignsWithIssues > 0) {
      recommendations.push({
        priority: "high",
        type: "meta_issues",
        message: `${campaignsWithIssues.length} Meta campaigns have issues and require attention.`,
        campaign_ids: campaignsWithIssues.map((campaign) => campaign.id),
      });
    }

    const pausedSalesCampaigns = pausedCampaigns.filter(
      (campaign) =>
        campaign.objective === "OUTCOME_SALES" ||
        campaign.objective === "CONVERSIONS"
    );

    if (pausedSalesCampaigns.length > 0) {
      recommendations.push({
        priority: "medium",
        type: "sales_opportunity",
        message: `${pausedSalesCampaigns.length} sales/conversion campaigns are paused. Review whether one should be reactivated for a controlled test.`,
        campaign_ids: pausedSalesCampaigns.map((campaign) => campaign.id),
      });
    }

    const growthReasons = [];

if (activeCampaigns.length === 1) {
  growthReasons.push("Only one active campaign");
}

if (activeCampaigns.length > 0) {
  growthReasons.push(`${activeCampaigns.length} active campaign(s) have no data`);
}

if (campaignsWithIssues > 0) {
  growthReasons.push(`${campaignsWithIssues} campaigns have issues`);
}
    res.json({
      success: true,
      generated_at: new Date().toISOString(),
      recommendations,
      summary: {
        campaigns_total: campaigns.length,
        campaigns_active: activeCampaigns.length,
        campaigns_paused: pausedCampaigns.length,
        campaigns_with_issues: campaignsWithIssues.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});
app.get("/tools/status", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();

    const campaignsTotal = campaigns.length;
    const activeCampaigns = campaigns.filter(
      (campaign) => campaign.status === "ACTIVE" || campaign.effective_status === "ACTIVE"
    );
    const campaignsPaused = campaigns.filter(
      (campaign) => campaign.status === "PAUSED" || campaign.effective_status === "PAUSED"
    ).length;
    const campaignsWithIssues = campaigns.filter(
      (campaign) => campaign.effective_status === "WITH_ISSUES"
    ).length;

const growthReasons = [];

if (activeCampaigns.length === 1) {
  growthReasons.push("Only one active campaign");
}

if (activeCampaigns.length > 0) {
  growthReasons.push(`${activeCampaigns.length} active campaign(s) have no data`);
}

if (campaignsWithIssues.length > 0) {
  growthReasons.push(`${campaignsWithIssues.length} campaigns have issues`);
}
    
    const recommendations = [];

    if (activeCampaigns.length === 0) {
      recommendations.push("No active campaigns found");
    }

    if (campaignsWithIssues > 0) {
      recommendations.push("Some campaigns have issues and require attention");
    }

    res.json({
      success: true,
      system: {
        railway_online: true,
        api_key_required: true,
      },
      meta: {
        connected: true,
        ad_account_id: META_AD_ACCOUNT_ID,
        campaigns_total: campaignsTotal,
        campaigns_active: activeCampaigns.length,
        campaigns_paused: campaignsPaused,
        campaigns_with_issues: campaignsWithIssues,
        active_campaigns: activeCampaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          effective_status: campaign.effective_status,
        })),
      },
            growth: {
  growth_score:
    100 -
    (activeCampaigns.length === 0 ? 40 : activeCampaigns.length === 1 ? 10 : 0) -
    activeCampaigns.length * 15 -
    campaignsWithIssues * 5,

 reasons: growthReasons,
              
  status:
    100 -
      (activeCampaigns.length === 0 ? 40 : activeCampaigns.length === 1 ? 10 : 0) -
      activeCampaigns.length * 15 -
      campaignsWithIssues * 5 <
    60
      ? "needs_attention"
      : 100 -
          (activeCampaigns.length === 0 ? 40 : activeCampaigns.length === 1 ? 10 : 0) -
          activeCampaigns.length * 15 -
          campaignsWithIssues * 5 <
        80
      ? "warning"
      : "healthy",
},
      google: {
        connected: Boolean(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN
        ),
        conversion_tracking: "booking_completed configured in GA4 / Google Ads",
      },
      recommendations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/tools/dashboard", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();

    const campaignsTotal = campaigns.length;
    const campaignsActive = campaigns.filter(
      (campaign) => campaign.status === "ACTIVE" || campaign.effective_status === "ACTIVE"
    ).length;
    const campaignsPaused = campaigns.filter(
      (campaign) => campaign.status === "PAUSED" || campaign.effective_status === "PAUSED"
    ).length;

    res.json({
      success: true,
      meta: {
        connected: true,
        ad_account_id: META_AD_ACCOUNT_ID,
        campaigns_total: campaignsTotal,
        campaigns_active: campaignsActive,
        campaigns_paused: campaignsPaused,
        campaigns,
      },
      google: {
        connected: Boolean(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN
        ),
        conversion_tracking: "booking_completed configured in GA4 / Google Ads",
      },
      system: {
        railway_online: true,
        api_key_required: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/meta/campaigns", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();
    res.json({ success: true, campaigns });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/meta/campaign/:id/start", requireApiKey, disableAdWrites, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const campaignId = req.params.id;

  try {
    const exists = await campaignExists(campaignId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
        campaign_id: campaignId,
      });
    }

    const result = await updateCampaignStatus(campaignId, "ACTIVE");

    res.json({
      success: true,
      message: "Campaign started",
      campaign_id: campaignId,
      meta_response: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/meta/campaign/:id/stop", requireApiKey, disableAdWrites, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const campaignId = req.params.id;

  try {
    const exists = await campaignExists(campaignId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
        campaign_id: campaignId,
      });
    }

    const result = await updateCampaignStatus(campaignId, "PAUSED");

    res.json({
      success: true,
      message: "Campaign paused",
      campaign_id: campaignId,
      meta_response: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/meta/campaign/:id/structure", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const structure = await getCampaignStructure(req.params.id);
    res.json({
      success: true,
      campaign_id: req.params.id,
      structure,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/tools/campaigns", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();
    res.json({ success: true, campaigns });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.post("/tools/campaign/start", requireApiKey, disableAdWrites, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const { campaign_id } = req.body;

  if (!campaign_id) {
    return res.status(400).json({
      success: false,
      error: "campaign_id is required",
    });
  }

  try {
    const exists = await campaignExists(campaign_id);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
        campaign_id,
      });
    }

    const result = await updateCampaignStatus(campaign_id, "ACTIVE");

    res.json({
      success: true,
      message: "Campaign started",
      campaign_id,
      meta_response: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.post("/tools/campaign/pause", requireApiKey, disableAdWrites, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const { campaign_id } = req.body;

  if (!campaign_id) {
    return res.status(400).json({
      success: false,
      error: "campaign_id is required",
    });
  }

  try {
    const exists = await campaignExists(campaign_id);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
        campaign_id,
      });
    }

    const result = await updateCampaignStatus(campaign_id, "PAUSED");

    res.json({
      success: true,
      message: "Campaign paused",
      campaign_id,
      meta_response: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.post("/tools/campaign/metrics", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const { campaign_id, date_preset } = req.body;

  if (!campaign_id) {
    return res.status(400).json({
      success: false,
      error: "campaign_id is required",
    });
  }

  try {
    const insights = await getInsights(campaign_id, date_preset || "last_30d");

    res.json({
      success: true,
      campaign_id,
      date_preset: date_preset || "last_30d",
      insights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.post("/tools/campaign/structure", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const { campaign_id } = req.body;

  if (!campaign_id) {
    return res.status(400).json({
      success: false,
      error: "campaign_id is required",
    });
  }

  try {
    const structure = await getCampaignStructure(campaign_id);

    res.json({
      success: true,
      campaign_id,
      structure,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.post("/tools/campaign/update-budget", requireApiKey, disableAdWrites, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const { campaign_id, daily_budget_eur } = req.body;

  if (!campaign_id) {
    return res.status(400).json({
      success: false,
      error: "campaign_id is required",
    });
  }

  const dailyBudgetCents = eurToMetaCents(daily_budget_eur);

  if (!dailyBudgetCents) {
    return res.status(400).json({
      success: false,
      error: "daily_budget_eur must be a positive number",
    });
  }

  if (dailyBudgetCents > 2000) {
    return res.status(400).json({
      success: false,
      error:
        "Budget guardrail: daily budget above 20 EUR requires manual backend change",
    });
  }

  try {
    const response = await metaClient.post(`/${campaign_id}`, null, {
      params: {
        access_token: META_ACCESS_TOKEN,
        daily_budget: dailyBudgetCents,
      },
    });

    res.json({
      success: true,
      message: "Campaign budget updated",
      campaign_id,
      daily_budget_eur,
      daily_budget_meta_cents: dailyBudgetCents,
      meta_response: response.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.get("/tools/dinner-baseline-template", requireApiKey, (req, res) => {
  res.json(buildDinnerBaselineTemplate());
});

app.get("/tools/test-ui", requireApiKey, disableAdWrites, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Parma Growth Operator</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1000px;
      margin: 40px auto;
      padding: 20px;
      background: #f7f7f7;
    }
    h1 { color: #222; }
    button {
      padding: 8px 14px;
      margin: 4px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: white;
      font-weight: bold;
    }
    .load { background: #333; }
    .pause { background: #b00020; }
    .start { background: #1b7f3a; }
    .structure { background: #3454d1; }
    .campaign {
      background: white;
      border-radius: 10px;
      padding: 16px;
      margin: 16px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .status { font-weight: bold; }
    .message {
      margin-top: 20px;
      padding: 12px;
      border-radius: 8px;
      display: none;
    }
    .success { background: #e3f7e9; color: #145c2e; }
    .error { background: #fde7e7; color: #8a1111; }
    pre {
      background: #111;
      color: #eee;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <h1>Parma Growth Operator</h1>

  <button class="load" onclick="loadCampaigns()">Load Campaigns</button>

  <div id="message" class="message"></div>
  <div id="campaigns"></div>
  <pre id="debug" style="display:none;"></pre>

  <script>
    async function loadCampaigns() {
      showMessage("Loading campaigns...", true);

      try {
        const response = await fetch("/meta/campaigns");
        const data = await response.json();

        if (!data.success) {
          showMessage("Error loading campaigns", false);
          return;
        }

        const container = document.getElementById("campaigns");
        container.innerHTML = "";

        data.campaigns.forEach(campaign => {
          const div = document.createElement("div");
          div.className = "campaign";

          const budget = campaign.daily_budget
            ? (Number(campaign.daily_budget) / 100).toFixed(2) + " € / day"
            : "No campaign budget";

          div.innerHTML = \`
            <h3>\${campaign.name}</h3>
            <p>ID: \${campaign.id}</p>
            <p>Status: <span class="status">\${campaign.status} / \${campaign.effective_status}</span></p>
            <p>Objective: \${campaign.objective || "-"}</p>
            <p>Budget: \${budget}</p>
            <button class="pause" onclick="pauseCampaign('\${campaign.id}')">Pause</button>
            <button class="start" onclick="startCampaign('\${campaign.id}')">Start</button>
            <button class="structure" onclick="loadStructure('\${campaign.id}')">Structure</button>
          \`;

          container.appendChild(div);
        });

        showMessage("Campaigns loaded", true);
      } catch (err) {
        showMessage("Network error while loading campaigns", false);
      }
    }

    async function pauseCampaign(id) {
      await callAction("/meta/campaign/" + id + "/stop", "Campaign paused");
    }

    async function startCampaign(id) {
      await callAction("/meta/campaign/" + id + "/start", "Campaign started");
    }

    async function loadStructure(id) {
      showMessage("Loading campaign structure...", true);
      const debug = document.getElementById("debug");
      debug.style.display = "block";
      debug.textContent = "Loading...";

      try {
        const response = await fetch("/meta/campaign/" + id + "/structure");
        const data = await response.json();
        debug.textContent = JSON.stringify(data, null, 2);

        if (data.success) {
          showMessage("Structure loaded", true);
        } else {
          showMessage("Error loading structure", false);
        }
      } catch (err) {
        showMessage("Network error while loading structure", false);
      }
    }

    async function callAction(url, successMessage) {
      showMessage("Sending command...", true);

      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          showMessage(successMessage, true);
          setTimeout(loadCampaigns, 1500);
        } else {
          showMessage("Error: " + JSON.stringify(data.error), false);
        }
      } catch (err) {
        showMessage("Network error", false);
      }
    }

    function showMessage(text, success) {
      const box = document.getElementById("message");
      box.style.display = "block";
      box.className = "message " + (success ? "success" : "error");
      box.textContent = text;
    }

    loadCampaigns();
  </script>
</body>
</html>
  `);
});


app.get("/tools/google/test", requireApiKey, async (req, res) => {
  if (!checkGoogleConfig(res)) return;

  try {
    const customer = getGoogleCustomer();
    const rows = await customer.query(`
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone
      FROM customer
      LIMIT 1
    `);

    res.json({
      success: true,
      connected: true,
      account: rows[0] || null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      connected: false,
      error: cleanGoogleError(error),
    });
  }
});

async function handleGoogleCampaignMetrics(req, res) {
  if (!checkGoogleConfig(res)) return;

  const campaignId = parseGoogleCampaignId(req.params.id);
  const days = parseGoogleDays(req.query.days);

  if (!campaignId) {
    return res.status(400).json({
      success: false,
      source: "google_ads",
      error: "campaign id must contain 1 to 20 digits",
    });
  }

  if (!days) {
    return res.status(400).json({
      success: false,
      source: "google_ads",
      campaign_id: campaignId,
      error: "days must be an integer between 1 and 90",
    });
  }

  try {
    const metrics = await getGoogleCampaignMetrics(campaignId, days);

    res.json({
      success: true,
      source: "google_ads",
      campaign_id: campaignId,
      period_days: days,
      status: metrics.length ? "has_data" : "no_data",
      message: metrics.length
        ? "Google Ads metrics found"
        : "No Google Ads delivery or spend found for this campaign in the selected period",
      metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      source: "google_ads",
      campaign_id: campaignId,
      error: cleanGoogleError(error),
    });
  }
}

app.get(
  "/tools/google/campaign/:id/metrics",
  requireApiKey,
  handleGoogleCampaignMetrics
);

/*
 * Backward-compatible route.
 * It now reads Google Ads, not Meta.
 */
app.get(
  "/tools/campaign/:id/metrics",
  requireApiKey,
  handleGoogleCampaignMetrics
);

app.get("/tools/meta/campaign/:id/metrics", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const insights = await getInsights(req.params.id, req.query.date_preset || "last_30d");

    res.json({
      success: true,
      source: "meta_ads",
      campaign_id: req.params.id,
      date_preset: req.query.date_preset || "last_30d",
      status: insights.length ? "has_data" : "no_data",
      insights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      source: "meta_ads",
      campaign_id: req.params.id,
      error: cleanMetaError(error),
    });
  }
});

const disabledGoogleSetupRoutes = [
  "/auth/google",
  "/auth/google/callback",
  "/google/ads/test",
  "/google/accounts",
  "/google/accounts-direct",
];

app.get(disabledGoogleSetupRoutes, (req, res) => {
  res.status(410).json({
    success: false,
    error: "Legacy Google setup endpoint disabled",
  });
});

app.get("/openapi.yaml", (req, res) => {
  res.sendFile(path.join(__dirname, "openapi.yaml"));
});

app.listen(PORT, () => {
  console.log(`Parma Growth Operator running on port ${PORT}`);
});
