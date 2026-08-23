const KNOWN_INVALID_PARAMETER_SUBCODES = new Set([1870227, 3858081, 4834011]);

function validateDraft(draft) {
  const problems = [];
  if (draft?.campaign?.status !== "PAUSED") problems.push("campaign_status");
  if (draft?.adSet?.status !== "PAUSED") problems.push("adset_status");
  if (draft?.ad?.status !== "PAUSED") problems.push("ad_status");
  if (draft?.policy?.may_activate !== false) problems.push("activation_policy");
  if (!draft?.creative?.object_id) problems.push("page_id");
  if (!draft?.creative?.instagram_user_id) problems.push("instagram_user_id");
  if (!draft?.creative?.source_instagram_media_id) problems.push("instagram_media_id");
  if (!draft?.adSet?.targeting?.publisher_platforms?.includes("instagram")) problems.push("instagram_targeting");
  return { valid: problems.length === 0, problems };
}

function classifyMetaError(error) {
  const graph = error?.response?.data?.error || error?.cause?.response?.data?.error || error?.cause || error || {};
  const code = graph.code == null ? null : Number(graph.code);
  const subcode = graph.error_subcode == null ? null : Number(graph.error_subcode);
  return {
    type: graph.type || null,
    code,
    subcode,
    invalid_parameter: code === 100 || KNOWN_INVALID_PARAMETER_SUBCODES.has(subcode),
    message: String(graph.message || error?.message || "meta_error").slice(0, 200),
  };
}

function buildRecoveryPlan(partial = {}) {
  const created = partial.created || {};
  return {
    reuse_campaign: Boolean(created.campaign_id),
    reuse_adset: Boolean(created.adset_id),
    reuse_creative: Boolean(created.creative_id),
    completed: Boolean(created.ad_id),
    resume_from: created.ad_id ? "verification" : created.creative_id ? "ad" : created.adset_id ? "creative" : created.campaign_id ? "adset" : "campaign",
  };
}

module.exports = { validateDraft, classifyMetaError, buildRecoveryPlan, KNOWN_INVALID_PARAMETER_SUBCODES };
