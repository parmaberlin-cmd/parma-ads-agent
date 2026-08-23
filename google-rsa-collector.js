async function collectResponsiveSearchAds({customer,start,end}){
  if(!customer||typeof customer.query!=="function")throw new TypeError("customer.query is required");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(start||""))||!/^\d{4}-\d{2}-\d{2}$/.test(String(end||"")))throw new TypeError("start and end must be YYYY-MM-DD");
  const rows=await customer.query(`
    SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
      ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad_strength,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad
    WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
      AND ad_group_ad.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows||[]).map(row=>({
    campaign_id:String(row.campaign?.id||""),
    campaign:row.campaign?.name||null,
    ad_group_id:String(row.ad_group?.id||""),
    ad_group:row.ad_group?.name||null,
    ad_id:String(row.ad_group_ad?.ad?.id||""),
    status:row.ad_group_ad?.status||null,
    ad_strength:row.ad_group_ad?.ad_strength||null,
    headlines:(row.ad_group_ad?.ad?.responsive_search_ad?.headlines||[]).map(x=>x?.text).filter(Boolean),
    descriptions:(row.ad_group_ad?.ad?.responsive_search_ad?.descriptions||[]).map(x=>x?.text).filter(Boolean),
    impressions:Number(row.metrics?.impressions||0),
    clicks:Number(row.metrics?.clicks||0),
    cost_eur:Number(row.metrics?.cost_micros||0)/1_000_000,
    conversions:Number(row.metrics?.conversions||0),
  }));
}

module.exports={collectResponsiveSearchAds};
