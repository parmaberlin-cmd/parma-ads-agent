const test = require("node:test");
const assert = require("node:assert/strict");
const { selectNextAutonomousAction } = require("../next-action-engine");

test("external Wix blocker does not stop unrelated autonomous work", () => {const out=selectNextAutonomousAction([{id:"EXT-1",priority:"P0",status:"BLOCKED_EXTERNAL",blocker_type:"external_access"},{id:"AUTO-1",priority:"P1",status:"READY",blocker_type:"software",autonomous:true}]);assert.equal(out.selected.id,"AUTO-1");assert.equal(out.stopped_for_user,false)});
test("permission gates are never selected as autonomous work",()=>{const out=selectNextAutonomousAction([{id:"GATE",priority:"P0",status:"BLOCKED_PERMISSION",blocker_type:"permission_gate"}]);assert.equal(out.selected,null);assert.equal(out.stopped_for_user,true)});
test("done-to-boundary items are terminal and do not crowd out green work",()=>{const out=selectNextAutonomousAction([{id:"A",priority:"P0",status:"DONE_TO_ACCESS_BOUNDARY"},{id:"B",priority:"P1",status:"READY_GREEN"}]);assert.equal(out.selected.id,"B")});
test("unresolved dependency is skipped while independent work continues",()=>{const out=selectNextAutonomousAction([{id:"EXT",priority:"P0",status:"BLOCKED_EXTERNAL"},{id:"DEP",priority:"P0",status:"READY_GREEN",dependencies:["EXT"]},{id:"FREE",priority:"P1",status:"READY_GREEN"}]);assert.equal(out.selected.id,"FREE");assert.equal(out.stopped_for_user,false)});
test("completed dependency unlocks dependent task",()=>{const out=selectNextAutonomousAction([{id:"BASE",priority:"P1",status:"DONE"},{id:"NEXT",priority:"P0",status:"READY_GREEN",dependencies:["BASE"]}]);assert.equal(out.selected.id,"NEXT")});
