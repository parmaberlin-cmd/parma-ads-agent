function finiteValues(values = []) {
  return values.map(Number).filter(Number.isFinite);
}

function median(values = []) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mad(values = []) {
  const center = median(values);
  if (center == null) return null;
  return median(finiteValues(values).map((value) => Math.abs(value - center)));
}

function deriveMetrics(row = {}) {
  const spend = Number(row.spend ?? row.spend_eur ?? 0);
  const clicks = Number(row.clicks ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const bookings = Number(row.bookings ?? row.conversions ?? 0);
  return {
    spend,
    clicks,
    impressions,
    bookings,
    cpc: clicks > 0 ? spend / clicks : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    conversion_rate: clicks > 0 ? bookings / clicks : null,
    cost_per_booking: bookings > 0 ? spend / bookings : null,
  };
}

function buildRobustBaseline(rows = [], { minObservations = 7 } = {}) {
  const derived = rows.map(deriveMetrics);
  const metrics = ['spend', 'clicks', 'impressions', 'bookings', 'cpc', 'ctr', 'conversion_rate', 'cost_per_booking'];
  const baseline = {};
  for (const metric of metrics) {
    const values = derived.map((row) => row[metric]).filter((value) => value != null && Number.isFinite(value));
    baseline[metric] = {
      observations: values.length,
      ready: values.length >= minObservations,
      median: median(values),
      mad: mad(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  }
  return {
    ready: ['spend', 'clicks', 'bookings'].every((metric) => baseline[metric].ready),
    min_observations: minObservations,
    metrics: baseline,
    writes_allowed: false,
  };
}

function robustDeviation(value, metricBaseline = {}) {
  const current = Number(value);
  if (!Number.isFinite(current) || metricBaseline.ready !== true || metricBaseline.median == null) return null;
  const scale = Number(metricBaseline.mad);
  if (!Number.isFinite(scale) || scale === 0) return current === metricBaseline.median ? 0 : null;
  return 0.6745 * (current - metricBaseline.median) / scale;
}

function detectRobustAnomalies(currentRow = {}, baseline = {}, { zThreshold = 3.5 } = {}) {
  if (baseline.ready !== true) return { ready: false, anomalies: [], reason: 'baseline_not_ready', writes_allowed: false };
  const current = deriveMetrics(currentRow);
  const direction = {
    cpc: 'high_bad',
    cost_per_booking: 'high_bad',
    spend: 'high_contextual',
    ctr: 'low_bad',
    conversion_rate: 'low_bad',
    bookings: 'low_bad',
    clicks: 'low_bad',
  };
  const anomalies = [];
  for (const [metric, kind] of Object.entries(direction)) {
    const z = robustDeviation(current[metric], baseline.metrics?.[metric]);
    if (z == null) continue;
    const anomalous = kind.startsWith('high') ? z >= zThreshold : z <= -zThreshold;
    if (!anomalous) continue;
    if (metric === 'spend' && Number(current.bookings) > Number(baseline.metrics?.bookings?.median ?? 0)) continue;
    anomalies.push({ metric, robust_z: z, severity: Math.abs(z) >= zThreshold * 1.5 ? 'critical' : 'high', code: `ROBUST_${metric.toUpperCase()}_ANOMALY` });
  }
  return { ready: true, anomalies, writes_allowed: false };
}

module.exports = { finiteValues, median, mad, deriveMetrics, buildRobustBaseline, robustDeviation, detectRobustAnomalies };