function n(v){const x=Number(v);return Number.isFinite(x)&&x>=0?x:0}
function buildDemandHeatmap(rows=[]){
 const cells=rows.map(r=>{const impressions=n(r.impressions),clicks=n(r.clicks),cost=n(r.cost_eur);return {day:r.day??null,hour:r.hour??null,impressions,clicks,cost_eur:Number(cost.toFixed(4)),ctr:impressions?Number((clicks/impressions).toFixed(4)):null,avg_cpc:clicks?Number((cost/clicks).toFixed(4)):null,conversion_signal_used:false}});
 const ranked=[...cells].sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions);
 return {mode:'descriptive_demand_only',cells,top_demand_cells:ranked.slice(0,10),conversion_timing_trusted:false,schedule_change_supported:false,execution_allowed:false};
}
module.exports={buildDemandHeatmap};
