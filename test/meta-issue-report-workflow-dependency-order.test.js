const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('dependency install completes before Meta credentials are introduced',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.ok(w.indexOf('run: npm ci') < w.indexOf('META_ACCESS_TOKEN'));
 assert.doesNotMatch(w,/npm install|yarn|pnpm|npx/);
});
