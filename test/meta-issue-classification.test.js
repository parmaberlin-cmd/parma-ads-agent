const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyIssue, buildMetaIssueReport } = require('../meta-issue-classification');

test('classifies common Meta issue families', () => {
  assert.equal(classifyIssue({message:'Instagram account permission missing'}), 'asset_or_permission');
  assert.equal(classifyIssue({summary:'Creative video unavailable'}), 'creative_or_media');
  assert.equal(classifyIssue({message:'Ad rejected by policy review'}), 'policy_or_review');
  assert.equal(classifyIssue({message:'Invalid audience location'}), 'targeting_or_placement');
  assert.equal(classifyIssue({message:'Optimization goal incompatible with objective'}), 'delivery_configuration');
});

test('builds campaign-adset-ad report without inventing causes', () => {
  const report = buildMetaIssueReport({
    campaigns:[{id:'c1',name:'Dinner',issues:[{message:'Creative video unavailable'}]}],
    adsets:[{campaign_id:'c1',issues:[{message:'Invalid audience location'}]}],
    ads:[],
  });
  assert.equal(report.affected_objects, 2);
  assert.equal(report.categories.creative_or_media, 1);
  assert.equal(report.categories.targeting_or_placement, 1);
  assert.equal(report.objects[0].campaign_ref, 'c1');
});

test('unknown diagnostics remain unknown', () => {
  assert.equal(classifyIssue({message:'Unrecognized Meta condition'}), 'unknown');
});
