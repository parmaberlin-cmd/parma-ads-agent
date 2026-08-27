const express = require('express');
const { GoogleAdsApi } = require('google-ads-api');
const { apiKeysMatch } = require('./api-key-auth');
const {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
} = require('./google-campaign-breakdowns');

const originalListen = express.application.listen;
let installed = false;

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function validCampaign(value) { const id=String(value||'').trim(); return /^\d{1,20}$/.test(id) ? id : null; }
function validDays(value) { const n=Number(value ?? 30); return Number.isInteger(n)&&n>=1&&n<=90?n:null; }
function iso(d){ return d.toISOString().slice(0,10); }
function range(days){ const end=new Date(); end.setUTCHours(0,0,0,0); end.setUTCDate(end.getUTCDate()-1); const start=new Date(end); start.setUTCDate(start.getUTCDate()-(days-1)); return {start:iso(start),end:iso(end)}; }
function auth(req){ const supplied=req.headers['x-api-key']||req.headers.authorization?.replace('Bearer ',''); return process.env.PARMA_AGENT_API_KEY && apiKeysMatch(supplied,process.env.PARMA_AGENT_API_KEY); }
function customer(){ const api=new GoogleAdsApi({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,developer_token:process.env.GOOGLE_DEVELOPER_TOKEN}); const cfg={customer_id:digits(process.env.GOOGLE_CUSTOMER_ID),refresh_token:process.env.GOOGLE_REFRESH_TOKEN}; const login=digits(process.env.GOOGLE_LOGIN_CUSTOMER_ID); if(login)cfg.login_customer_id=login; return api.Customer(cfg); }
function clean(error){ return {message:String(error?.errors?.[0]?.message||error?.message||'Google Ads request failed').slice(0,240),code:error?.errors?.[0]?.error_code||null}; }

function install(app){
  if(installed)return; installed=true;
  app.get('/tools/google/campaign/:id/intelligence', async (req,res)=>{
    if(!auth(req)) return res.status(401).json({success:false,error:'Unauthorized'});
    const campaignId=validCampaign(req.params.id), days=validDays(req.query.days);
    if(!campaignId||!days) return res.status(400).json({success:false,error:'invalid campaign id or days'});
    const required=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_DEVELOPER_TOKEN','GOOGLE_REFRESH_TOKEN','GOOGLE_CUSTOMER_ID'];
    if(required.some(k=>!process.env[k])) return res.status(500).json({success:false,error:'Google Ads configuration missing'});
    try{
      const c=customer(), {start,end}=range(days);
      const [search_terms,keywords,devices,hours,geography]=await Promise.all([
        collectCampaignSearchTerms({customer:c,campaignId,start,end}),collectCampaignKeywords({customer:c,campaignId,start,end}),collectCampaignDevices({customer:c,campaignId,start,end}),collectCampaignHours({customer:c,campaignId,start,end}),collectCampaignGeography({customer:c,campaignId,start,end})
      ]);
      res.json({success:true,source:'google_ads',mode:'read_only_intelligence',campaign_id:campaignId,period_days:days,date_range:{start,end},search_terms,keywords,devices,hours,geography,writes_allowed:false,execution_allowed:false,spend_allowed:false});
    }catch(error){ res.status(500).json({success:false,source:'google_ads',campaign_id:campaignId,error:clean(error),writes_allowed:false,execution_allowed:false,spend_allowed:false}); }
  });
}

express.application.listen=function(...args){ install(this); return originalListen.apply(this,args); };
module.exports={install};
