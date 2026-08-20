const express = require("express");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");
const { GoogleAdsApi } = require("google-ads-api");
const { buildGoogleReadiness, buildMetaOverview } = require("./reporting");
const { buildMetaDinnerProposal } = require("./proposals");
const {
  APPROVAL_TOKEN: META_PAUSED_DRAFT_APPROVAL_TOKEN,
  PartialMetaDraftError,
  buildPausedReservationDraft,
  createPausedReservationDraft,
  discoverInstagramReelAssets,
} = require("./meta-paused-draft");

const app = express();
app.use(express.json({ limit: "100kb" }));

app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    console.log(
      JSON.stringify({
        event: "http_request",
        request_id: requestId,
        method: req.method,
        path: req.route?.path || req.path,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
      })
    );
  });

  next();
});

const PORT = process.env.PORT || 3000;

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
let META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PARMA_AGENT_API_KEY = process.env.PARMA_AGENT_API_KEY;
const META_PAUSED_DRAFT_WRITES_ENABLED =
  process.env.META_PAUSED_DRAFT_WRITES_ENABLED === "true";

if (META_AD_ACCOUNT_ID && !META_AD_ACCOUNT_ID.startsWith("act_")) {
  META_AD_ACCOUNT_ID = `act_${META_AD_ACCOUNT_ID}`;
}

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const metaClient = axios.create({
  baseURL: META_BASE_URL,
  timeout: 20000,
});

const metaReadTransport = {
  async get(endpoint, params = {}) {
    const response = await metaClient.get(endpoint, {
      params: {
        ...params,
        access_token: META_ACCESS_TOKEN,
      },
    });
    return response.data;
  },
};

const metaWriteTransport = {
  ...metaReadTransport,
  async post(endpoint, payload = {}) {
    const form = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      form.set(
        key,
        value && typeof value === "object" ? JSON.stringify(value) : String(value)
      );
    });
    form.set("access_token", META_ACCESS_TOKEN);

    const response = await metaClient.post(endpoint, form, {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    return response.data;
  },
};

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
  const metaError = error?.response?.data?.error;

  return {
    message:
      metaError?.message ||
      error?.message ||
      "Meta Ads request failed",
    type: metaError?.type || null,
    code: metaError?.code || null,
    subcode: metaError?.error_subcode || null,
  };
}

function parseMetaObjectId(value) {
  const objectId = String(value || "").trim();
  return /^\d{1,30}$/.test(objectId) ? objectId : null;
}

const allowedMetaDatePresets = new Set([
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
]);

function parseMetaDatePreset(value) {
  const preset = String(value || "last_30d").trim();
  return allowedMetaDatePresets.has(preset) ? preset : null;
}

function parseProposalBudget(value) {
  const budget = Number(value ?? 6);
  return Number.isFinite(budget) && budget >= 3 && budget <= 20
    ? Math.round(budget * 100) / 100
    : null;
}

function parseProposalDuration(value) {
  const duration = Number(value ?? 14);
  return Number.isInteger(duration) && duration >= 7 && duration <= 30
    ? duration
    : null;
}

function parseProposalGoal(value) {
  const goal = String(value || "dinner_visits").trim();
  return new Set(["dinner_visits", "reservations"]).has(goal) ? goal : null;
}

