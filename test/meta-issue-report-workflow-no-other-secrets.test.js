const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow references no Google GA4 TikTok or infrastructure secrets',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/GOOGLE_|GA4_|TIKTOK_|RAILWAY_|DATABASE_|API_KEY/);
});
