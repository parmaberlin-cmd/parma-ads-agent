function parseExactDateRange(query = {}) {
  const start = query.start ? String(query.start) : null;
  const end = query.end ? String(query.end) : null;
  if (!start && !end) return { provided:false };
  if (!start || !end) return { provided:true, valid:false, error:"start and end must be provided together" };
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start) || !datePattern.test(end)) return { provided:true, valid:false, error:"start and end must use YYYY-MM-DD" };
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return { provided:true, valid:false, error:"start must be on or before end" };
  const days = Math.floor((endMs - startMs) / 86400000) + 1;
  if (days > 90) return { provided:true, valid:false, error:"exact date range must be 90 days or fewer" };
  return { provided:true, valid:true, start, end, days };
}

module.exports = { parseExactDateRange };
