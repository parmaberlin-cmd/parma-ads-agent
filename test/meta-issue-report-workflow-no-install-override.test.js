const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic dependency installation has no force or alternate resolver flags',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(w,/run: npm ci/);
 assert.doesNotMatch(w,/--force|--legacy-peer-deps|npm install|npx|yarn|pnpm/);
});
