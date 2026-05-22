const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const GRAPH_VERSION = "v22.0";

function getAdAccountPath() {
  const raw = process.env.META_AD_ACCOUNT_ID || "";
  const clean = raw.replace(/^act_/, "");
  return `act_${clean}`;
}

function requireApiKey(req, res, next) {
  const expected = process.env.PARMA_AGENT_API_KEY;
  const received = req.headers["x-api-key"];

  if (!expected) {
    return res.status(500).json({
      success: false,
      error: "PARMA_AGENT_API_KEY missing on server"
    });
  }

  if (!received || received !== expected) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

  next();
}

app.get("/", (req, res) => {
  res.send("Parma Ads Agent online ✅");
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok"
  });
});

app.get("/meta/test", async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_VERSION}/${getAdAccountPath()}`,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: "id,name,account_status,amount_spent"
        }
      }
    );

    res.json({
      success: true,
      account: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get("/meta/campaigns", async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_VERSION}/${getAdAccountPath()}/campaigns`,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: "id,name,status,effective_status,objective,created_time,updated_time"
        }
      }
    );

    res.json({
      success: true,
      campaigns: response.data.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get("/meta/campaign/:id/start", async (req, res) => {
  try {
    const campaignId = req.params.id;

    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}`,
      null,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          status: "ACTIVE"
        }
      }
    );

    res.json({
      success: true,
      action: "start_campaign",
      campaign_id: campaignId,
      meta_response: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get("/meta/campaign/:id/stop", async (req, res) => {
  try {
    const campaignId = req.params.id;

    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}`,
      null,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          status: "PAUSED"
        }
      }
    );

    res.json({
      success: true,
      action: "pause_campaign",
      campaign_id: campaignId,
      meta_response: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get("/tools/campaigns", requireApiKey, async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${GRAPH_VERSION}/${getAdAccountPath()}/campaigns`,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: "id,name,status,effective_status,objective,created_time,updated_time"
        }
      }
    );

    res.json({
      success: true,
      campaigns: response.data.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.post("/tools/campaign/pause", requireApiKey, async (req, res) => {
  try {
    const campaignId = req.body.campaign_id || req.body.campaignId;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: "Missing campaign_id"
      });
    }

    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}`,
      null,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          status: "PAUSED"
        }
      }
    );

    res.json({
      success: true,
      action: "pause_campaign",
      campaign_id: campaignId,
      meta_response: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.post("/tools/campaign/start", requireApiKey, async (req, res) => {
  try {
    const campaignId = req.body.campaign_id || req.body.campaignId;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: "Missing campaign_id"
      });
    }

    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}`,
      null,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          status: "ACTIVE"
        }
      }
    );

    res.json({
      success: true,
      action: "start_campaign",
      campaign_id: campaignId,
      meta_response: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get("/tools/test-ui", (req, res) => {
  const apiKey = process.env.PARMA_AGENT_API_KEY || "";

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Parma Ads Agent</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; }
    h1 { margin-bottom: 20px; }
    .campaign { border: 1px solid #ddd; padding: 14px; margin-bottom: 12px; border-radius: 8px; }
    button { padding: 8px 14px; margin-right: 8px; cursor: pointer; }
    pre { background: #f5f5f5; padding: 16px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Parma Ads Agent</h1>
  <button onclick="loadCampaigns()">Load Campaigns</button>
  <div id="campaigns" style="margin-top:20px;"></div>
  <pre id="output">Ready.</pre>

<script>
const API_KEY = ${JSON.stringify(apiKey)};

async function apiFetch(url, options = {}) {
  options.headers = Object.assign({}, options.headers || {}, {
    "x-api-key": API_KEY
  });

  const res = await fetch(url, options);
  return await res.json();
}

async function loadCampaigns() {
  const data = await apiFetch("/tools/campaigns");
  document.getElementById("output").textContent = JSON.stringify(data, null, 2);

  const container = document.getElementById("campaigns");
  container.innerHTML = "";

  if (!data.success || !data.campaigns) {
    container.innerHTML = "<p>Could not load campaigns.</p>";
    return;
  }

  data.campaigns.forEach(function(c) {
    const div = document.createElement("div");
    div.className = "campaign";
    div.innerHTML =
      "<strong>" + c.name + "</strong><br>" +
      "ID: " + c.id + "<br>" +
      "Status: " + c.status + " / " + c.effective_status + "<br><br>" +
      "<button onclick=\\"pauseCampaign('" + c.id + "')\\">Pause</button>" +
      "<button onclick=\\"startCampaign('" + c.id + "')\\">Start</button>";

    container.appendChild(div);
  });
}

async function pauseCampaign(id) {
  const data = await apiFetch("/tools/campaign/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: id })
  });

  document.getElementById("output").textContent = JSON.stringify(data, null, 2);
  await loadCampaigns();
}

async function startCampaign(id) {
  const data = await apiFetch("/tools/campaign/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_id: id })
  });

  document.getElementById("output").textContent = JSON.stringify(data, null, 2);
  await loadCampaigns();
}

loadCampaigns();
</script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log("Parma Ads Agent running on port " + PORT);
});
