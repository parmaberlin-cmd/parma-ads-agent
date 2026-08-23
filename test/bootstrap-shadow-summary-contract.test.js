const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','bootstrap.js'),'utf8');

test('public Shadow summary exposes only boolean GA4 tracking inventory',()=>{
 assert.ok(source.includes('reservation_page_view: ga4Events.includes("reservation_page_view")'));
 assert.ok(source.includes('reservation_start: ga4Events.includes("reservation_start")'));
 assert.ok(source.includes('booking_completed: ga4Events.includes("booking_completed")'));
});

test('public Shadow summary keeps completed snapshot status while refresh may continue',()=>{
 assert.ok(source.includes('status: "completed", refreshing: Boolean(refreshPromise)'));
 assert.ok(source.includes('writes_allowed: false'));
});

test('promotion status remains present after diagnostics integration',()=>{
 assert.ok(source.includes('buildSanitizedPromotionStatus'));
 assert.ok(source.includes('promotion,'));
});