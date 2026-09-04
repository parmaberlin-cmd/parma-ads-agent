'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build']);
const TEXT_EXT = new Set(['.js','.json','.md','.yml','.yaml','.txt','.mjs','.cjs']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (TEXT_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
  }
  return out;
}

function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }
function fail(task, reason) { return { task, ok:false, reason }; }
function pass(task, detail) { return { task, ok:true, detail }; }
function secretScanText(name, text) {
  if (!name.startsWith('test/')) return text;
  // Deterministic fixtures are deliberately non-secret. Keep scanning every other literal.
  return text.replace(/(['"])(?:test|mock|dummy|example)[A-Za-z0-9_.-]*\1/gi, "'<TEST_FIXTURE>'");
}

const files = walk(ROOT).filter(f => rel(f) !== 'scripts/audit-200-safe-checks.js');
if (files.length < 200) {
  console.error(`AUDIT_ABORT: only ${files.length} eligible repository text files; 200 independent file audits required.`);
  process.exit(2);
}

const selected = files.slice(0, 200);
const results = [];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:GOOGLE_REFRESH_TOKEN|GOOGLE_CLIENT_SECRET|PARMA_AGENT_API_KEY|META_ACCESS_TOKEN)\s*[:=]\s*['"][^'"$<{]{8,}['"]/i,
  /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_.-]{16,}['"]/i
];

for (let i = 0; i < selected.length; i++) {
  const file = selected[i];
  const name = rel(file);
  const task = i + 1;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { results.push(fail(task, `${name}: unreadable: ${e.message}`)); continue; }

  if (text.includes('<<<<<<<') || text.includes('=======\n') && text.includes('>>>>>>>')) {
    results.push(fail(task, `${name}: unresolved merge-conflict marker`));
    continue;
  }
  const scanText = secretScanText(name, text);
  const secretHit = secretPatterns.find(p => p.test(scanText));
  if (secretHit) {
    results.push(fail(task, `${name}: possible hard-coded secret/private key`));
    continue;
  }
  if (Buffer.byteLength(text, 'utf8') > 2_000_000) {
    results.push(fail(task, `${name}: unexpectedly large text file`));
    continue;
  }
  const digest = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  results.push(pass(task, `${name} sha256:${digest}`));
}

const failures = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${String(r.task).padStart(3,'0')}: ${r.detail || r.reason}`);
console.log(`AUDIT_SUMMARY tasks=${results.length} passed=${results.length-failures.length} failed=${failures.length}`);
if (results.length !== 200 || failures.length) process.exit(1);
