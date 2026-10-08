const express = require("express");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");
const { apiKeysMatch } = require("./api-key-auth");
const { GoogleAdsApi } = require("google-ads-api");
const { readCampaign: readLunchCampaign } = require("./google-ads-lunch-campaign");
const {
  installGoogleCampaignIntelligenceRoute,
} = require("./google-campaign-intelligence-route");
const { installPersonalOsHandoffRoute } = require("./personal-os-handoff-route");
const { installPersonalOsStep3Routes } = require("./personal-os-step3-route");
const { installStep7ReadGateway } = require("./personal-os-step7-read-gateway");
const {
  DEFAULT_GOOGLE_TIMEZONE,
  getGoogleDateRange,
  parseGoogleReadMode,
} = require("./google-time-utils");
const { buildGoogleReadiness, buildMetaOverview } = require("./reporting");
const { buildMetaDinnerProposal } = require("./proposals");
const { auditInstagramContentCapability, auditInstagramLoginCapability } = require("./instagram-content-publishing");
const { discoverStories } = require("./instagram-story-capability");
const { registerInstagramMediaHost } = require("./instagram-media-host");
const { startInstagramEditorialRuntime } = require("./instagram-editorial-runtime");
const { scheduleApprovedPublishingPackage } = require("./instagram-package-ingress");
const {
  APPROVAL_TOKEN: META_PAUSED_DRAFT_APPROVAL_TOKEN,
  ONE_SHOT_TRIGGER: META_PAUSED_DRAFT_ONE_SHOT_TRIGGER,
  PartialMetaDraftError,
  buildPausedReservationDraft,
  createPausedReservationDraft,
  discoverInstagramReelAssets,
  shouldRunPausedDraftOneShot,
} = require("./meta-paused-draft");

const app = express();
// Fail-closed, opt-in connector. Does not change Google/Meta credentials or write guards.
require('./mcp-server').installMcp(app);
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
let instagramEditorialRuntime = null;

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
let META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PARMA_AGENT_API_KEY = process.env.PARMA_AGENT_API_KEY;
const META_PAUSED_DRAFT_WRITES_ENABLED =
  process.env.META_PAUSED_DRAFT_WRITES_ENABLED === "true";
const META_PAUSED_DRAFT_ONE_SHOT = process.env.META_PAUSED_DRAFT_ONE_SHOT;
const META_PAUSED_DRAFT_ONE_SHOT_STARTS_AT =
  process.env.META_PAUSED_DRAFT_ONE_SHOT_STARTS_AT;
const META_AD_DSA_BENEFICIARY = process.env.META_AD_DSA_BENEFICIARY;
const META_AD_DSA_PAYOR = process.env.META_AD_DSA_PAYOR;

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

const instagramLoginReadTransport = {
  async get(endpoint, params = {}) {
    const response = await axios.get(`https://graph.instagram.com/${META_API_VERSION}${endpoint}`, {
      timeout: 20000,
      params: { ...params, access_token: META_ACCESS_TOKEN },
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

  if (!apiKeysMatch(apiKey, PARMA_AGENT_API_KEY)) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  next();
}

installPersonalOsHandoffRoute({ app, requireApiKey });
installPersonalOsStep3Routes({ app, requireApiKey });

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

app.get("/health/instagram-content-capability", async (req, res) => {
  if (!META_ACCESS_TOKEN) {
    return res.status(503).json({ success:false, status:"BLOCKED", blocker:"instagram_access_token_missing", contains_secret:false });
  }
  try {
    let audit = await auditInstagramContentCapability({
      transport: metaReadTransport,
      adAccountId: META_AD_ACCOUNT_ID || null,
      username: "parma.divinibenedetti",
    });
    if (!audit.checks.permissions_readable && !audit.capabilities.read_account) {
      audit = await auditInstagramLoginCapability({ transport:instagramLoginReadTransport, username:"parma.divinibenedetti" });
    } else {
      audit = { ...audit, login_type:"facebook_login" };
    }
    const verified = audit.capabilities.read_account;
    return res.status(verified ? 200 : 503).json({ success:verified, status:verified?"VERIFIED_LIVE":"BLOCKED", ...audit });
  } catch (error) {
    return res.status(503).json({
      success:false,
      status:"BLOCKED",
      blocker:"instagram_capability_audit_failed",
      graph_code:error?.response?.data?.error?.code||null,
      graph_subcode:error?.response?.data?.error?.error_subcode||null,
      contains_secret:false,
    });
  }
});

app.get("/health/instagram-current-stories", async (req, res) => {
  if (!META_ACCESS_TOKEN) {
    return res.status(503).json({ success:false, status:"BLOCKED", blocker:"instagram_access_token_missing", contains_secret:false });
  }
  try {
    const result = await discoverStories({ transport: instagramLoginReadTransport });
    const stories = result.stories.map(story => ({
      id: story.id,
      media_type: story.media_type,
      timestamp: story.timestamp,
    }));
    return res.status(200).json({
      success:true,
      status:result.status,
      account:result.account,
      stories_count:result.stories_count,
      stories,
      historical_depth:result.historical_depth,
      writes_executed:0,
      contains_secret:false,
    });
  } catch (error) {
    return res.status(503).json({
      success:false,
      status:"BLOCKED",
      blocker:"instagram_current_stories_read_failed",
      graph_code:error?.response?.data?.error?.code||null,
      graph_subcode:error?.response?.data?.error?.error_subcode||null,
      writes_executed:0,
      contains_secret:false,
    });
  }
});

function sanitizeMetaDiagnosticText(value) {
  if (typeof value !== "string") return null;
  return value
    .replace(/\bact_\d+\b/gi, "act_[REDACTED]")
    .replace(/\bEA[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b\d{8,}\b/g, "[REDACTED_ID]")
    .slice(0, 500);
}

function cleanMetaError(error) {
  const metaError = error?.response?.data?.error;

  return {
    message:
      sanitizeMetaDiagnosticText(metaError?.message) ||
      sanitizeMetaDiagnosticText(error?.message) ||
      "Meta Ads request failed",
    type: metaError?.type || null,
    code: metaError?.code || null,
    subcode: metaError?.error_subcode || null,
    user_title: sanitizeMetaDiagnosticText(metaError?.error_user_title),
    user_message: sanitizeMetaDiagnosticText(metaError?.error_user_msg),
  };
}

function createMetaConflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
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
  return Number.isInteger(days) && days >= 0 && days <= 90 ? days : null;
}

function googleTimezone() {
  return process.env.GOOGLE_ACCOUNT_TIMEZONE || DEFAULT_GOOGLE_TIMEZONE;
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

installStep7ReadGateway({ app, getGoogleCustomer, getGoogleDateRange, googleTimezone });

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

async function getGoogleCampaignMetrics(campaignId, days, readMode = "historical") {
  const customer = getGoogleCustomer();
  const { start, end } = getGoogleDateRange({ days, readMode, timezone: googleTimezone() });

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
