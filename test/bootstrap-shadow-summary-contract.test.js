const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const bootstrap=fs.readFileSync(path.join(__dirname,'..','bootstrap.js'),'utf8');
const publicView=fs.readFileSync(path.join(__dirname,'..','runtime-public-view.js'),'utf8');

test('public Shadow summary delegates GA4 tracking to configured/observed sanitized view',()=>{
 assert.match(bootstrap,/buildPublicSourceView\(r\.live_sources \|\| \{\}\)/);
 for(const event of ['reservation_page_view','reservation_start','booking_completed']) assert.ok(publicView.includes(event));
 assert.match(publicView,/configured:\s*configuredEvent\(ga4, name\)/);
 assert.match(publicView,/observed:\s*observedEvent\(ga4, name\)/);
});

test('public Shadow summary keeps completed snapshot status while refresh may continue',()=>{
 assert.match(bootstrap,/status\s*:\s*["']completed["']/);
 assert.match(bootstrap,/refreshing\s*:\s*Boolean\(refreshPromise\)/);
 assert.match(bootstrap,/writes_allowed\s*:\s*false/);
});

test('promotion status remains present after diagnostics integration',()=>{
 assert.ok(bootstrap.includes('buildSanitizedPromotionStatus'));
 assert.match(bootstrap,/\bpromotion\b/);
});