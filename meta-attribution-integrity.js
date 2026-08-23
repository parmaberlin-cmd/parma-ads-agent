function n(value){const x=Number(value);return Number.isFinite(x)?x:0;}

function assessMetaAttributionIntegrity({metaLandingPageViews=null,metaLinkClicks=null,ga4MetaSessions=null,ga4MetaBookings=null,minClicks=10,maxSessionLossRatio=0.5}={}){
  const clicks=metaLinkClicks===null?null:n(metaLinkClicks);
  const landing=metaLandingPageViews===null?null:n(metaLandingPageViews);
  const sessions=ga4MetaSessions===null?null:n(ga4MetaSessions);
  const bookings=ga4MetaBookings===null?null:n(ga4MetaBookings);
  const issues=[];

  if(clicks===null)issues.push("meta_click_signal_missing");
  if(sessions===null)issues.push("ga4_meta_session_signal_missing");
  if(bookings===null)issues.push("ga4_meta_booking_signal_missing");

  let sessionLossRatio=null;
  if(clicks!==null&&sessions!==null&&clicks>=minClicks){
    sessionLossRatio=Math.max(0,(clicks-sessions)/Math.max(clicks,1));
    if(sessionLossRatio>maxSessionLossRatio)issues.push("meta_clicks_ga4_sessions_disagree");
  }

  if(landing!==null&&clicks!==null&&landing>clicks*1.2)issues.push("meta_landing_views_exceed_clicks_unexpectedly");

  const status=issues.length===0?"healthy":issues.some(x=>x.endsWith("missing"))?"unverified":"degraded";
  return {
    status,
    optimization_allowed:status==="healthy"&&clicks!==null&&clicks>=minClicks,
    metrics:{meta_link_clicks:clicks,meta_landing_page_views:landing,ga4_meta_sessions:sessions,ga4_meta_bookings:bookings,session_loss_ratio:sessionLossRatio},
    issues,
  };
}

module.exports={assessMetaAttributionIntegrity};