function eurToMetaCents(eur) {
  const value = Number(eur);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

async function getMetaCollection(endpoint, params, maxPages = 20) {
  const data = [];
  let after = null;
  let pageCount = 0;
  let hasMore = false;

  do {
    const response = await metaClient.get(endpoint, {
      params: {
        ...params,
        access_token: META_ACCESS_TOKEN,
        limit: 100,
        ...(after ? { after } : {}),
      },
    });

    data.push(...(response.data.data || []));
    pageCount += 1;

    const nextCursor = response.data.paging?.cursors?.after || null;
    hasMore = Boolean(response.data.paging?.next && nextCursor);
    after = hasMore ? nextCursor : null;
  } while (hasMore && pageCount < maxPages);

  return {
    data,
    pages: pageCount,
    truncated: hasMore,
  };
}

async function getCampaignCollection() {
  return getMetaCollection(`/${META_AD_ACCOUNT_ID}/campaigns`, {
    fields:
      "id,name,status,effective_status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type,special_ad_categories",
  });
}

async function getCampaigns() {
  const collection = await getCampaignCollection();
  return collection.data;
}

async function getCampaignInsights(datePreset) {
  return getMetaCollection(`/${META_AD_ACCOUNT_ID}/insights`, {
    date_preset: datePreset,
    level: "campaign",
    fields:
      "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type",
  });
}

async function getAdSetCollection() {
  return getMetaCollection(`/${META_AD_ACCOUNT_ID}/adsets`, {
    fields:
      "id,campaign_id,status,effective_status,start_time,end_time,created_time,updated_time",
  });
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
    const activeCampaigns = campaigns.filter(
      (campaign) =>
        campaign.status === "ACTIVE" ||
        campaign.effective_status === "ACTIVE"
    ).length;
    const campaignsWithIssues = campaigns.filter(
      (campaign) => campaign.effective_status === "WITH_ISSUES"
    ).length;

    let score = 100;
    const reasons = [];

    if (activeCampaigns === 0) {
      score -= 40;
      reasons.push("No active campaigns");
    } else if (activeCampaigns === 1) {
      score -= 10;
      reasons.push("Only one active campaign");
    }

    if (campaignsWithIssues > 0) {
      score -= campaignsWithIssues * 5;
      reasons.push(`${campaignsWithIssues} campaigns have issues`);
    }

    score = Math.max(score, 0);

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
        campaigns_total: campaigns.length,
        campaigns_active: activeCampaigns,
        campaigns_with_issues: campaignsWithIssues,
        data_completeness: "not_assessed",
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
      (campaign) =>
        campaign.status === "ACTIVE" ||
        campaign.effective_status === "ACTIVE"
    );
    const campaignsWithIssues = campaigns.filter(
      (campaign) => campaign.effective_status === "WITH_ISSUES"
    );
    const pausedCampaigns = campaigns.filter(
      (campaign) =>
        campaign.status === "PAUSED" ||
        campaign.effective_status === "PAUSED"
    );
    const recommendations = [];

    if (activeCampaigns.length === 0) {
      recommendations.push({
        priority: "high",
        type: "meta_campaigns",
        message:
          "No active Meta campaigns found. Prepare a controlled campaign proposal for human review.",
      });
    } else if (activeCampaigns.length === 1) {
      recommendations.push({
        priority: "medium",
        type: "meta_campaigns",
        message:
          "Only one Meta campaign is currently active. Review whether this is intentional.",
      });
    }

    if (campaignsWithIssues.length > 0) {
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
        message:
          `${pausedSalesCampaigns.length} sales/conversion campaigns are paused. Prepare a reactivation proposal for human review.`,
        campaign_ids: pausedSalesCampaigns.map((campaign) => campaign.id),
      });
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
    const activeCampaigns = campaigns.filter(
      (campaign) =>
        campaign.status === "ACTIVE" ||
        campaign.effective_status === "ACTIVE"
    );
    const campaignsPaused = campaigns.filter(
      (campaign) =>
        campaign.status === "PAUSED" ||
        campaign.effective_status === "PAUSED"
    ).length;
    const campaignsWithIssues = campaigns.filter(
      (campaign) => campaign.effective_status === "WITH_ISSUES"
    ).length;

    const growthReasons = [];

    if (activeCampaigns.length === 0) {
      growthReasons.push("No active campaigns");
    } else if (activeCampaigns.length === 1) {
      growthReasons.push("Only one active campaign");
    }

    if (campaignsWithIssues > 0) {
      growthReasons.push(`${campaignsWithIssues} campaigns have issues`);
    }

    const growthScore = Math.max(
      100 -
        (activeCampaigns.length === 0
          ? 40
          : activeCampaigns.length === 1
            ? 10
            : 0) -
        campaignsWithIssues * 5,
      0
    );

    let growthStatus = "healthy";
    if (growthScore < 80) growthStatus = "warning";
    if (growthScore < 60) growthStatus = "needs_attention";
    if (growthScore < 40) growthStatus = "critical";

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
        ad_writes_enabled: false,
      },
      meta: {
        connected: true,
        ad_account_id: META_AD_ACCOUNT_ID,
        campaigns_total: campaigns.length,
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
        growth_score: growthScore,
        reasons: growthReasons,
        status: growthStatus,
        data_completeness: "not_assessed",
      },
      google: {
        connected: Boolean(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN
        ),
        conversion_tracking:
          "booking_completed configured in GA4 / Google Ads",
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

async function handleOverviewReport(req, res) {
  if (!checkMetaConfig(res)) return;

  const datePreset = parseMetaDatePreset(req.query.date_preset);

  if (!datePreset) {
    return res.status(400).json({
      success: false,
      error:
        "date_preset must be one of: last_7d, last_14d, last_30d, last_90d",
    });
  }

  try {
    const [campaignCollection, insightCollection, adSetCollection] = await Promise.all([
      getCampaignCollection(),
      getCampaignInsights(datePreset),
      getAdSetCollection(),
    ]);
    const metaOverview = buildMetaOverview(
      campaignCollection.data,
      insightCollection.data,
      adSetCollection.data
    );
    const partialData =
      campaignCollection.truncated ||
      insightCollection.truncated ||
      adSetCollection.truncated;

    res.json({
      success: true,
      generated_at: new Date().toISOString(),
      period: {
        source: "meta_date_preset",
        value: datePreset,
      },
      system: {
        railway_online: true,
        api_key_required: true,
        report_mode: "read_only",
        ad_writes_enabled: false,
      },
      meta: {
        connected: true,
        ad_account_id: META_AD_ACCOUNT_ID,
        ...metaOverview,
      },
      google: buildGoogleReadiness(),
      data_quality: {
        status: partialData ? "partial" : "complete_for_returned_scope",
        meta_pages: {
          campaigns: campaignCollection.pages,
          insights: insightCollection.pages,
          adsets: adSetCollection.pages,
        },
        caveats: [
          "Campaign delivery status is verified against ad set schedules; an enabled campaign with only expired ad sets is reported as completed, not active",
          "reach_sum can count the same person in more than one campaign",
          "Meta action types are returned separately and are not combined into a conversion total until the business conversion definition is approved",
          "This report does not call Google Ads; use the protected Google test and campaign metrics endpoints to verify live access",
        ],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
}

app.get("/tools/report/overview", requireApiKey, handleOverviewReport);
app.get("/tools/dashboard", requireApiKey, handleOverviewReport);

app.get("/tools/meta/draft-assets", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const assets = await discoverInstagramReelAssets({
      transport: metaReadTransport,
      adAccountId: META_AD_ACCOUNT_ID,
      instagramUsername: "parma.divinibenedetti",
      reelPermalink: req.query.reel_permalink,
    });

    res.json({
      success: true,
      mode: "read_only",
      assets,
      ad_writes_enabled: false,
    });
  } catch (error) {
    const isInputError = error instanceof TypeError;
    res.status(isInputError ? 400 : 500).json({
      success: false,
      error: isInputError
        ? { message: error.message, type: "validation_error" }
        : cleanMetaError(error),
    });
  }
});

const PARMA_REEL_PERMALINK =
  "https://www.instagram.com/reel/C9M7_b6MayR/";
const PARMA_LATITUDE = 52.499492;
const PARMA_LONGITUDE = 13.4399793;

function parseFutureMetaStart(value) {
  const start = new Date(String(value || ""));
  if (Number.isNaN(start.getTime())) return null;
  if (start.getTime() <= Date.now() + 15 * 60 * 1000) return null;
  return start.toISOString();
}

async function preparePausedReservationDraft(startsAt) {
  const assets = await discoverInstagramReelAssets({
    transport: metaReadTransport,
    adAccountId: META_AD_ACCOUNT_ID,
    instagramUsername: "parma.divinibenedetti",
    reelPermalink: PARMA_REEL_PERMALINK,
  });

  return buildPausedReservationDraft({
    pageId: assets.page_id,
    instagramUserId: assets.instagram_user_id,
    sourceInstagramMediaId: assets.source_instagram_media_id,
    latitude: PARMA_LATITUDE,
    longitude: PARMA_LONGITUDE,
    dailyBudgetEur: 6,
    durationDays: 14,
    startsAt,
  });
}

function summarizePausedReservationDraft(draft) {
  return {
    mode: draft.policy.mode,
    ready_to_create: true,
    creates_paused_objects_only: true,
    activates_spend: false,
    campaign: {
      name: draft.campaign.name,
      objective: draft.campaign.objective,
      status: draft.campaign.status,
    },
    budget: draft.budget,
    schedule: {
      starts_at: draft.adSet.start_time,
      ends_at: draft.adSet.end_time,
      local_delivery: "Monday-Sunday, 17:00-23:00 in the ad account timezone",
    },
    audience: {
      radius_km: 3,
      age_min: 23,
      age_max: 60,
    },
    placements: {
      platform: "instagram",
      positions: draft.adSet.targeting.instagram_positions,
    },
    creative: {
      instagram_account_verified: true,
      reel_verified: true,
      existing_reel_reused: true,
      call_to_action: "BOOK_NOW",
      destination: draft.creative.call_to_action.value.link,
    },
    write_gate_enabled: META_PAUSED_DRAFT_WRITES_ENABLED,
  };
}

app.get("/tools/meta/reservation-draft/preview", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const startsAt = parseFutureMetaStart(req.query.starts_at);
  if (!startsAt) {
    return res.status(400).json({
      success: false,
      error: "starts_at must be a valid ISO date-time at least 15 minutes in the future",
    });
  }

  try {
    const draft = await preparePausedReservationDraft(startsAt);
    res.json({
      success: true,
      mode: "read_only_preview",
      ...summarizePausedReservationDraft(draft),
    });
  } catch (error) {
    res.status(error instanceof TypeError ? 400 : 500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
});

app.post("/tools/meta/reservation-draft/create", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;
  if (!META_PAUSED_DRAFT_WRITES_ENABLED) {
    return res.status(403).json({
      success: false,
      error: "Paused Meta draft creation is disabled by the server write gate",
    });
  }
  if (req.body?.approval_token !== META_PAUSED_DRAFT_APPROVAL_TOKEN) {
    return res.status(403).json({
      success: false,
      error: "Exact paused-draft approval token is required",
    });
  }

  const startsAt = parseFutureMetaStart(req.body?.starts_at);
  if (!startsAt) {
    return res.status(400).json({
      success: false,
      error: "starts_at must be a valid ISO date-time at least 15 minutes in the future",
    });
  }

  try {
    const draft = await preparePausedReservationDraft(startsAt);
    const existingCampaigns = await getCampaignCollection();
    const duplicate = (existingCampaigns?.data || []).find(
      (campaign) => campaign?.name === draft.campaign.name
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "A Meta campaign draft already exists for this start date",
      });
    }

    const result = await createPausedReservationDraft({
      transport: metaWriteTransport,
      adAccountId: META_AD_ACCOUNT_ID,
      draft,
      approvalToken: req.body.approval_token,
    });

    res.status(201).json({
      success: true,
      mode: result.mode,
      created: result.created,
      statuses: Object.values(result.verification).map((object) => ({
        status: object?.status || null,
        effective_status: object?.effective_status || null,
      })),
      activates_spend: false,
      next_required_action:
        "Inspect the paused draft in Meta Ads Manager; activation requires a separate future approval and remains disabled",
    });
  } catch (error) {
    const partial = error instanceof PartialMetaDraftError;
    res.status(partial ? 502 : error instanceof TypeError ? 400 : 500).json({
      success: false,
      error: cleanMetaError(partial ? error.cause : error),
      ...(partial ? { partial_paused_objects: error.created } : {}),
      activates_spend: false,
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

  const campaignId = parseMetaObjectId(req.body?.campaign_id);
  const datePreset = parseMetaDatePreset(req.body?.date_preset);

  if (!campaignId) {
    return res.status(400).json({
      success: false,
      error: "campaign_id must contain 1 to 30 digits",
    });
  }

  if (!datePreset) {
    return res.status(400).json({
      success: false,
      error:
        "date_preset must be one of: last_7d, last_14d, last_30d, last_90d",
    });
  }

  try {
    const insights = await getInsights(campaignId, datePreset);

    res.json({
      success: true,
      campaign_id: campaignId,
      date_preset: datePreset,
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

  const campaignId = parseMetaObjectId(req.body?.campaign_id);

  if (!campaignId) {
    return res.status(400).json({
      success: false,
      error: "campaign_id must contain 1 to 30 digits",
    });
  }

  try {
    const structure = await getCampaignStructure(campaignId);

    res.json({
      success: true,
      campaign_id: campaignId,
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

app.get("/tools/meta/proposal/dinner", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const dailyBudgetEur = parseProposalBudget(req.query.daily_budget_eur);
  const durationDays = parseProposalDuration(req.query.duration_days);
  const goal = parseProposalGoal(req.query.goal);

  if (dailyBudgetEur === null || durationDays === null || goal === null) {
    return res.status(400).json({
      success: false,
      error:
        "daily_budget_eur must be 3–20, duration_days must be 7–30, and goal must be dinner_visits or reservations",
    });
  }

  try {
    const [campaignCollection, insightCollection, adSetCollection] =
      await Promise.all([
        getCampaignCollection(),
        getCampaignInsights("last_30d"),
        getAdSetCollection(),
      ]);
    const metaOverview = buildMetaOverview(
      campaignCollection.data,
      insightCollection.data,
      adSetCollection.data
    );

    res.json(
      buildMetaDinnerProposal({
        metaOverview,
        dailyBudgetEur,
        durationDays,
        goal,
      })
    );
  } catch (error) {
    res.status(500).json({
      success: false,
      error: cleanMetaError(error),
    });
  }
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

  const campaignId = parseMetaObjectId(req.params.id);
  const datePreset = parseMetaDatePreset(req.query.date_preset);

  if (!campaignId) {
    return res.status(400).json({
      success: false,
      source: "meta_ads",
      error: "campaign id must contain 1 to 30 digits",
    });
  }

  if (!datePreset) {
    return res.status(400).json({
      success: false,
      source: "meta_ads",
      campaign_id: campaignId,
      error:
        "date_preset must be one of: last_7d, last_14d, last_30d, last_90d",
    });
  }

  try {
    const insights = await getInsights(campaignId, datePreset);

    res.json({
      success: true,
      source: "meta_ads",
      campaign_id: campaignId,
      date_preset: datePreset,
      status: insights.length ? "has_data" : "no_data",
      insights,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      source: "meta_ads",
      campaign_id: campaignId,
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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Not found",
    request_id: req.requestId,
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const isInvalidJson =
    error instanceof SyntaxError &&
    error.status === 400 &&
    Object.prototype.hasOwnProperty.call(error, "body");
  const status = error.type === "entity.too.large"
    ? 413
    : isInvalidJson
      ? 400
      : 500;

  console.error(
    JSON.stringify({
      event: "request_error",
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      status,
    })
  );

  res.status(status).json({
    success: false,
    error:
      status === 413
        ? "Request body too large"
        : status === 400
          ? "Invalid JSON body"
          : "Internal server error",
    request_id: req.requestId,
  });
});

app.listen(PORT, () => {
  console.log(`Parma Growth Operator running on port ${PORT}`);
});
