function id(value){const s=String(value||'').trim();return /^\d{1,30}$/.test(s)?s:null;}

async function inspectKnownPartial({transport,knownPartial={}}={}){
 if(!transport||typeof transport.get!=='function')throw new TypeError('transport must provide get');
 const out={objects:{},consistent:true,blockers:[],safe_to_reuse:{}};
 const c=id(knownPartial.campaign_id),s=id(knownPartial.adset_id),x=id(knownPartial.creative_id),a=id(knownPartial.ad_id);
 if(c){const o=await transport.get(`/${c}`,{fields:'id,status,effective_status'});out.objects.campaign=o;out.safe_to_reuse.campaign=o?.status==='PAUSED';if(!out.safe_to_reuse.campaign)out.blockers.push('campaign_not_paused');}
 if(s){const o=await transport.get(`/${s}`,{fields:'id,status,effective_status,campaign_id'});out.objects.adset=o;out.safe_to_reuse.adset=o?.status==='PAUSED'&&(!c||String(o?.campaign_id)===c);if(o?.status!=='PAUSED')out.blockers.push('adset_not_paused');if(c&&String(o?.campaign_id)!==c)out.blockers.push('adset_campaign_mismatch');}
 if(x){const o=await transport.get(`/${x}`,{fields:'id,name'});out.objects.creative=o;out.safe_to_reuse.creative=Boolean(o?.id);if(!o?.id)out.blockers.push('creative_missing');}
 if(a){const o=await transport.get(`/${a}`,{fields:'id,status,effective_status,adset_id,creative{id}'});out.objects.ad=o;out.safe_to_reuse.ad=o?.status==='PAUSED'&&(!s||String(o?.adset_id)===s)&&(!x||String(o?.creative?.id)===x);if(o?.status!=='PAUSED')out.blockers.push('ad_not_paused');if(s&&String(o?.adset_id)!==s)out.blockers.push('ad_adset_mismatch');if(x&&String(o?.creative?.id)!==x)out.blockers.push('ad_creative_mismatch');}
 out.consistent=out.blockers.length===0;
 return out;
}
module.exports={inspectKnownPartial};
