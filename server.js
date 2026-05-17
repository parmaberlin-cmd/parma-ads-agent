const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ Parma Ads Agent online");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/meta-test", async (req, res) => {
  try {
    const token =
      process.env.META_PAGE_ACCESS_TOKEN ||
      process.env["META-PAGE-ACCESS-TOKEN"];

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "META_PAGE_ACCESS_TOKEN missing",
      });
    }

    const response = await axios.get("https://graph.facebook.com/v25.0/me", {
      params: {
        access_token: token,
      },
    });

    res.json({
      ok: true,
      meta_response: response.data,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.response?.data || error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
