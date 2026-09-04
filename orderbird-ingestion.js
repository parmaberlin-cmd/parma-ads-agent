'use strict';
const { normalizeOrderbirdAggregate, containsDisallowedPii } = require('./orderbird-normalize');
const { keyFor } = require('./orderbird-store');

function createOrderbirdIngestion({ adapter, store, normalize=normalizeOrderbirdAggregate, now=()=>new Date() } = {}) {
  if (!adapter || typeof adapter.readAggregates !== 'function') throw new TypeError('adapter_required');
  if (!store || typeof store.upsert !== 'function') throw new TypeError('store_required');
  let lastRun = { status:'never_run', at:null, error:null, received:0, upserted:0, rejected:0 };

  async function ingestRange({ startDate,endDate }) {
    try {
      const raw = await adapter.readAggregates({startDate,endDate});
      const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
      const result = { requested:{startDate,endDate}, received:items.length, upserted:0, rejected:0, keys:[] };
      for (const item of items) {
        if (containsDisallowedPii(item)) { result.rejected += 1; continue; }
        let normalized;
        try { normalized = normalize(item); }
        catch (err) { result.rejected += 1; continue; }
        const written = await store.upsert(normalized);
        result.upserted += 1;
        result.keys.push(written?.key || keyFor(normalized));
      }
      lastRun = { status:'success', at:now().toISOString(), error:null, received:result.received, upserted:result.upserted, rejected:result.rejected };
      return result;
    } catch (err) {
      lastRun = { status:'error', at:now().toISOString(), error:err.code || err.message, received:0, upserted:0, rejected:0 };
      throw err;
    }
  }

  async function backfillDays(endDate,days=7) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) throw new TypeError('end_date_required');
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new TypeError('invalid_backfill_days');
    const end = new Date(`${endDate}T12:00:00Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return ingestRange({startDate:start.toISOString().slice(0,10),endDate});
  }

  async function ingestCompletedDay(businessDate) { return ingestRange({startDate:businessDate,endDate:businessDate}); }
  function health() {
    const adapterHealth = typeof adapter.health === 'function' ? adapter.health() : {healthy:false,usable:false,health:'unavailable'};
    const storeHealth = typeof store.health === 'function' ? store.health() : {healthy:true,writable:true};
    return { provider:'orderbird', source_kind:'pos_revenue_ground_truth', attribution_kind:'none', adapter:adapterHealth, store:storeHealth, last_run:{...lastRun}, healthy:Boolean(adapterHealth.usable && storeHealth.healthy && lastRun.status !== 'error') };
  }

  return { ingestRange, backfill7Days:(endDate)=>backfillDays(endDate,7), backfillDays, ingestCompletedDay, health };
}

module.exports = { createOrderbirdIngestion };
