const LIMITS = Object.freeze({ headline: 30, description: 90, max_headlines: 15, max_descriptions: 4, min_headlines: 3, min_descriptions: 2 });

function countChars(value) {
  return [...String(value || '')].length;
}

function duplicateIndexes(values = []) {
  const seen = new Map();
  const duplicates = [];
  values.forEach((value, index) => {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates.push([seen.get(key), index]);
    else seen.set(key, index);
  });
  return duplicates;
}

function validateRsaAssets({ headlines = [], descriptions = [] } = {}) {
  const headlineChecks = headlines.map((text, index) => ({ index, text, chars: countChars(text), limit: LIMITS.headline, valid: countChars(text) <= LIMITS.headline && countChars(text) > 0 }));
  const descriptionChecks = descriptions.map((text, index) => ({ index, text, chars: countChars(text), limit: LIMITS.description, valid: countChars(text) <= LIMITS.description && countChars(text) > 0 }));
  const structural = {
    headline_count: headlines.length,
    description_count: descriptions.length,
    headline_count_valid: headlines.length >= LIMITS.min_headlines && headlines.length <= LIMITS.max_headlines,
    description_count_valid: descriptions.length >= LIMITS.min_descriptions && descriptions.length <= LIMITS.max_descriptions,
    duplicate_headlines: duplicateIndexes(headlines),
    duplicate_descriptions: duplicateIndexes(descriptions),
  };
  const invalidAssets = [...headlineChecks.filter((x)=>!x.valid).map((x)=>({type:'headline',...x})), ...descriptionChecks.filter((x)=>!x.valid).map((x)=>({type:'description',...x}))];
  return {
    limits: LIMITS,
    structural,
    headline_checks: headlineChecks,
    description_checks: descriptionChecks,
    invalid_assets: invalidAssets,
    proposal_valid: structural.headline_count_valid && structural.description_count_valid && structural.duplicate_headlines.length === 0 && structural.duplicate_descriptions.length === 0 && invalidAssets.length === 0,
    publication_authorized: false,
    writes_allowed: false,
  };
}

module.exports = { LIMITS, countChars, validateRsaAssets };