const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scheduler = fs.readFileSync(path.join(__dirname, '..', 'scheduler-bootstrap.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('production startup uses the read-only Shadow scheduler and Google intelligence preload', () => {
  assert.equal(pkg.scripts.start, 'node -r ./google-campaign-intelligence-preload.js -r ./meta-legacy-write-preload.js scheduler-bootstrap.js');
  assert.match(pkg.scripts.check, /google-campaign-intelligence-preload\.js/);
  assert.match(pkg.scripts.check, /google-campaign-breakdowns\.js/);
  assert.match(pkg.scripts.check, /scheduler-bootstrap\.js/);
});

test('scheduler calls only the protected Shadow refresh endpoint', () => {
  assert.match(scheduler, /\/tools\/agent\/shadow\/refresh/);
  assert.match(scheduler, /x-api-key/);
  assert.doesNotMatch(scheduler, /reservation-draft\/create|campaign.*activate|budget.*update/i);
});

test('scheduler is bounded and explicitly read-only', () => {
  assert.match(scheduler, /Math\.max\(15, Math\.min\(1440/);
  assert.match(scheduler, /writes_allowed:\s*false/);
  assert.match(scheduler, /setInterval/);
});
