'use strict';
const fs = require('node:fs');
const path = require('node:path');

function keyFor(row) { return `${row.source}:${row.business_date}`; }

function createJsonAggregateStore({ filePath = path.join(process.cwd(),'state','orderbird-revenue-aggregates.json') } = {}) {
  function readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath,'utf8'));
      return parsed && typeof parsed === 'object' && parsed.rows ? parsed : { schema_version:1, rows:{} };
    } catch (err) {
      if (err.code === 'ENOENT') return { schema_version:1, rows:{} };
      throw err;
    }
  }
  function writeState(state) {
    fs.mkdirSync(path.dirname(filePath),{recursive:true});
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp,`${JSON.stringify(state,null,2)}\n`,{mode:0o600});
    fs.renameSync(tmp,filePath);
  }
  return {
    async upsert(row) {
      const state = readState();
      const key = keyFor(row);
      const previous = state.rows[key] || null;
      state.rows[key] = structuredClone(row);
      writeState(state);
      return { key, inserted:previous === null, updated:previous !== null };
    },
    async get(source,businessDate) { return readState().rows[`${source}:${businessDate}`] || null; },
    async list() { return Object.values(readState().rows).map((x)=>structuredClone(x)); },
    health() {
      try { readState(); return { healthy:true, writable:true, file_path:filePath }; }
      catch (err) { return { healthy:false, writable:false, reason:err.code || err.message }; }
    }
  };
}

module.exports = { createJsonAggregateStore, keyFor };
