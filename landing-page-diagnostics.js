function n(value){const x=Number(value);return Number.isFinite(x)?x:0;}

function diagnoseLanding({adClicks=0,landingViews=0,bookingStarts=null,bookings=0,lcpMs=null,inpMs=null,cls=null}={}){
  const clicks=n(adClicks),views=n(landingViews),done=n(bookings);
  const starts=bookingStarts===null?null:n(bookingStarts);
  const issues=[];
  if(clicks>=10&&views/clicks<0.7)issues.push({code:"LANDING_VIEW_LOSS",severity:"high",reason:"Too many ad clicks fail to become reservation-page views."});
  if(starts!==null&&views>=10&&starts/views<0.1)issues.push({code:"BOOKING_START_RATE_LOW",severity:"medium",reason:"Reservation-page traffic rarely begins the booking flow."});
  if(starts!==null&&starts>=5&&done/starts<0.3)issues.push({code:"BOOKING_COMPLETION_RATE_LOW",severity:"high",reason:"Many booking starts do not complete."});
  if(lcpMs!==null&&n(lcpMs)>2500)issues.push({code:"LCP_SLOW",severity:"medium",reason:"Largest Contentful Paint exceeds 2.5 seconds."});
  if(inpMs!==null&&n(inpMs)>200)issues.push({code:"INP_SLOW",severity:"medium",reason:"Interaction to Next Paint exceeds 200 ms."});
  if(cls!==null&&n(cls)>0.1)issues.push({code:"CLS_HIGH",severity:"medium",reason:"Cumulative Layout Shift exceeds 0.1."});
  return {status:issues.some(x=>x.severity==="high")?"attention_required":issues.length?"watch":"healthy",issues,metrics:{ad_clicks:clicks,landing_views:views,booking_starts:starts,bookings:done,lcp_ms:lcpMs===null?null:n(lcpMs),inp_ms:inpMs===null?null:n(inpMs),cls:cls===null?null:n(cls)},requires_write:false};
}

module.exports={diagnoseLanding};
