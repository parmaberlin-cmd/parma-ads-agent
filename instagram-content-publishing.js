'use strict';

const REQUIRED_READ_PERMISSIONS=Object.freeze(['instagram_basic','pages_show_list','pages_read_engagement','instagram_manage_insights']);
const REQUIRED_PUBLISH_PERMISSIONS=Object.freeze([...REQUIRED_READ_PERMISSIONS,'instagram_content_publish']);
const INSTAGRAM_LOGIN_READ_PERMISSIONS=Object.freeze(['instagram_business_basic','instagram_business_manage_insights']);
const INSTAGRAM_LOGIN_PUBLISH_PERMISSIONS=Object.freeze([...INSTAGRAM_LOGIN_READ_PERMISSIONS,'instagram_business_content_publish']);
const TERMINAL_CONTAINER_FAILURES=new Set(['ERROR','EXPIRED']);

function requireTransport(transport,{write=false}={}){
  if(!transport||typeof transport.get!=='function'||(write&&typeof transport.post!=='function'))throw new TypeError(`transport must provide get${write?' and post':''}`);
}
function numericId(value,label='id'){const id=String(value||'').trim();if(!/^\d{1,30}$/.test(id))throw new TypeError(`${label} must contain 1 to 30 digits`);return id;}
function httpsUrl(value,label){let u;try{u=new URL(String(value||''));}catch{throw new TypeError(`${label} must be a valid HTTPS URL`);}if(u.protocol!=='https:')throw new TypeError(`${label} must be a valid HTTPS URL`);return u.toString();}
function cleanCaption(value){const text=String(value||'');if(text.length>2200)throw new TypeError('caption must contain at most 2200 characters');return text;}
function permissionMap(rows=[]){return Object.fromEntries(rows.map(x=>[String(x.permission),String(x.status)]));}

async function auditInstagramContentCapability({transport,adAccountId,username='parma.divinibenedetti'}={}){
  requireTransport(transport); const account=String(adAccountId||'');if(account&&!/^act_\d{1,30}$/.test(account))throw new TypeError('adAccountId must use act_<digits> format');
  const checks={token_present:true,permissions_readable:false,business_discovered:false,instagram_account_discovered:false,page_linked:false,media_read:false,insights_read:false};
  let permissions={};let businessId=null;let ig=null;let page=null;let media=[];const blockers=[];
  try{const r=await transport.get('/me/permissions');permissions=permissionMap(r?.data||[]);checks.permissions_readable=true;}catch{blockers.push('token_permissions_not_readable');}
  try{const r=await transport.get('/me/accounts',{fields:'id,name,instagram_business_account{id,username}',limit:100});page=(r?.data||[]).find(x=>String(x?.instagram_business_account?.username||'').toLowerCase()===String(username).toLowerCase())||null;ig=page?.instagram_business_account||null;}catch{blockers.push('pages_not_readable');}
  if(!ig&&account)try{const a=await transport.get(`/${account}`,{fields:'business{id}'});businessId=a?.business?.id?numericId(a.business.id,'business id'):null;checks.business_discovered=Boolean(businessId);}catch{blockers.push('business_not_discoverable');}
  if(businessId){
    try{const r=await transport.get(`/${businessId}/owned_pages`,{fields:'id,name,instagram_business_account{id,username}',limit:100});page=(r?.data||[]).find(x=>String(x?.instagram_business_account?.username||'').toLowerCase()===String(username).toLowerCase())||null;ig=page?.instagram_business_account||null;}catch{blockers.push('owned_pages_not_readable');}
    if(!ig)try{const r=await transport.get(`/${businessId}/owned_instagram_accounts`,{fields:'id,username',limit:100});ig=(r?.data||[]).find(x=>String(x?.username||'').toLowerCase()===String(username).toLowerCase())||null;}catch{blockers.push('owned_instagram_accounts_not_readable');}
  }
  checks.instagram_account_discovered=Boolean(ig?.id);checks.page_linked=Boolean(page?.id&&page?.instagram_business_account?.id);
  if(ig?.id){
    const igId=numericId(ig.id,'Instagram user id');
    try{const r=await transport.get(`/${igId}/media`,{fields:'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url',limit:25});media=r?.data||[];checks.media_read=true;}catch{blockers.push('instagram_media_not_readable');}
    try{await transport.get(`/${igId}/insights`,{metric:'reach,profile_views',period:'day'});checks.insights_read=true;}catch{blockers.push('instagram_insights_not_readable');}
  }
  const granted=name=>permissions[name]==='granted';
  const readPermissionsVerified=REQUIRED_READ_PERMISSIONS.every(granted);
  const publishPermissionVerified=REQUIRED_PUBLISH_PERMISSIONS.every(granted);
  if(!readPermissionsVerified)blockers.push('required_read_permissions_not_verified');
  if(!publishPermissionVerified)blockers.push('instagram_content_publish_not_verified');
  return {schema:'instagram.capability_audit.v1',username:String(username).toLowerCase(),checks,permissions:{required_read:[...REQUIRED_READ_PERMISSIONS],required_publish:[...REQUIRED_PUBLISH_PERMISSIONS],granted_required:REQUIRED_PUBLISH_PERMISSIONS.filter(granted),missing_or_unverified:REQUIRED_PUBLISH_PERMISSIONS.filter(x=>!granted(x))},inventory:{media_count:media.length,media_types:[...new Set(media.map(x=>x.media_product_type||x.media_type).filter(Boolean))]},capabilities:{read_account:checks.instagram_account_discovered&&checks.page_linked,read_media:checks.media_read,read_insights:checks.insights_read&&readPermissionsVerified,create_container:publishPermissionVerified&&checks.page_linked,publish:publishPermissionVerified&&checks.page_linked,stories:publishPermissionVerified&&checks.page_linked},blockers:[...new Set(blockers)],contains_secret:false};
}

