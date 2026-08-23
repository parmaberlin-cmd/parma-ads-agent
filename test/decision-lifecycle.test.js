const test=require("node:test");
const assert=require("node:assert/strict");
const {createDecision,transitionDecision,buildJournalEntry}=require("../decision-lifecycle");

test("decision lifecycle starts proposed and shadow-only",()=>{
  const d=createDecision({id:"d1",channel:"google",action:"review_search_terms",reason:"waste" ,now:new Date("2026-08-23T00:00:00Z")});
  assert.equal(d.status,"proposed");assert.equal(d.mode,"shadow");assert.equal(d.external_execution,false);
});

test("human approval can be recorded without execution",()=>{
  const d=createDecision({id:"d2",channel:"meta",action:"refresh_creative",reason:"fatigue"});
  const approved=transitionDecision(d,"approved");
  const pending=transitionDecision(approved,"execution_pending");
  assert.equal(pending.status,"execution_pending");assert.equal(pending.external_execution,false);
});

test("shadow lifecycle refuses executed transition",()=>{
  const d=createDecision({id:"d3",channel:"google",action:"change_budget",reason:"cpa"});
  const approved=transitionDecision(d,"approved");
  const pending=transitionDecision(approved,"execution_pending");
  assert.throws(()=>transitionDecision(pending,"executed"),/cannot execute external actions/);
});

test("rejected decisions become terminal and auditable",()=>{
  const d=createDecision({id:"d4",channel:"google",action:"negative_keyword",reason:"irrelevant"});
  const rejected=transitionDecision(d,"rejected",{note:"insufficient evidence"});
  assert.throws(()=>transitionDecision(rejected,"approved"),/terminal/);
  const journal=buildJournalEntry(rejected);
  assert.equal(journal.status,"rejected");assert.equal(journal.history.at(-1).note,"insufficient evidence");assert.equal(journal.external_execution,false);
});
