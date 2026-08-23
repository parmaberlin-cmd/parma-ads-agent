const { classifyMetaError, validateDraft } = require("./meta-draft-validation");

function redact(value, key = "") {
  if (/token|secret|password/i.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, redact(v,k)]));
  }
  return value;
}

function stagePayloads(accountId, draft, ids = {}) {
  return {
    campaign: { endpoint:`/${accountId}/campaigns`, payload:draft.campaign },
    adset: { endpoint:`/${accountId}/adsets`, payload:{...draft.adSet,campaign_id:ids.campaign_id||"<campaign_id>"} },
    creative: { endpoint:`/${accountId}/adcreatives`, payload:draft.creative },
    ad: { endpoint:`/${accountId}/ads`, payload:{...draft.ad,adset_id:ids.adset_id||"<adset_id>",creative:{creative_id:ids.creative_id||"<creative_id>"}} },
  };
}

function diagnoseStageFailure({ error, draft, accountId }) {
  const stage = ["campaign","adset","creative","ad","verification"].includes(error?.stage) ? error.stage : "unknown";
  const payloads = stagePayloads(accountId,draft,error?.created||{});
  return {
    stage,
    meta_error: classifyMetaError(error),
    draft_shape: validateDraft(draft),
    created: Object.keys(error?.created||{}),
    reused: Object.keys(error?.reused||{}).filter((k)=>error.reused[k]),
    failing_request: payloads[stage] ? redact(payloads[stage]) : null,
    credentials_exposed:false,
  };
}

module.exports={redact,stagePayloads,diagnoseStageFailure};
