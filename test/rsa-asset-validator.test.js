const test = require('node:test');
const assert = require('node:assert/strict');
const { countChars, validateRsaAssets } = require('../rsa-asset-validator');

test('counts unicode characters rather than bytes', () => {
  assert.equal(countChars('Qualität'), 8);
});

test('accepts structurally valid proposal assets but never authorizes publication', () => {
  const out = validateRsaAssets({
    headlines:['Pizza in Kreuzberg','Bio Pizza Berlin','Pizza mit Sauerteig'],
    descriptions:['Pizza in Kreuzberg mit Sauerteig.','Entdecke Parma im Wrangelkiez.'],
  });
  assert.equal(out.proposal_valid, true);
  assert.equal(out.publication_authorized, false);
  assert.equal(out.writes_allowed, false);
});

test('rejects headline over 30 and description over 90 characters', () => {
  const out = validateRsaAssets({
    headlines:['1234567890123456789012345678901','Short headline','Another headline'],
    descriptions:['x'.repeat(91),'Short description'],
  });
  assert.equal(out.proposal_valid, false);
  assert.equal(out.invalid_assets.length, 2);
  assert.deepEqual(out.invalid_assets.map((x)=>x.type).sort(), ['description','headline']);
});

test('detects duplicate assets case-insensitively', () => {
  const out = validateRsaAssets({
    headlines:['Pizza Berlin','pizza berlin','Bio Pizza'],
    descriptions:['First description','Second description'],
  });
  assert.equal(out.proposal_valid, false);
  assert.equal(out.structural.duplicate_headlines.length, 1);
});