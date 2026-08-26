const { createHash, timingSafeEqual } = require("crypto");

function digest(value) {
  return createHash("sha256").update(String(value), "utf8").digest();
}

function apiKeysMatch(candidate, configured) {
  if (typeof candidate !== "string" || typeof configured !== "string") {
    return false;
  }
  if (!candidate || !configured) return false;
  return timingSafeEqual(digest(candidate), digest(configured));
}

module.exports = { apiKeysMatch };
