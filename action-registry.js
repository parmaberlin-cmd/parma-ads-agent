'use strict';

const ACTIONS=Object.freeze({
  run_diagnostics:{specialist:'runtime',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'runtime:diagnostics'},
  generate_report:{specialist:'runtime',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'runtime:report'},
  'runtime.register_recurring':{specialist:'runtime',write:'internal',spend:false,authorization:'controlled_internal',concurrency:'runtime:scheduler'},
  'google_ads.read_campaign':{specialist:'google_ads',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'google_ads:read'},
  'google_ads.propose_changes':{specialist:'google_ads',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'google_ads:proposal'},
  'google_ads.execution_preflight':{specialist:'google_ads',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'google_ads:preflight'},
  'google_ads.cycle_plan':{specialist:'google_ads',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'google_ads:plan'},
  'google_ads.execute_authorized':{specialist:'google_ads',write:'controlled_external',spend:'standing_delegation_only',authorization:'standing_delegation_required',concurrency:'google_ads:account_mutation'},
  'instagram.audit_capability':{specialist:'meta',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'meta:read'},
  'instagram.publish_preflight':{specialist:'meta',write:false,spend:false,authorization:'autonomous_read_only',concurrency:'meta:content_preflight'},
  // Future contract only. No runtime handler or autonomous authorization is installed here.
  'instagram.publish':{specialist:'meta',write:'external',spend:false,authorization:'explicit_instagram_content_delegation_required',concurrency:'meta:content_publish',implemented:false},
  'ga4.read_conversion_integrity':{specialist:'ga4',write:false,spend:false,authorization:'provider_read_required',concurrency:'ga4:read',implemented:false},
  'orderbird.read_revenue':{specialist:'orderbird',write:false,spend:false,authorization:'official_provider_read_required',concurrency:'orderbird:read',implemented:false},
});

function describeAction(kind){
  const row=ACTIONS[String(kind||'')];
  if(!row)return {kind:String(kind||''),specialist:'unregistered',write:'unknown',spend:'unknown',authorization:'unregistered_action',concurrency:null,implemented:false};
  return {kind:String(kind),implemented:row.implemented!==false,...row};
}
function listActions(){return Object.keys(ACTIONS).sort().map(describeAction);}
function writeAuthorized(kind){const d=describeAction(kind);return d.write===false||d.write==='internal'?'not_applicable':d.authorization;}
function spendAuthorized(kind){const d=describeAction(kind);return d.spend===false?'not_applicable':d.spend;}

module.exports={ACTIONS,describeAction,listActions,writeAuthorized,spendAuthorized};
