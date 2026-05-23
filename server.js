const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const PARMA_AGENT_API_KEY = process.env.PARMA_AGENT_API_KEY;

const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const metaClient = axios.create({
  baseURL: META_BASE_URL,
  timeout: 20000,
});

function requireApiKey(req, res, next) {
  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["X-Api-Key"] ||
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
  if (error.response?.data) {
    return error.response.data;
  }

  return {
    message: error.message || "Unknown Meta API error",
  };
}

async function getCampaigns() {
  const response = await metaClient.get(`/${META_AD_ACCOUNT_ID}/campaigns`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields: "id,name,status,effective_status,objective,created_time,updated_time",
      limit: 100,
    },
  });

  return response.data.data || [];
}

async function getCampaignById(campaignId) {
  const response = await metaClient.get(`/${campaignId}`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields: "id,name,status,effective_status,objective,created_time,updated_time,daily_budget,lifetime_budget,buying_type,special_ad_categories",
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

async function getAdSets(campaignId) {
  const response = await metaClient.get(`/${campaignId}/adsets`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields:
        "id,name,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time,targeting",
      limit: 100,
    },
  });

  return response.data.data || [];
}

async function getAdsForAdSet(adSetId) {
  const response = await metaClient.get(`/${adSetId}/ads`, {
    params: {
      access_token: META_ACCESS_TOKEN,
      fields:
        "id,name,status,effective_status,created_time,updated_time,ad_review_feedback,creative{id,name,object_story_spec,thumbnail_url}",
      limit: 100,
    },
  });

  return response.data.data || [];
}

async function getCampaignInsights(campaignId) {
  try {
    const response = await metaClient.get(`/${campaignId}/insights`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        fields:
          "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop",
        date_preset: "last_30d",
        level: "campaign",
        limit: 100,
      },
    });

    return response.data.data || [];
  } catch (error) {
    return {
      unavailable: true,
      error: cleanMetaError(error),
    };
  }
}

async function getAdSetInsights(adSetId) {
  try {
    const response = await metaClient.get(`/${adSetId}/insights`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        fields:
          "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop",
        date_preset: "last_30d",
        level: "adset",
        limit: 100,
      },
    });

    return response.data.data || [];
  } catch (error) {
    return {
      unavailable: true,
      error: cleanMetaError(error),
    };
  }
}

async function getAdInsights(adId) {
  try {
    const response = await metaClient.get(`/${adId}/insights`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        fields:
          "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop",
        date_preset: "last_30d",
        level: "ad",
        limit: 100,
      },
    });

    return response.data.data || [];
  } catch (error) {
    return {
      unavailable: true,
      error: cleanMetaError(error),
    };
  }
}

async function getCampaignStructure(campaignId) {
  const campaign = await getCampaignById(campaignId);
  const campaignInsights = await getCampaignInsights(campaignId);
  const adsets = await getAdSets(campaignId);

  const adsetsWithAds = [];

  for (const adset of adsets) {
    const adsetInsights = await getAdSetInsights(adset.id);
    const ads = await getAdsForAdSet(adset.id);

    const adsWithInsights = [];

    for (const ad of ads) {
      const adInsights = await getAdInsights(ad.id);
      adsWithInsights.push({
        ...ad,
        insights_last_30d: adInsights,
      });
    }

    adsetsWithAds.push({
      ...adset,
      insights_last_30d: adsetInsights,
      ads: adsWithInsights,
    });
  }

  return {
    campaign,
    insights_last_30d: campaignInsights,
    adsets: adsetsWithAds,
  };
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Parma Ads Agent",
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

    res.json({
      success: true,
      campaigns,
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

app.get("/meta/campaign/:id/structure", async (req, res) => {
  if (!checkMetaConfig(res)) return;

  const campaignId = req.params.id;

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

app.get("/tools/campaigns", requireApiKey, async (req, res) => {
  if (!checkMetaConfig(res)) return;

  try {
    const campaigns = await getCampaigns();

    res.json({
      success: true,
      campaigns,
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
    const exists = await campaignExists(campaign_id);

    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
        campaign_id,
      });
    }

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

app.get("/tools/test-ui", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Parma Ads Agent</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 900px;
      margin: 40px auto;
      padding: 20px;
      background: #f7f7f7;
    }
    h1 {
      color: #222;
    }
    button {
      padding: 8px 14px;
      margin: 4px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: white;
      font-weight: bold;
    }
    .load {
      background: #333;
    }
    .pause {
      background: #b00020;
    }
    .start {
      background: #1b7f3a;
    }
    .structure {
      background: #2357c6;
    }
    .campaign {
      background: white;
      border-radius: 10px;
      padding: 16px;
      margin: 16px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .status {
      font-weight: bold;
    }
    .message {
      margin-top: 20px;
      padding: 12px;
      border-radius: 8px;
      display: none;
      white-space: pre-wrap;
    }
    .success {
      background: #e3f7e9;
      color: #145c2e;
    }
    .error {
      background: #fde7e7;
      color: #8a1111;
    }
    pre {
      background: #111;
      color: #eee;
      padding: 14px;
      overflow-x: auto;
      border-radius: 8px;
      max-height: 500px;
    }
  </style>
</head>
<body>
  <h1>Parma Ads Agent</h1>

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

          div.innerHTML = \`
            <h3>\${campaign.name}</h3>
            <p>ID: \${campaign.id}</p>
            <p>Status: <span class="status">\${campaign.status} / \${campaign.effective_status}</span></p>
            <button class="pause" onclick="pauseCampaign('\${campaign.id}')">Pause</button>
            <button class="start" onclick="startCampaign('\${campaign.id}')">Start</button>
            <button class="structure" onclick="showStructure('\${campaign.id}')">Structure</button>
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

    async function showStructure(id) {
      showMessage("Loading campaign structure...", true);

      try {
        const response = await fetch("/meta/campaign/" + id + "/structure");
        const data = await response.json();

        const debug = document.getElementById("debug");
        debug.style.display = "block";
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
  console.log(`Parma Ads Agent running on port ${PORT}`);
});
app.get("/tools/campaign/:id/adsets", async (req, res) => {
  try {
    const { id } = req.params;

    const response = await metaClient.get(`/${id}/adsets`, {
      params: {
        access_token: META_ACCESS_TOKEN,
        fields: "id,name,status,effective_status,daily_budget,lifetime_budget,bid_strategy,optimization_goal"
      }
    });

    res.json({
      campaign_id: id,
      adsets: response.data.data
    });

  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});
