const test=require('node:test');const assert=require('node:assert/strict');const {runMetaPreflightAdversarialSuite}=require('../meta-preflight-adversarial');
test('all adversarial Meta preflight scenarios fail closed',()=>{const rows=runMetaPreflightAdversarialSuite();assert.ok(rows.length>=5);assert.ok(rows.every(r=>r.passed===true));});
