function normalizeAssets(values=[]){return (values||[]).map(v=>typeof v==="string"?v:v?.text).filter(Boolean).map(v=>String(v).trim()).filter(Boolean);}

function normalizeAdStrength(value){
  const names={0:"UNSPECIFIED",1:"UNKNOWN",2:"PENDING",3:"NO_ADS",4:"POOR",5:"AVERAGE",6:"GOOD",7:"EXCELLENT"};
  if(value==null||value==="")return "";
  if(typeof value==="string"&&!/^\d+$/.test(value))return value.toUpperCase();
  return names[Number(value)]||String(value).toUpperCase();
}

function analyzeRsa(row={}, {minHeadlines=8,minDescriptions=3,conversionTrusted=false}={}){
  const headlines=normalizeAssets(row.headlines);
  const descriptions=normalizeAssets(row.descriptions);
  const issues=[];
  if(headlines.length<minHeadlines)issues.push({code:"RSA_FEW_HEADLINES",severity:"medium",reason:`Only ${headlines.length} headlines available; diversify before judging performance.`});
  if(descriptions.length<minDescriptions)issues.push({code:"RSA_FEW_DESCRIPTIONS",severity:"medium",reason:`Only ${descriptions.length} descriptions available.`});
  const normalized=headlines.map(x=>x.toLowerCase());
  if(new Set(normalized).size<headlines.length)issues.push({code:"RSA_DUPLICATE_HEADLINES",severity:"medium",reason:"Duplicate or near-identical headline text reduces asset diversity."});
  const weak=headlines.filter(x=>x.length<12);
  if(weak.length>=Math.max(2,Math.ceil(headlines.length/3)))issues.push({code:"RSA_SHORT_HEADLINES",severity:"low",reason:"A large share of headlines are very short and may underuse available message space."});
  const adStrength=normalizeAdStrength(row.ad_strength??row.adStrength);
  if(["POOR","AVERAGE"].includes(adStrength))issues.push({code:"RSA_AD_STRENGTH_WEAK",severity:"medium",reason:`Google Ads reports RSA strength ${adStrength}.`});
  const clicks=Number(row.clicks||0),conversions=Number(row.conversions||0),impressions=Number(row.impressions||0);
  if(clicks>=20&&conversions===0){
    if(conversionTrusted) issues.push({code:"RSA_TRAFFIC_WITHOUT_CONVERSIONS",severity:"high",reason:"RSA has meaningful click volume without trusted conversions; inspect intent and landing continuity before rewriting blindly."});
    else issues.push({code:"RSA_CONVERSION_EVIDENCE_UNVERIFIED",severity:"low",reason:"RSA has click volume but current conversion evidence is unverified; do not judge or rewrite the ad from conversion counts alone."});
  }
  return {
    ad_id:row.ad_id?String(row.ad_id):null,
    campaign:row.campaign||null,
    ad_group:row.ad_group||null,
    asset_counts:{headlines:headlines.length,descriptions:descriptions.length},
    metrics:{impressions,clicks,conversions},
    conversion_evidence:conversionTrusted?"trusted":"unverified",
    ad_strength:adStrength||null,
    issues,
    requires_write:false,
  };
}

function analyzeRsaSet(rows=[], options={}){
  return rows.map(row=>analyzeRsa(row,options)).sort((a,b)=>{
    const rank={high:3,medium:2,low:1};
    const ar=Math.max(0,...a.issues.map(i=>rank[i.severity]||0));
    const br=Math.max(0,...b.issues.map(i=>rank[i.severity]||0));
    return br-ar||b.metrics.clicks-a.metrics.clicks;
  });
}

module.exports={analyzeRsa,analyzeRsaSet};
