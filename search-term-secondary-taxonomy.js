function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function classifySecondaryIntent(term, primaryIntent) {
  if (primaryIntent !== 'other') return null;
  const t = normalize(term);
  if (!t) return 'unknown_empty';
  if (/\b(menu|menü|speisekarte|karte)\b/.test(t)) return 'menu_intent';
  if (/\b(preis|preise|price|prices|kosten|cost)\b/.test(t)) return 'price_intent';
  if (/\b(telefon|phone|kontakt|contact|nummer|number)\b/.test(t)) return 'contact_intent';
  if (/\b(vegan|vegetarian|vegetarisch|glutenfrei|gluten free|halal)\b/.test(t)) return 'dietary_intent';
  if (/\b(restaurant|ristorante|trattoria|osteria|gastronomie|lokal)\b/.test(t)) return 'restaurant_generic';
  if (/\b(friedrichshain|neukölln|neukoelln|mitte|wedding|prenzlauer|charlottenburg|wilmersdorf|schöneberg|schoeneberg|tempelhof|treptow|potsdam)\b/.test(t)) return 'other_area';
  if (/\b(cafe|café|bar|burger|döner|doener|sushi|ramen|kebab)\b/.test(t)) return 'other_food_category';
  return 'unknown_entity_or_phrase';
}

function secondarySafety(label) {
  if (['menu_intent','price_intent','contact_intent','dietary_intent','restaurant_generic'].includes(label)) return { exclusion_candidate:false, role:'discovery_or_visit_support' };
  if (label === 'other_area') return { exclusion_candidate:false, role:'geographic_strategy_review' };
  if (label === 'other_food_category') return { exclusion_candidate:true, role:'semantic_negative_proposal_candidate' };
  return { exclusion_candidate:false, role:'manual_semantic_review' };
}

module.exports = { classifySecondaryIntent, secondarySafety };