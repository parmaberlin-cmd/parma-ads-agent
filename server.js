https://graph.facebook.com/v25.0/act_${process.env.META_AD_ACCOUNT_ID}https://graph.facebook.com/v25.0/act_${process.env.META_AD_ACCOUNT_ID}/campaignsconst express = require("express");
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

app.get("/tools/test", async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${process.env.META_AD_ACCOUNT_ID}`,
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

app.get("/tools/campaigns", requireApiKey, async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${process.env.META_AD_ACCOUNT_ID}/campaigns`,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields:
            "id,name,status,effective_status,objective,created_time,updated_time"
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

app.post("/tools/pause", requireApiKey, async (req, res) => {
  try {
    const { campaignId } = req.body;

    await axios.post(
      `https://graph.facebook.com/v25.0/${campaignId}`,
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
      message: "Campaign paused"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.post("/tools/start", requireApiKey, async (req, res) => {
  try {
    const { campaignId } = req.body;

    await axios.post(
      `https://graph.facebook.com/v25.0/${campaignId}`,
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
      message: "Campaign started"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

app.get("/tools/test-ui", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Parma Ads Agent</title>
<style>
body {
  font-family: Arial;
  padding: 20px;
}
button {
  margin-left: 10px;
}
</style>
</head>
<body>
<h1>Parma Ads Agent</h1>
<div id="campaigns"></div>

<script>
const API_KEY = "${process.env.PARMA_AGENT_API_KEY}";

async function loadCampaigns() {
  const res = await fetch('/tools/campaigns', {
    headers: {
      'x-api-key': API_KEY
    }
  });

  const data = await res.json();
  const container = document.getElementById('campaigns');
  container.innerHTML = '';

  data.campaigns.forEach(c => {
    const row = document.createElement('div');
    row.style.marginBottom = '12px';

    row.innerHTML = \`
      <strong>\${c.name}</strong>
      (\${c.status})
      <button onclick="pauseCampaign('\${c.id}')">Pause</button>
      <button onclick="startCampaign('\${c.id}')">Start</button>
    \`;

    container.appendChild(row);
  });
}

async function pauseCampaign(id) {
  await fetch('/tools/pause', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({ campaignId: id })
  });

  loadCampaigns();
}

async function startCampaign(id) {
  await fetch('/tools/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({ campaignId: id })
  });

  loadCampaigns();
}

loadCampaigns();
</script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
