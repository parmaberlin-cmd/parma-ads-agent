'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');

test('STEP7 preload preserves actual Express JSON middleware, existing routes, 404, error handling and listen callback',()=>{
 const script=String.raw`
'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
const http=require('node:http');
const original=Module._load;
let installed=0;
Module._load=function(id,parent,isMain){
 if(id==='./personal-os-step7-read-gateway'){
  return {installStep7ReadGateway:({app})=>{
   installed++;
   app.post('/control/personal-os/read-gateway',(req,res)=>res.json({gateway:true,body:req.body}));
  }};
 }
 if(id==='google-ads-api')return {GoogleAdsApi:class {}};
 if(id==='./google-time-utils')return {getGoogleDateRange:()=>({start:'2026-10-07',end:'2026-10-08'}),DEFAULT_GOOGLE_TIMEZONE:'Europe/Berlin'};
 return original.apply(this,arguments);
};
require('./personal-os-step7-read-gateway-preload');
const express=require('express');
const app=express();
app.use(express.json());
app.get('/existing-health',(_req,res)=>res.json({ok:true}));
app.post('/existing-json',(req,res)=>res.json({echo:req.body}));
app.get('/existing-error',(_req,_res,next)=>next(new Error('expected-test-error')));
app.use((err,_req,res,_next)=>res.status(418).json({handled:err.message==='expected-test-error'}));
let callbackCalled=false;
const server=app.listen(0,'127.0.0.1',()=>{callbackCalled=true;});
function request(route,method='GET',body){
 return new Promise((resolve,reject)=>{
  const data=body===undefined?null:JSON.stringify(body);
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method,headers:data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}},res=>{
   let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:text?JSON.parse(text):null}));
  });
  req.on('error',reject);if(data)req.write(data);req.end();
 });
}
(async()=>{
 try{
  if(!server.listening)await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(callbackCalled,true);
  assert.equal(installed,1);
  assert.deepEqual(await request('/existing-health'),{status:200,body:{ok:true}});
  assert.deepEqual(await request('/existing-json','POST',{safe:'yes'}),{status:200,body:{echo:{safe:'yes'}}});
  assert.deepEqual(await request('/control/personal-os/read-gateway','POST',{nonce:'test'}),{status:200,body:{gateway:true,body:{nonce:'test'}}});
  assert.deepEqual(await request('/existing-error'),{status:418,body:{handled:true}});
  const missing=await request('/not-found');assert.equal(missing.status,404);
  assert.equal(installed,1);
  console.log('STEP7_EXPRESS_HTTP_PASS');
 }catch(e){console.error(e);process.exitCode=1;}finally{server.close();}
})();
`;
 const output=execFileSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:15000});
 assert.match(output,/STEP7_EXPRESS_HTTP_PASS/);
});
