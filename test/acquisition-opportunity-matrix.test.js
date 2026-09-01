const test=require('node:test'); const assert=require('node:assert/strict');
const {opportunity,matrix}=require('../acquisition-opportunity-matrix');
test('ranks strong evidence-supported structural opportunity without claiming customer value',()=>{const x=opportunity({intent_score:90,landing_continuity_score:80,structural_opportunity_score:75,evidence_confidence_score:80});assert.equal(x.tier,'high');assert.equal(x.observed_customer_value,false);assert.equal(x.execution_authorized,false);});
test('matrix sorts descending',()=>{const x=matrix([{id:'a',intent_score:20},{id:'b',intent_score:90,landing_continuity_score:90,structural_opportunity_score:90,evidence_confidence_score:90}]);assert.equal(x[0].id,'b');});
