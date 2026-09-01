const axios = require("axios");
const { getDateRange } = require("./live-shadow-data");
const {
  runFunnelReport,
  runEventInventory,
  summarizeEventInventory,
  summarizeFunnel,
  funnelCompleteness,
  funnelRates,
} = require("./ga4-funnel-intelligence");

const DEFAULT_FUNNEL_EVENTS = ["reservation_page_view", "reservation_start", "booking_completed"];

function ga4Configured(env = process.env) {
  return Boolean(env.GA4_PROPERTY_ID && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
}

function sanitizeGoogleError(error, fallback) {
  return error?.response?.data?.error_description || error?.response?.data?.error?.message || error?.response?.data?.error || error?.message || fallback;
}

async function getGoogleAccessToken(env = process.env) {
  const body = new URLSearchParams({ client_id:env.GOOGLE_CLIENT_ID, client_secret:env.GOOGLE_CLIENT_SECRET, refresh_token:env.GOOGLE_REFRESH_TOKEN, grant_type:"refresh_token" });
  const response = await axios.post("https://oauth2.googleapis.com/token", body, { headers:{"content-type":"application/x-www-form-urlencoded"}, timeout:20000 });
  return response.data.access_token;
}

function parseGa4Date(value) {
  const text=String(value||"");
  if(!/^\d{8}$/.test(text))return null;
  return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}T12:00:00.000Z`;
}

function bookingFilters(googleCpcOnly=false){
  const filters=[{filter:{fieldName:"eventName",stringFilter:{matchType:"EXACT",value:"booking_completed"}}}];
  if(googleCpcOnly){
    filters.push({filter:{fieldName:"sessionSource",stringFilter:{matchType:"EXACT",value:"google",caseSensitive:false}}},{filter:{fieldName:"sessionMedium",stringFilter:{matchType:"EXACT",value:"cpc",caseSensitive:false}}});
  }
  return filters;
}

function classifyBookingSource(source, medium) {
  const s=String(source||'').toLowerCase();
  const m=String(medium||'').toLowerCase();
  const paid=/cpc|ppc|paid|paid_social|display/.test(m);
  if((s==='(direct)'||s==='direct')&&(m==='(none)'||m==='none'||!m))return'direct';
  if(s==='google'&&paid)return'google_paid';
  if(s==='google'&&/organic/.test(m))return'google_organic';
  if(/facebook|instagram|meta/.test(s)&&paid)return'meta_paid';
  if(/facebook|instagram|meta/.test(s))return'meta_organic';
  if(/organic/.test(m))return'organic_other';
  if(/referral/.test(m))return'referral';
  if(paid)return'paid_other';
  return'other';
}

async function runBookingReport({ accessToken, propertyId, start, end, googleCpcOnly = false }) {
  const body={dateRanges:[{startDate:start,endDate:end}],dimensions:[{name:"date"}],metrics:[{name:"eventCount"}],dimensionFilter:{andGroup:{expressions:bookingFilters(googleCpcOnly)}},orderBys:[{dimension:{dimensionName:"date",orderType:"ALPHANUMERIC"},desc:true}],limit:"1000"};
  const response=await axios.post(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,body,{headers:{authorization:`Bearer ${accessToken}`},timeout:20000});
  const rows=response.data.rows||[];
  const total=rows.reduce((sum,row)=>sum+Number(row.metricValues?.[0]?.value||0),0);
  const latest=rows.find((row)=>Number(row.metricValues?.[0]?.value||0)>0);
  return {event_count:total,last_seen_at:latest?parseGa4Date(latest.dimensionValues?.[0]?.value):null};
}

async function runBookingQualityReport({accessToken,propertyId,start,end}){
  const body={dateRanges:[{startDate:start,endDate:end}],metrics:[{name:"eventCount"},{name:"totalUsers"},{name:"sessions"}],dimensionFilter:{andGroup:{expressions:bookingFilters(false)}}};
  const response=await axios.post(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,body,{headers:{authorization:`Bearer ${accessToken}`},timeout:20000});
  const row=(response.data.rows||[])[0];
  const eventCount=Number(row?.metricValues?.[0]?.value||0); const users=Number(row?.metricValues?.[1]?.value||0); const sessions=Number(row?.metricValues?.[2]?.value||0);
  return {event_count:eventCount,users,sessions,events_per_user:users>0?Math.round((eventCount/users)*100)/100:null,events_per_session:sessions>0?Math.round((eventCount/sessions)*100)/100:null,duplication_risk:users>0&&eventCount/users>1.5};
}

async function runBookingSourceReport({accessToken,propertyId,start,end}){
  const body={dateRanges:[{startDate:start,endDate:end}],dimensions:[{name:"sessionSource"},{name:"sessionMedium"}],metrics:[{name:"eventCount"}],dimensionFilter:{andGroup:{expressions:bookingFilters(false)}},limit:"1000"};
  const response=await axios.post(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,body,{headers:{authorization:`Bearer ${accessToken}`},timeout:20000});
  const buckets={direct:0,google_paid:0,google_organic:0,meta_paid:0,meta_organic:0,organic_other:0,referral:0,paid_other:0,other:0};
  for(const row of response.data.rows||[]){
    const bucket=classifyBookingSource(row.dimensionValues?.[0]?.value,row.dimensionValues?.[1]?.value);
    buckets[bucket]+=Number(row.metricValues?.[0]?.value||0);
  }
  return buckets;
}

async function collectGa4ShadowData({ env = process.env, days = 30, now = new Date(), startDate = null, endDate = null } = {}) {
  const collectedAt=now.toISOString();
  if(!ga4Configured(env))return{access_ok:false,configuration_complete:false,collected_at:collectedAt,error:"ga4_configuration_incomplete",required_variable:"GA4_PROPERTY_ID",total_booking_completed:null,google_cpc_booking_completed:null,last_seen_at:null,booking_quality:null,booking_sources:null,funnel:null,event_inventory:null,candidate_attribution:null};
  const fallback=getDateRange(days,now); const start=startDate||fallback.start; const end=endDate||fallback.end;
  try{
    const accessToken=await getGoogleAccessToken(env);
    const eventNames=String(env.GA4_FUNNEL_EVENTS||DEFAULT_FUNNEL_EVENTS.join(",")).split(",").map((value)=>value.trim()).filter(Boolean);
    const [allBookings,googleCpcBookings,bookingQuality,bookingSources,funnelRows,eventInventoryRows]=await Promise.all([
      runBookingReport({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end,googleCpcOnly:false}),
      runBookingReport({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end,googleCpcOnly:true}),
      runBookingQualityReport({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end}),
      runBookingSourceReport({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end}),
      runFunnelReport({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end,eventNames}),
      runEventInventory({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end}),
    ]);
    const summarized=summarizeFunnel(funnelRows,eventNames); const funnel={event_names:eventNames,...summarized};
    const eventInventory=summarizeEventInventory(eventInventoryRows,eventNames);
    const candidateNames=eventInventory.reservation_candidates.map((row)=>row.event_name).filter(Boolean);
    let candidateAttribution={event_names:[],totals:{},google_cpc:{}};
    if(candidateNames.length){
      const candidateRows=await runFunnelReport({accessToken,propertyId:env.GA4_PROPERTY_ID,start,end,eventNames:candidateNames});
      candidateAttribution={event_names:candidateNames,...summarizeFunnel(candidateRows,candidateNames)};
    }
    return {access_ok:true,configuration_complete:true,collected_at:collectedAt,period:{start,end},event_name:"booking_completed",total_booking_completed:allBookings.event_count,google_cpc_booking_completed:googleCpcBookings.event_count,last_seen_at:googleCpcBookings.last_seen_at||allBookings.last_seen_at,booking_quality:bookingQuality,booking_sources:bookingSources,funnel:{...funnel,completeness:funnelCompleteness(funnel,DEFAULT_FUNNEL_EVENTS),rates:funnelRates(funnel)},event_inventory:eventInventory,candidate_attribution:candidateAttribution};
  }catch(error){
    return {access_ok:false,configuration_complete:true,collected_at:collectedAt,error:sanitizeGoogleError(error,"ga4_read_failed"),total_booking_completed:null,google_cpc_booking_completed:null,last_seen_at:null,booking_quality:null,booking_sources:null,funnel:null,event_inventory:null,candidate_attribution:null};
  }
}

module.exports={ga4Configured,collectGa4ShadowData,parseGa4Date,runBookingQualityReport,runBookingSourceReport,classifyBookingSource,DEFAULT_FUNNEL_EVENTS};