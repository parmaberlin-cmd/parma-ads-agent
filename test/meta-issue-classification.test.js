const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyIssue, issueReason, safeIssueCode, buildMetaIssueReport } = require('../meta-issue-classification');

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

test('classifies Meta automatic security or payment pause without inventing a creative fault', () => {
  const issue = {code:'2490455'};
  assert.equal(classifyIssue(issue), 'account_or_billing');
  assert.equal(issueReason(issue), 'account_security_or_payment_restriction');
  const report = buildMetaIssueReport({ads:[{issues:[issue,issue]}]});
  assert.deepEqual(report.issue_categories, {account_or_billing:2});
  assert.deepEqual(report.issue_reasons, {account_security_or_payment_restriction:2});
  assert.deepEqual(report.unknown_codes, {});
});

test('report counts individual issues and exposes only safe unknown codes', () => {
  const report = buildMetaIssueReport({
    campaigns: [{ id:'private', issues:[
      { code:'1885316', message:'Unrecognized Meta condition' },
      { code:'bad secret text', message:'Another unrecognized condition' },
      { code:'POLICY_REVIEW', message:'Ad rejected by policy review' },
    ] }],
  });
  assert.equal(report.issue_count, 3);
  assert.deepEqual(report.issue_categories, { unknown:2, policy_or_review:1 });
  assert.deepEqual(report.unknown_codes, { '1885316':1 });
  assert.equal(JSON.stringify(report.unknown_codes).includes('secret'), false);
  assert.equal(safeIssueCode('123456789012345'), null);
});
