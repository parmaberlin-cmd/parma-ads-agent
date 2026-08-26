const test = require("node:test");
const assert = require("node:assert/strict");
const { apiKeysMatch } = require("../api-key-auth");

test("API key comparison accepts only an exact non-empty match", () => {
  assert.equal(apiKeysMatch("correct-key", "correct-key"), true);
  assert.equal(apiKeysMatch("correct-key ", "correct-key"), false);
  assert.equal(apiKeysMatch("wrong", "correct-key"), false);
  assert.equal(apiKeysMatch("", "correct-key"), false);
  assert.equal(apiKeysMatch(undefined, "correct-key"), false);
});

test("API key comparison supports different input lengths without throwing", () => {
  assert.doesNotThrow(() => apiKeysMatch("x", "a-much-longer-key"));
  assert.equal(apiKeysMatch("x", "a-much-longer-key"), false);
});
