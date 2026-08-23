const { META_API_VERSION } = require("../meta-paused-draft-next");
const { assertPublicPayloadSafe } = require("../public-output-safety");

const token = process.env.META_ACCESS_TOKEN;
const rawAccount = String(process.env.META_AD_ACCOUNT_ID || "");
const account = rawAccount.startsWith("act_") ? rawAccount : `act_${rawAccount}`;
const candidateVersion = String(process.env.META_API_VERSION || META_API_VERSION);
const version = /^v\d+\.0$/.test(candidateVersion) ? candidateVersion : META_API_VERSION;
const createdSince = Date.parse("2026-08-20T00:00:00Z");

function clean(value, max = 120) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").slice(0, max);
}

async function getCollection(path, fields) {
  let url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  const items = [];

  while (url) {
    const response = await fetch(url, { method: "GET" });
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(clean(body?.error?.message || `meta_http_${response.status}`, 180));
    }
    items.push(...(body.data || []));
    url = body.paging?.next ? new URL(body.paging.next) : null;
  }
  return items;
}

function isActive(item) {
  return item?.status === "ACTIVE" || item?.effective_status === "ACTIVE";
}

(async () => {
  if (!token || !rawAccount) throw new Error("meta_configuration_incomplete");

  const [campaigns, adsets, ads] = await Promise.all([
    getCollection(`${account}/campaigns`, "id,name,status,effective_status,created_time"),
    getCollection(`${account}/adsets`, "id,campaign_id,status,effective_status"),
    getCollection(`${account}/ads`, "campaign_id,adset_id,status,effective_status"),
  ]);

  const candidates = campaigns.filter((campaign) =>
    campaign.status === "PAUSED" && Date.parse(campaign.created_time || 0) >= createdSince
  );

  const summaries = candidates.map((campaign) => {
    const childAdsets = adsets.filter((adset) => String(adset.campaign_id) === String(campaign.id));
    const childAds = ads.filter((ad) => String(ad.campaign_id) === String(campaign.id));
    return {
      name: clean(campaign.name),
      configured_status: clean(campaign.status, 40),
      effective_status: clean(campaign.effective_status, 40),
      child_adsets: childAdsets.length,
      child_ads: childAds.length,
      any_active_child: childAdsets.some(isActive) || childAds.some(isActive),
    };
  });

  const payload = assertPublicPayloadSafe({
    access_ok: true,
    candidate_count: summaries.length,
    any_active_objects: summaries.some((item) => item.any_active_child),
    candidates: summaries,
    writes_allowed: false,
  });

  console.log(JSON.stringify(payload, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({
    access_ok: false,
    error: clean(error?.message || "meta_inventory_failed", 180),
    writes_allowed: false,
  }));
  process.exitCode = 1;
});
