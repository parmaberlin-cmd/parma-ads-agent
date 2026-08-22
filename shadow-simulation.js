const { buildDailyShadowReport } = require("./daily-shadow-report");
const { compareWindows, detectTrendSignals } = require("./shadow-trends");
const { assessExternalAccessReadiness } = require("./access-readiness");
const { assessMetaAttributionIntegrity } = require("./meta-attribution-integrity");

function runShadowSimulation({snapshot={},windows={},access={},metaAttribution={}}={}){
  const report=buildDailyShadowReport(snapshot);
  const trends=compareWindows(windows);
  const trendSignals=detectTrendSignals(trends);
  const readiness=assessExternalAccessReadiness(access);
  const metaIntegrity=assessMetaAttributionIntegrity(metaAttribution);

  const allPriorities=[
    ...report.top_priorities,
    ...trendSignals.map(signal=>({channel:"cross_channel",action:"investigate_trend",priority:signal.severity,reason:signal.code,mode:"shadow",executable:false,requires_human_approval:true})),
    ...(metaIntegrity.status==="healthy"?[]:[{channel:"meta",action:"investigate_attribution",priority:"high",reason:`meta_attribution_${metaIntegrity.status}`,mode:"shadow",executable:false,requires_human_approval:true}]),
  ];

  return {
    mode:"shadow",
    writes_allowed:false,
    spend_changed:false,
    report,
    trends,
    trend_signals:trendSignals,
    meta_attribution_integrity:metaIntegrity,
    readiness,
    priorities:allPriorities.slice(0,5),
    all_priorities:allPriorities,
    live_validation_blocked:!readiness.external_validation_complete,
  };
}

module.exports={runShadowSimulation};
