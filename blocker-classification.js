const TYPES = Object.freeze({
  SOFTWARE:'software',
  DATA:'data_or_maturity',
  EXTERNAL:'external_access',
  PERMISSION:'permission_gate',
  UNKNOWN:'unknown',
});

function classifyBlocker(blocker = {}) {
  const code = String(blocker.code || '').toLowerCase();
  const text = `${code} ${blocker.reason || ''} ${blocker.description || ''}`.toLowerCase();
  if (/wix|meta ui|account access|external access|ground truth missing/.test(text)) return TYPES.EXTERNAL;
  if (/approval|permission|merge|deploy|spend|write gate|tracking change/.test(text)) return TYPES.PERMISSION;
  if (/maturity|insufficient history|attribution|timezone|semantic identity|counting|data quality/.test(text)) return TYPES.DATA;
  if (/test fail|syntax|runtime error|regression|module not found|build/.test(text)) return TYPES.SOFTWARE;
  return TYPES.UNKNOWN;
}

function summarizeBlockers(rows = []) {
  const summary = {software:0,data_or_maturity:0,external_access:0,permission_gate:0,unknown:0};
  const items = (rows || []).map((row) => {
    const type = classifyBlocker(row);
    summary[type] += 1;
    return {...row, blocker_type:type};
  });
  return {summary, items};
}

module.exports = { TYPES, classifyBlocker, summarizeBlockers };
