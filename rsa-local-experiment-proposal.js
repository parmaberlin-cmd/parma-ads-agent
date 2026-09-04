const { validateRsaAssets } = require('./rsa-asset-validator');

const LOCAL_RSA_PROPOSAL = Object.freeze({
  proposal_id: 'EXP-G-RSA-LOCAL-001',
  target_ad_group: 'Gruppo di annunci 1',
  objective: 'Improve structural completeness and local query-message relevance without changing budget.',
  headlines: [
    'Pizza in Berlin Kreuzberg',
    'Pizza nahe Schlesisches Tor',
    'Pizza im Wrangelkiez',
    'Bio Pizza in Kreuzberg',
    'Pizza mit Sauerteig',
    'Parma Berlin Kreuzberg',
    'Heute Pizza in Kreuzberg',
    'Pizza in der Wrangelstraße',
    'Italienische Pizza Berlin',
    'Sauerteig Pizza Berlin',
    'Bio Pizza Berlin',
    'Pizza vor Ort & Mitnehmen',
    'Tisch bei Parma reservieren',
    'Direkt bei Parma bestellen',
    'Parma Pizza Berlin',
  ],
  descriptions: [
    'Italienische Pizza im Wrangelkiez nahe Schlesisches Tor. Entdecke Parma in Kreuzberg.',
    'Bio-orientierte Pizza mit Sauerteig in der Wrangelstraße. Menü und Öffnungszeiten ansehen.',
    'Tisch reservieren, direkt bestellen oder Parma vor Ort in Kreuzberg besuchen.',
    'Parma Berlin: Pizza, Sauerteig und ausgewählte Zutaten im Herzen von Kreuzberg.',
  ],
  budget_change_eur: 0,
  bid_change: false,
  keyword_change: false,
  targeting_change: false,
  tracking_change: false,
  landing_page_change: false,
  publication_authorized: false,
  spend_authorized: false,
  rollback: 'Restore the pre-experiment RSA asset set for the target ad group.',
  evaluation: {
    structural: ['asset validity','Google ad strength','query-message relevance'],
    traffic: ['impressions','clicks','CTR','CPC'],
    business_outcome: 'Only after conversion semantics and ground truth are verified.',
    walk_in_guard: 'Do not judge near-me/local traffic solely by online reservation conversions.',
  },
});

function buildLocalRsaExperimentProposal() {
  const asset_validation = validateRsaAssets(LOCAL_RSA_PROPOSAL);
  return {
    ...LOCAL_RSA_PROPOSAL,
    asset_validation,
    ready_for_approval_review: asset_validation.proposal_valid,
    ready_for_execution: false,
    writes_allowed: false,
  };
}

module.exports = { LOCAL_RSA_PROPOSAL, buildLocalRsaExperimentProposal };