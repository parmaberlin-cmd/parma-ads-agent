'use strict';

const { normalizeOrderbirdAggregate, containsDisallowedPii } = require('./orderbird-normalize');

function keyFor(row) {
  return `${row.source}:${row.business_date}`;
}

function createMemoryAggregateStore() {
  const rows = new Map();
  return {
    async upsert(row) { rows.set(keyFor(row), structuredClone(row)); return { key:keyFor(row), inserted:true }; },
    async get(source, businessDate) { return rows.get(`${source}:${businessDate}`) || null; },
    async list() { return Array.from(rows.values()).map((x) => structuredClone(x)); }
  };
}

function createOrderbirdIngestion({ adapter, store, normalize = normalizeOrderbirdAggregate } = {}) {
  if (!adapter || typeof adapter.readAggregates !== 'function') throw new TypeError('adapter_required');
  if (!store || typeof store.upsert !== 'function') throw new TypeError('store_required');

  async function ingestRange({ startDate, endDate }) {
    const raw = await adapter.readAggregates({ startDate, endDate });
    const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
    const result = { requested:{ startDate, endDate }, received:items.length, upserted:0, rejected:0, keys:[] };
    for (const item of items) {
      if (containsDisallowedPii(item)) {
        result.rejected += 1;
        continue;
      }
      const normalized = normalize(item);
      if (containsDisallowedPii(normalized)) {
        result.rejected += 1;
        continue;
      }
      const written = await store.upsert(normalized);
      result.upserted += 1;
      result.keys.push(written?.key || keyFor(normalized));
    }
    return result;
  }

  async function backfill7Days(endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) throw new TypeError('end_date_required');
    const end = new Date(`${endDate}T12:00:00Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return ingestRange({ startDate:start.toISOString().slice(0,10), endDate });
  }

  async function ingestCompletedDay(businessDate) {
    return ingestRange({ startDate:businessDate, endDate:businessDate });
  }

  return { ingestRange, backfill7Days, ingestCompletedDay };
}

module.exports = { createOrderbirdIngestion, createMemoryAggregateStore, keyFor };
