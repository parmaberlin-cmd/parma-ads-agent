const { collectLiveShadowInput } = require("./live-shadow-data");
const { collectGa4ShadowData } = require("./ga4-shadow-data");
const { analyzeFunnel } = require("./funnel-analysis");

function buildFunnelInput(base, ga4) {
  const totals = ga4?.funnel?.totals || {};
  const googleCpc = ga4?.funnel?.google_cpc || {};
  const eventNames = ga4?.funnel?.event_names || ["reservation_page_view", "reservation_start", "booking_completed"];
  return {
    landingAvailable: ga4?.access_ok === true,
    adClicks: Number(base?.live_sources?.google?.totals?.clicks || 0),
    landingViews: Number(googleCpc.reservation_page_view || 0),
    reservationStarts: Number(googleCpc.reservation_start || 0),
    bookings: Number(googleCpc.booking_completed || ga4?.google_cpc_booking_completed || 0),
    totals,
    google_cpc: googleCpc,
    analysis: {
      all: analyzeFunnel({ counts: totals, eventNames, source: "all" }),
      google_cpc: analyzeFunnel({ counts: googleCpc, eventNames, source: "google_cpc" }),
    },
  };
}

async function collectFullLiveShadowInput({ env = process.env, days = 30, now = new Date() } = {}) {
  const [base, ga4] = await Promise.all([
    collectLiveShadowInput({ env, days, now }),
    collectGa4ShadowData({ env, days, now }),
  ]);

  return {
    ...base,
    funnel: ga4.access_ok ? buildFunnelInput(base, ga4) : { landingAvailable: false, analysis: null },
    conversions: {
      ...base.conversions,
      booking_completed: ga4.access_ok ? Number(ga4.google_cpc_booking_completed || 0) : null,
      ga4_total_booking_completed: ga4.access_ok ? Number(ga4.total_booking_completed || 0) : null,
      ga4_last_seen_at: ga4.access_ok ? ga4.last_seen_at : null,
    },
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

module.exports = { collectFullLiveShadowInput, buildFunnelInput };
