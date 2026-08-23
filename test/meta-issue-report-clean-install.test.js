const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow uses deterministic lockfile dependency installation',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/run: npm ci/);
 assert.doesNotMatch(workflow,/npm install|yarn|pnpm|npx/);
});
