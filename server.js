const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;
function pageToken() {
  return process.env.META_PAGE_ACCESS_TOKEN || process.env.META_PAGE_TOKEN || "";
}
function userToken() {
  return process.env.META_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
}
app.get("/", function (req, res) {
  res.send("Parma Ads Agent online");
});
app.get("/health", function (req, res) {
  res.status(200).send("OK");
});
app.get("/meta-test", async function (req, res) {
  try {
    const token = pageToken();
    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "META_PAGE_ACCESS_TOKEN missing"
      });
    }
    const response = await axios.get("https://graph.facebook.com/v25.0/me", {
      params: {
        access_token: token
      }
    });
    res.json({
      ok: true,
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.response ? error.response.data : error.message
    });
  }
});
app.get("/insights", async function (req, res) {
  try {
    const token = userToken();
    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "META_USER_ACCESS_TOKEN missing"
      });
    }
    const account = req.query.account || process.env.META_AD_ACCOUNT_ID;
    if (!account) {
      return res.status(400).json({
        ok: false,
        error: "Missing ad account id"
      });
    }
    const response = await axios.get(
      "https://graph.facebook.com/v25.0/" + account + "/insights",
      {
        params: {
          access_token: token,
          fields: "campaign_name,adset_name,ad_name,impressions,clicks,spend,reach,cpc,cpm,ctr",
          date_preset: req.query.date_preset || "last_7d",
          level: req.query.level || "campaign"
        }
      }
    );
    res.json({
      ok: true,
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.response ? error.response.data : error.message
    });
  }
});
app.listen(PORT, function () {
  console.log("Parma Ads Agent running on port " + PORT);
});
