const { collectFullLiveShadowInput } = require('../full-live-shadow-data');
const { buildDailyOperationalSummary } = require('../shadow-operations');

(async () => {
  const snapshot = await collectFullLiveShadowInput({ days: Number(process.env.SHADOW_REPORT_DAYS || 30) });
  const summary = buildDailyOperationalSummary({ snapshot, shadowReport: { anomalies: [] }, lastRunAt: snapshot.now });
  const safe = {
    generated_at: summary.generated_at,
    mode: 'shadow',
    status: summary.status,
    confidence: summary.confidence,
    channel_ready: summary.channel_ready,
    blockers: summary.blockers,
    alert_codes: summary.alerts.map((alert) => ({ severity: alert.severity, code: alert.code, source: alert.source })),
    source_access: {
      google: snapshot.access?.google_ok === true,
      ga4: snapshot.access?.ga4_ok === true,
      meta: snapshot.access?.meta_ok === true,
    },
    writes_allowed: false,
    execution_allowed: false,
  };
  process.stdout.write(`${JSON.stringify(safe)}\n`);
})().catch((error) => {
  const message = String(error?.message || 'shadow_health_failed').replace(/\b\d{8,}\b/g, '[REDACTED_ID]').slice(0, 180);
  process.stderr.write(`${JSON.stringify({ success: false, mode: 'shadow', writes_allowed: false, execution_allowed: false, error: message })}\n`);
  process.exitCode = 1;
});