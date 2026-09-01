const { observedNumber } = require('./observed-number');
const { timestamp } = require('./report-memory');

const LABELS = Object.freeze({
  CHECK_SOURCE_EVIDENCE: 'Verificare accessi e aggiornamento delle fonti',
  RECONCILE_BUSINESS_OUTCOMES: 'Distinguere eventi, prenotazioni e ordini reali',
  VERIFY_FUNNEL_MEASUREMENT: 'Verificare la misurazione del percorso di prenotazione',
  DIAGNOSE_META_DELIVERY: 'Diagnosticare i problemi di erogazione Meta',
  REVIEW_LOCAL_SEARCH_INTENT: 'Analizzare le ricerche locali per sala, ritiro e consegna',
  REVIEW_DEMAND_DISTRIBUTION: 'Analizzare domanda per zona, orario e dispositivo',
  REVIEW_DIRECT_ORDER_EVIDENCE: 'Verificare le evidenze sul percorso degli ordini diretti',
  VERIFY_ORDER_SIGNALS: 'Riconciliare i segnali GA4 degli ordini con ordini reali',
  CHECK_SEARCH_COLLECTION: 'Verificare la raccolta dei termini di ricerca',
});
const SOURCE_LABELS = { fresh: 'aggiornata', unavailable: 'non disponibile', unverified: 'non verificata' };
const number = value => {
  const parsed = observedNumber(value);
  return parsed === null ? 'non disponibile' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(parsed);
};

// Fixed vocabulary and validated numbers only. Never render upstream free text.
function renderDailyBriefItalian(brief = {}) {
  const at = timestamp(brief.generated_at);
  const date = at === null ? 'non verificata' : new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(at));
  const lines = ['PARMA ADS — RIEPILOGO OPERATIVO', `Rilevazione: ${date} (ora di Berlino).`];
  if (brief.snapshot_status === 'last_refresh_failed') lines.push('ATTENZIONE: aggiornamento fallito. Questi sono i dati dell’ultima rilevazione completata.');
  if (['stale_snapshot', 'freshness_unverified'].includes(brief.snapshot_status)) lines.push('ATTENZIONE: dati scaduti o data di aggiornamento non verificata. Le vecchie raccomandazioni sono sospese.');
  lines.push(['google', 'ga4', 'meta'].map(source => `${source === 'google' ? 'Google Ads' : source.toUpperCase()}: ${SOURCE_LABELS[brief.source_evidence?.[source]] || 'non verificata'}`).join(' · '));
  const changes = brief.changes;
  if (changes?.status === 'compared') {
    lines.push(changes.material_change === true ? 'Sono cambiate alcune evidenze rispetto alla rilevazione precedente.' : 'Nessuna variazione materiale verificata rispetto alla rilevazione precedente.');
    if (changes.metrics?.reason === 'different_windows_not_a_daily_trend') lines.push('I periodi dei dati sono diversi: non è un confronto di crescita giornaliera.');
    if (changes.metrics?.status === 'same_window_revision' && changes.metrics.changes?.length) lines.push('Le variazioni numeriche sono revisioni dello stesso periodo, non nuovi clienti acquisiti oggi.');
  } else lines.push('Confronto storico non disponibile o non affidabile: nessuna crescita viene dedotta.');
  lines.push('', 'Priorità in sola lettura:');
  const seen = new Set();
  for (const item of Array.isArray(brief.priorities) ? brief.priorities.slice(0, 5) : []) {
    if (!item || typeof item.code !== 'string' || !Object.hasOwn(LABELS, item.code) || seen.has(item.code)) continue;
    seen.add(item.code);
    const persistent = changes?.priorities?.persistent?.includes(item.code) ? ' — già presente' : '';
    lines.push(`${seen.size}. ${LABELS[item.code]}${persistent}.`);
    if (item.code === 'RECONCILE_BUSINESS_OUTCOMES') lines.push(`   Segnali: Ads ${number(item.evidence?.google_conversion_signals)}; GA4 ${number(item.evidence?.ga4_session_conversion_signals)}. Non sono automaticamente ordini o prenotazioni reali.`);
    if (item.code === 'DIAGNOSE_META_DELIVERY') lines.push(`   Campagne con problemi osservati: ${number(item.evidence?.affected_campaigns)}. La causa va verificata.`);
    if (item.code === 'REVIEW_LOCAL_SEARCH_INTENT') lines.push(`   Termini disponibili: ${number(item.evidence?.observed_terms)}. Nessuna esclusione automatica.`);
    if (item.blocker) lines.push('   La verifica finale ha un prerequisito; l’analisi disponibile può proseguire.');
  }
  if (!seen.size) lines.push('Nessuna priorità supportata da evidenze disponibili.');
  lines.push('', 'Ordini e fatturato verificati: non disponibili finché non riconciliati con il gestionale.',
    'Benefici attesi: ipotesi da misurare, non risultati promessi.',
    'Nessuna modifica a campagne, tracking o budget. Nessuna spesa o pubblicazione autorizzata da questo report.');
  return lines.join('\n');
}

module.exports = { LABELS, renderDailyBriefItalian };
