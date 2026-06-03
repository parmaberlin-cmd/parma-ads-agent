const express = require("express");
const path = require("path");
const axios = require("axios");

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

app.get("/meta/test", async (req, res) => {
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

app.get("/meta/campaigns", async (req, res) => {
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

app.get("/meta/campaign/:id/start", async (req, res) => {
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

app.get("/meta/campaign/:id/stop", async (req, res) => {
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

app.get("/meta/campaign/:id/structure", async (req, res) => {
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

app.post("/tools/campaign/start", requireApiKey, async (req, res) => {
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

app.post("/tools/campaign/pause", requireApiKey, async (req, res) => {
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

app.post("/tools/campaign/update-budget", requireApiKey, async (req, res) => {
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

app.get("/tools/test-ui", (req, res) => {
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

app.listen(PORT, () => {
console.log("Parma Growth Operator running on port " + PORT);
});
app.get("/tools/campaign/:id/metrics", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const campaignId = req.params.id;

  try {
    const response = await metaClient.get(`/${campaignId}/insights`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        date_preset: "maximum",
        fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type",
      },
    });

    res.json({
      success: true,
      campaign_id: campaignId,
      period: "last_30d",
      metrics: response.data.data || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      campaign_id: campaignId,
      error: cleanMetaError(error),
    });
  }
});
app.get("/auth/google", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: "Missing Google authorization code",
    });
  }

  try {
    const response = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    res.json({
      success: true,
      message: "Google OAuth connected",
      tokens: response.data,
      next_step: "Copy the refresh_token into Railway as GOOGLE_REFRESH_TOKEN",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});
app.get("/google/ads/test", async (req, res) => {
  try {
    res.json({
      success: true,
      google_ads: {
        developer_token_present: !!process.env.GOOGLE_DEVELOPER_TOKEN,
        client_id_present: !!process.env.GOOGLE_CLIENT_ID,
        client_secret_present: !!process.env.GOOGLE_CLIENT_SECRET,
        refresh_token_present: !!process.env.GOOGLE_REFRESH_TOKEN,
        redirect_uri_present: !!process.env.GOOGLE_REDIRECT_URI
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
const { GoogleAdsApi } = require("google-ads-api");

app.get("/google/accounts", async (req, res) => {
  try {
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
    });

    const customer = client.Customer({
      customer_id: "7376153998",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const result = await customer.query(`
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code
      FROM customer
    `);

    res.json({
      success: true,
      accounts: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null,
    });
  }
});
app.get("/google/accounts-direct", async (req, res) => {
  try {
    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });

    const accessToken = tokenResponse.data.access_token;
    const customerId = "7376153998";

    const response = await axios.post(
      `https://googleads.googleapis.com/v24/customers/${customerId}/googleAds:search`,
      {
        query: `
          SELECT
            customer.id,
            customer.descriptive_name,
            customer.currency_code
          FROM customer
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": process.env.GOOGLE_DEVELOPER_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      account: response.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});
app.get("/openapi.yaml", (req, res) => {
  res.sendFile(path.join(__dirname, "openapi.yaml"));
});
