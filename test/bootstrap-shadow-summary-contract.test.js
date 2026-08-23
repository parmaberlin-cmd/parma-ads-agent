const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','bootstrap.js'),'utf8');

test('public Shadow summary exposes only boolean GA4 tracking inventory',()=>{
 assert.match(source,/reservation_page_view\s*:\s*ga4Events\.includes\(["']reservation_page_view["']\)/);
 assert.match(source,/reservation_start\s*:\s*ga4Events\.includes\(["']reservation_start["']\)/);
 assert.match(source,/booking_completed\s*:\s*ga4Events\.includes\(["']booking_completed["']\)/);
});

test('public Shadow summary keeps completed snapshot status while refresh may continue',()=>{
 assert.match(source,/status\s*:\s*["']completed["']/);
 assert.match(source,/refreshing\s*:\s*Boolean\(refreshPromise\)/);
 assert.match(source,/writes_allowed\s*:\s*false/);
});

test('promotion status remains present after diagnostics integration',()=>{
 assert.ok(source.includes('buildSanitizedPromotionStatus'));
 assert.match(source,/\bpromotion\b/);
});