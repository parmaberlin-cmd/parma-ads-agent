function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function isoAgeHours(value,now=new Date()){if(!value)return null;const ts=new Date(value);if(Number.isNaN(ts.getTime()))return null;const age=(now.getTime()-ts.getTime())/3600000;return age<0?null:age;}
function sourceState({available,ageHours,maxAgeHours}){if(!available)return'unavailable';if(ageHours==null)return'freshness_unknown';return ageHours<=maxAgeHours?'fresh':'stale';}
function evaluateShadowDataQuality(snapshot={}, {now=new Date(),maxAgeHours=36}={}){
 const live=snapshot.live_sources||{},access=snapshot.access||{};
 const spec={google:[access.google_ok===true,live.google],ga4:[access.ga4_ok===true,live.ga4],meta:[access.meta_ok===true,live.meta]};
 const sources={};for(const[name,[available,data]]of Object.entries(spec)){const age=isoAgeHours(data?.last_seen_at||data?.collected_at||snapshot.generated_at,now);sources[name]={available,age_hours:age,state:sourceState({available,ageHours:age,maxAgeHours})};}
 const integrityBlockers=[];const googleClicks=finite(live.google?.totals?.clicks),googleCost=finite(live.google?.totals?.cost??live.google?.totals?.spend),bookings=finite(snapshot.conversions?.booking_completed);
 if(googleClicks!=null&&googleClicks<0)integrityBlockers.push('google_negative_clicks');if(googleCost!=null&&googleCost<0)integrityBlockers.push('google_negative_cost');if(bookings!=null&&bookings<0)integrityBlockers.push('negative_bookings');
 const integrityOk=integrityBlockers.length===0;const channelReady={google:sources.google.state==='fresh'&&sources.ga4.state==='fresh'&&integrityOk,meta:sources.meta.state==='fresh'};
 const blockers=[...integrityBlockers];for(const[name,source]of Object.entries(sources))if(source.state!=='fresh')blockers.push(`${name}_${source.state}`);
 const freshCount=Object.values(sources).filter(s=>s.state==='fresh').length,completeness=freshCount/3;const recommendationReady=channelReady.google||channelReady.meta;
 const confidence=!recommendationReady?'blocked':blockers.length===0?'high':'partial';
 return{ready_for_recommendations:recommendationReady,ready_for_execution:false,confidence,completeness_ratio:Number(completeness.toFixed(2)),max_age_hours:maxAgeHours,sources,channel_ready:channelReady,integrity_ok:integrityOk,blockers:[...new Set(blockers)],writes_allowed:false};
}
function assertQualityFailClosed(q){if(q?.ready_for_execution!==false||q?.writes_allowed!==false)throw new Error('shadow data quality gate violated fail-closed contract');if(!q?.ready_for_recommendations&&q?.confidence!=='blocked')throw new Error('blocked shadow data has invalid confidence');return true;}
module.exports={evaluateShadowDataQuality,assertQualityFailClosed,isoAgeHours,sourceState};