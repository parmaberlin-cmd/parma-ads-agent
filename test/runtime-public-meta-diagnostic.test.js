const test = require('node:test');
const assert = require('node:assert/strict');
const { publicMetaDiagnostic } = require('../runtime-public-view');

test('public Meta diagnostics expose aggregate categories and safe codes only', () => {
  const view = publicMetaDiagnostic({
    access_ok:true,
    overview:{
      campaign_counts:{active:0,with_issues:5},
      issue_report:{
        affected_objects:5,
        issue_count:15,
        issue_categories:{unknown:12,policy_or_review:3},
        issue_reasons:{account_security_or_payment_restriction:12,policy_or_review:3},
        unknown_codes:{'1885316':7},
        objects:[{id:'private-object-id',name:'private campaign'}],
      },
    },
  });
  assert.equal(view.issue_count, 15);
  assert.deepEqual(view.unknown_issue_codes, {'1885316':7});
  assert.equal(view.issue_reasons.account_security_or_payment_restriction, 12);
  assert.equal(JSON.stringify(view).includes('private'), false);
});
