const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const { renderDailyBriefItalian } = require('../daily-brief-italian');
const { renderOfflineBrief } = require('../scripts/render-offline-brief');

test('Italian output has evidence, uncertainty, original timestamp and no promised business effect', () => {
  const out = renderDailyBriefItalian({ generated_at: '2026-09-01T12:00:00Z', source_evidence: { google: 'fresh', ga4: 'fresh', meta: 'unavailable' },
    priorities: [{ code: 'RECONCILE_BUSINESS_OUTCOMES', evidence: { google_conversion_signals: 10, ga4_session_conversion_signals: 106 } }] });
  assert.match(out, /14:00/); assert.match(out, /Ads 10; GA4 106/);
  assert.match(out, /Non sono automaticamente ordini/); assert.match(out, /non risultati promessi/);
});
test('unchanged, revised and rolling-window reports use different wording', () => {
  const base = { changes: { status: 'compared', material_change: false, metrics: {} } };
  assert.match(renderDailyBriefItalian(base), /Nessuna variazione materiale/);
  base.changes.metrics = { status: 'same_window_revision', changes: [{ metric: 'clicks', delta: 3 }] };
  assert.match(renderDailyBriefItalian(base), /revisioni dello stesso periodo/);
  base.changes.metrics = { reason: 'different_windows_not_a_daily_trend' };
  assert.match(renderDailyBriefItalian(base), /non è un confronto di crescita giornaliera/);
});
test('failed refresh is explicitly labelled as preserved previous data', () => {
  assert.match(renderDailyBriefItalian({ snapshot_status: 'last_refresh_failed' }), /aggiornamento fallito/);
});
test('renderer never interpolates arbitrary source text, URLs, errors or credentials', () => {
  const out = renderDailyBriefItalian({ generated_at: 'private-marker', source_evidence: { google: 'private-marker' },
    error: 'private-marker', priorities: [{ code: 'private-marker' }, { code: 'DIAGNOSE_META_DELIVERY', action: 'private-marker', blocker: 'private-marker', evidence: { affected_campaigns: 'private-marker' } }] });
  assert.equal(out.includes('private-marker'), false);
});
test('offline runner works without any Google/Meta/Wix credentials', () => {
  const script = path.join(__dirname, '..', 'scripts', 'render-offline-brief.js');
  const output = execFileSync(process.execPath, [script], { input: JSON.stringify({ now: '2026-09-01T12:00:00Z' }), encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.match(output, /PARMA ADS/); assert.match(output, /Google Ads: non verificata/);
});
test('offline runner bounds input and hides malformed input content', () => {
  const script = path.join(__dirname, '..', 'scripts', 'render-offline-brief.js');
  for (const input of ['{"private-marker":', '[]', 'null', 'x'.repeat(1024 * 1024 + 1)]) {
    const result = spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes('private-marker'), false);
    assert.match(result.stderr, /input non valido o troppo grande/);
  }
  assert.throws(() => renderOfflineBrief('null'));
});
