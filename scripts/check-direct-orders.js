// Offline, read-only runner. Input is a sanitized evidence JSON file, not a URL.
const fs = require("node:fs");
const { assessDirectOrders } = require("../direct-order-readiness");

try {
  const path = process.argv[2];
  if (!path || process.argv.length > 3) throw new Error("invalid arguments");
  const stat = fs.statSync(path);
  if (!stat.isFile() || stat.size > 65536) throw new Error("invalid evidence file");
  const evidence = JSON.parse(fs.readFileSync(path, "utf8"));
  process.stdout.write(JSON.stringify(assessDirectOrders(evidence), null, 2) + "\n");
} catch {
  // Never reflect arbitrary input, paths or exception messages into a public diagnostic.
  process.stderr.write("Unable to read evidence. Usage: node scripts/check-direct-orders.js <sanitized-evidence.json> (maximum 64 KiB)\n");
  process.exitCode = 1;
}
