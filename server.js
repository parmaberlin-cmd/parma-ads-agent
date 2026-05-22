const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
function requireApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== process.env.PARMA_AGENT_API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized"
    });
  }

  next();
}
app.use(express.json());

const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("Parma Ads Agent online ✅");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "PARMA TEST NEW",
    time: new Date()
  });
});

app.get("/meta/test", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const adAccount = process.env.META_AD_ACCOUNT_ID;

    if (!token || !adAccount) {
      return res.status(500).json({
        error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID missing"
      });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v22.0/act_${adAccount}`,
      {
        params: {
          access_token: token,
          fields: "id,name,account_status,amount_spent"
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});
app.get("/meta/campaigns", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const adAccount = process.env.META_AD_ACCOUNT_ID;

    if (!token || !adAccount) {
      return res.status(500).json({
        error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID missing"
      });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v22.0/act_${adAccount}/campaigns`,
      {
        params: {
          access_token: token,
          fields: "id,name,status"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});
app.get("/meta/campaign/:id/start", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const campaignId = req.params.id;

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${campaignId}`,
      null,
      {
        params: {
          access_token: token,
          status: "ACTIVE"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

app.get("/meta/campaign/:id/stop", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const campaignId = req.params.id;

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${campaignId}`,
      null,
      {
        params: {
          access_token: token,
          status: "PAUSED"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});app.get("/meta/insights", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    const response = await axios.get(
      `https://graph.facebook.com/v22.0/act_${adAccountId}/campaigns`,
      {
        params: {
          access_token: token,
          fields:
            "name,status,insights{spend,impressions,reach,clicks,ctr,cpc,cpm,frequency}"
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});app.get("/tools/campaigns", requireApiKey, async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    const response = await axios.get(
      `https://graph.facebook.com/v22.0/act_${adAccountId}/campaigns`,
      {
        params: {
          access_token: token,
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
    const token = process.env.META_ACCESS_TOKEN;
    const campaignId = req.body.campaign_id;

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${campaignId}`,
      null,
      {
        params: {
          access_token: token,
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
    const token = process.env.META_ACCESS_TOKEN;
    const campaignId = req.body.campaign_id;

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${campaignId}`,
      null,
      {
        params: {
          access_token: token,
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
});app.get("/tools/test-ui", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Parma Ads Agent</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 40px auto;
          padding: 20px;
        }
        button {
          padding: 12px 20px;
          margin: 10px;
          font-size: 16px;
          cursor: pointer;
        }
        input {
          width: 100%;
          padding: 10px;
          font-size: 16px;
          margin-bottom: 20px;
        }
        pre {
          background: #f5f5f5;
          padding: 20px;
          overflow: auto;
        }
      </style>
    </head>
    <body>
      <h1>Parma Ads Agent</h1>

      <input id="campaignId" value="6262623468181" />

      <button onclick="pauseCampaign()">Pause Campaign</button>
      <button onclick="startCampaign()">Start Campaign</button>
      <button onclick="loadCampaigns()">Load Campaigns</button>

      <pre id="output">Ready.</pre>

      <script>
        async function pauseCampaign() {
          const campaignId = document.getElementById('campaignId').value;

          const res = await fetch('/tools/campaign/pause', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: campaignId })
          });

          const data = await res.json();
          document.getElementById('output').textContent =
            JSON.stringify(data, null, 2);
        }

        async function startCampaign() {
          const campaignId = document.getElementById('campaignId').value;

          const res = await fetch('/tools/campaign/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: campaignId })
          });

          const data = await res.json();
          document.getElementById('output').textContent =
            JSON.stringify(data, null, 2);
        }

        async function loadCampaigns() {
          const res = await fetch('/tools/campaigns');
          const data = await res.json();

          document.getElementById('output').textContent =
            JSON.stringify(data, null, 2);
        }
      </script>
    </body>
    </html>
  `);
});
app.listen(PORT, () => {
  console.log(`Parma Ads Agent running on port ${PORT}`);
});
