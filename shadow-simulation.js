const { buildDailyShadowReport } = require("./daily-shadow-report");
const { compareWindows, detectTrendSignals } = require("./shadow-trends");
const { assessExternalAccessReadiness } = require("./access-readiness");

function runShadowSimulation({snapshot={},windows={},access={}}={}){
  const report=buildDailyShadowReport(snapshot);
  const trends=compareWindows(windows);
  const trendSignals=detectTrendSignals(trends);
  const readiness=assessExternalAccessReadiness(access);

  const priorities=[
    ...report.top_priorities,
    ...trendSignals.map(signal=>({channel:"cross_channel",action:"investigate_trend",priority:signal.severity,reason:signal.code,mode:"shadow",executable:false,requires_human_approval:true})),
  ];

  return {
    mode:"shadow",
    writes_allowed:false,
    spend_changed:false,
    report,
    trends,
    trend_signals:trendSignals,
    readiness,
    priorities:priorities.slice(0,5),
    live_validation_blocked:!readiness.external_validation_complete,
  };
}

module.exports={runShadowSimulation};
