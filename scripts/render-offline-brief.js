const fs = require('node:fs');
const { buildShadowAgentReport } = require('../agent-shadow');
const { renderDailyBriefItalian } = require('../daily-brief-italian');

// Input is a saved collector snapshot, not an endpoint or a credential source.
// No live collection, filesystem output or execution of proposed actions is performed.
function renderOfflineBrief(text) {
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('input_too_large');
  const input = JSON.parse(text);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_snapshot');
  return renderDailyBriefItalian(buildShadowAgentReport(input).decision_brief);
}
if (require.main === module) {
  try {
    const bytes = Buffer.alloc(1024 * 1024 + 1);
    let total = 0, read;
    while (total < bytes.length && (read = fs.readSync(0, bytes, total, bytes.length - total, null)) > 0) total += read;
    if (total > 1024 * 1024) throw new Error('input_too_large');
    process.stdout.write(`${renderOfflineBrief(bytes.subarray(0, total).toString('utf8'))}\n`);
  } catch {
    process.stderr.write('Impossibile leggere il report offline: input non valido o troppo grande.\n');
    process.exitCode = 1;
  }
}
module.exports = { renderOfflineBrief };