async function auditInstagramLoginCapability({transport,username='parma.divinibenedetti'}={}){
  requireTransport(transport);
  const checks={token_present:true,account_read:false,username_match:false,media_read:false,insights_read:false};
  const blockers=[];let account=null;let media=[];
  try{account=await transport.get('/me',{fields:'id,user_id,username,account_type,media_count'});checks.account_read=Boolean(account?.id||account?.user_id);checks.username_match=String(account?.username||'').toLowerCase()===String(username).toLowerCase();}catch{blockers.push('instagram_login_account_not_readable');}
  if(checks.account_read){
    try{const r=await transport.get('/me/media',{fields:'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url',limit:25});media=r?.data||[];checks.media_read=true;}catch{blockers.push('instagram_login_media_not_readable');}
    try{await transport.get('/me/insights',{metric:'reach,profile_views',period:'day'});checks.insights_read=true;}catch{blockers.push('instagram_login_insights_not_readable');}
  }
  if(!checks.username_match)blockers.push('instagram_username_not_verified');
  return {schema:'instagram.login_capability_audit.v1',login_type:'instagram_login',username:String(username).toLowerCase(),account:{id_present:checks.account_read,username:account?.username||null,account_type:account?.account_type||null},checks,permissions:{required_read:[...INSTAGRAM_LOGIN_READ_PERMISSIONS],required_publish:[...INSTAGRAM_LOGIN_PUBLISH_PERMISSIONS],verification:'not_enumerable_without_token_debug'},inventory:{media_count:media.length,media_types:[...new Set(media.map(x=>x.media_product_type||x.media_type).filter(Boolean))]},capabilities:{read_account:checks.account_read&&checks.username_match,read_media:checks.media_read,read_insights:checks.insights_read,create_container:checks.account_read&&checks.username_match?'SUPPORTED_NOT_YET_TESTED':false,publish:checks.account_read&&checks.username_match?'SUPPORTED_NOT_YET_TESTED':false,stories:checks.account_read&&checks.username_match?'SUPPORTED_NOT_YET_TESTED':false},blockers:[...new Set(blockers)],contains_secret:false};
}

function buildContainerPayload({mediaType='REELS',videoUrl,caption='',shareToFeed=true}={}){
  const type=String(mediaType).toUpperCase();if(!['REELS','STORIES'].includes(type))throw new TypeError('mediaType must be REELS or STORIES');
  const payload={media_type:type,video_url:httpsUrl(videoUrl,'videoUrl')};
  if(type==='REELS'){payload.caption=cleanCaption(caption);payload.share_to_feed=Boolean(shareToFeed);}
  else if(caption)throw new TypeError('Stories publishing does not accept caption in this contract');
  return payload;
}
async function createMediaContainer({transport,instagramUserId,...input}){requireTransport(transport,{write:true});return transport.post(`/${numericId(instagramUserId,'Instagram user id')}/media`,buildContainerPayload(input));}
async function getContainerStatus({transport,containerId}){requireTransport(transport);const r=await transport.get(`/${numericId(containerId,'container id')}`,{fields:'id,status_code,status'});return {id:numericId(r?.id||containerId,'container id'),status_code:String(r?.status_code||'UNKNOWN'),status:r?.status||null,ready:r?.status_code==='FINISHED',failed:TERMINAL_CONTAINER_FAILURES.has(String(r?.status_code||''))};}
async function publishMedia({transport,instagramUserId,containerId}){requireTransport(transport,{write:true});return transport.post(`/${numericId(instagramUserId,'Instagram user id')}/media_publish`,{creation_id:numericId(containerId,'container id')});}
async function verifyPublishedMedia({transport,mediaId}){requireTransport(transport);const r=await transport.get(`/${numericId(mediaId,'media id')}`,{fields:'id,media_type,media_product_type,permalink,timestamp,username'});return {published:Boolean(r?.id&&r?.permalink),media:{id:r?.id||null,media_type:r?.media_type||null,media_product_type:r?.media_product_type||null,permalink:r?.permalink||null,timestamp:r?.timestamp||null,username:r?.username||null}};}
async function readMediaInsights({transport,mediaId,metrics=['reach','views','likes','comments','shares','saved','total_interactions']}){requireTransport(transport);return transport.get(`/${numericId(mediaId,'media id')}/insights`,{metric:metrics.join(',')});}

module.exports={REQUIRED_READ_PERMISSIONS,REQUIRED_PUBLISH_PERMISSIONS,INSTAGRAM_LOGIN_READ_PERMISSIONS,INSTAGRAM_LOGIN_PUBLISH_PERMISSIONS,auditInstagramContentCapability,auditInstagramLoginCapability,buildContainerPayload,createMediaContainer,getContainerStatus,publishMedia,verifyPublishedMedia,readMediaInsights};
