const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.send("Parma Ads Agent online ✅");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Parma Ads Agent",
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
  }app.get("/meta/campaign/:id/stop", async (req, res) => {
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
});
});app.listen(PORT, () => {
  console.log(`Parma Ads Agent running on port ${PORT}`);
});
