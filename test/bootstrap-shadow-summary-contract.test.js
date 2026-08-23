const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','bootstrap.js'),'utf8');

test('public Shadow summary delegates GA4 tracking semantics to sanitized runtime view',()=>{
 assert.ok(source.includes('buildPublicSourceView'));
 assert.ok(source.includes('const publicSources = buildPublicSourceView'));
 assert.match(source,/\.\.\.publicSources/);
});

test('all public operational health endpoints use fail-closed safePublicJson',()=>{
 assert.ok(source.includes('safePublicJson'));
 assert.match(source,/app\.get\("\/health\/agent-shadow-summary"/);
 assert.match(source,/app\.get\("\/health\/agent-dashboard"/);
 assert.match(source,/app\.get\("\/health\/agent-cycle"/);
 const publicCalls=(source.match(/safePublicJson\(/g)||[]).length;
 assert.ok(publicCalls>=6);
});

test('public Shadow summary keeps completed snapshot status while refresh may continue',()=>{
 assert.match(source,/status:\s*"completed"/);
 assert.match(source,/refreshing:\s*Boolean\(refreshPromise\)/);
 assert.match(source,/writes_allowed:\s*false/);
 assert.match(source,/refresh_failed:\s*Boolean\(state\.last_refresh_error\)/);
 assert.doesNotMatch(source,/refresh_error:\s*state\.last_refresh_error\s*\?/);
});

test('promotion status remains present after diagnostics integration',()=>{
 assert.ok(source.includes('buildSanitizedPromotionStatus'));
 assert.match(source,/\bpromotion\b/);
});