const { collectLiveShadowInput } = require("./live-shadow-data");
const { collectGa4ShadowData } = require("./ga4-shadow-data");

async function collectFullLiveShadowInput({ env = process.env, days = 30, now = new Date() } = {}) {
  const [base, ga4] = await Promise.all([
    collectLiveShadowInput({ env, days, now }),
    collectGa4ShadowData({ env, days, now }),
  ]);

  return {
    ...base,
    conversions: {
      ...base.conversions,
      booking_completed: ga4.access_ok ? Number(ga4.google_cpc_booking_completed || 0) : null,
      ga4_total_booking_completed: ga4.access_ok ? Number(ga4.total_booking_completed || 0) : null,
      ga4_last_seen_at: ga4.access_ok ? ga4.last_seen_at : null,
    },
    ga4_funnel: ga4.access_ok ? {
      reservation_funnel: ga4.reservation_funnel || null,
      funnel_access: ga4.funnel_access || null,
      funnel_diagnostics: ga4.funnel_diagnostics || null,
    } : null,
    access: {
      ...base.access,
      ga4_ok: ga4.access_ok,
    },
    live_sources: {
      ...base.live_sources,
      ga4,
    },
  };
}

module.exports = { collectFullLiveShadowInput };
