const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const pageToken = () => process.env.META_PAGE_ACCESS_TOKEN || process.env["META-PAGE-ACCESS-TOKEN"];
const userToken = () => process.env.META_USER_ACCESS_TOKEN;

app.get("/", (req, res) => {
  res.send("✅ Parma Ads Agent online");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/meta-test", async (req, res) => {
  try {
    const token = pageToken();
    if (!token) return res.status(500).json({ ok: false, error: "META_PAGE_ACCESS_TOKEN missing" });

    const response = await axios.get("https://graph.facebook.com/v25.0/me", {
      params: { access_token: token },
    });

    res.json({ ok: true, meta_response: response.data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.response?.data || error.message });
  }
});

app.get("/adaccounts", async (req, res) => {
  try {
    const token = userToken();
    if (!token) return res.status(500).json({ ok: false, error: "META_USER_ACCESS_TOKEN missing" });

    const response = await axios.get("https://graph.facebook.com/v25.0/me/adaccounts", {
      params: {
        access_token: token,
        fields: "id,name,account_status,currency,timezone_name",
      },
    });

    res.json({ ok: true, adaccounts: response.data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.response?.data || error.message });
  }
});
app.get("/campaigns", async (req, res) => {
  try {
    const token = userToken();
    const account = req.query.account;

    if (!token) return res.status(500).json({ ok: false, error: "META_USER_ACCESS_TOKEN missing" });
    if (!account) return res.status(400).json({ ok: false, error: "account missing" });

    const response = await axios.get(`https://graph.facebook.com/v25.0/${account}/campaigns`, {
      params: {
        access_token: token,
        fields: "id,name,status,effective_status,objective,created_time,updated_time",
      },
    });

    res.json({ ok: true, campaigns: response.data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.response?.data || error.message });
  }
});
app.get("/insights", async (req, res) => {
  try {
    const token = userToken();
    const account = req.query.account;
    const since = req.query.since || "2024-01-01";
    const until = req.query.until || "today";

    if (!token) return res.status(500).json({ ok: false, error: "META_USER_ACCESS_TOKEN missing" });
    if (!account) return res.status(400).json({ ok: false, error: "account missing" });

    const response = await axios.get(⁠`https://graph.facebook.com/v25.0/${account}/insights ⁠, {
      params: {
        access_token: token,
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,cpc,cpm,ctr,actions",
        time_range: JSON.stringify({ since, until }),
      },
    });

    res.json({ ok: true, insights: response.data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.response?.data || error.message });
  }
});app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
