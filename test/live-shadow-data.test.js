const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getDateRange,
  googleConfigured,
  metaConfigured,
  flattenGoogleErrorCode,
  googleDiagnosticReason,
  cleanGoogleDiagnostic,
  collectMetaPages,
} = require("../live-shadow-data");

test("live shadow collectors fail closed when credentials are absent", () => {
  assert.equal(googleConfigured({}), false);
  assert.equal(metaConfigured({}), false);
});

test("live shadow collectors detect complete credential presence without exposing values", () => {
  assert.equal(googleConfigured({ GOOGLE_CLIENT_ID:"x", GOOGLE_CLIENT_SECRET:"x", GOOGLE_DEVELOPER_TOKEN:"x", GOOGLE_REFRESH_TOKEN:"x", GOOGLE_CUSTOMER_ID:"x" }), true);
  assert.equal(metaConfigured({ META_ACCESS_TOKEN:"x", META_AD_ACCOUNT_ID:"x" }), true);
});

test("date range uses completed days only", () => {
  const range = getDateRange(2, new Date("2026-08-21T12:00:00Z"));
  assert.deepEqual(range, { start:"2026-08-19", end:"2026-08-20" });
});

test("structured Google error codes are flattened without losing the specific detail", () => {
  assert.deepEqual(flattenGoogleErrorCode({ authorization_error: "DEVELOPER_TOKEN_NOT_APPROVED" }), { family:"authorization_error", detail:"DEVELOPER_TOKEN_NOT_APPROVED" });
  assert.deepEqual(flattenGoogleErrorCode({ authentication_error: { code:"OAUTH_TOKEN_INVALID" } }), { family:"authentication_error", detail:"OAUTH_TOKEN_INVALID" });
});

test("developer token diagnostics distinguish access-level gating from invalid token", () => {
  assert.equal(googleDiagnosticReason('developer_token','developer token not approved for Basic Access',null),'basic_access_required');
  assert.equal(googleDiagnosticReason('developer_token','', 'DEVELOPER_TOKEN_NOT_APPROVED'),'basic_access_required');
  assert.equal(googleDiagnosticReason('developer_token','developer token is not valid',null),'developer_token_invalid');
  assert.equal(googleDiagnosticReason('developer_token','', 'DEVELOPER_TOKEN_INVALID'),'developer_token_invalid');
});

test("Google diagnostic matrix categorizes external and query failures", () => {
  const cases = [
    [{message:'invalid_grant refresh token expired'}, 'oauth', 'oauth_refresh_required'],
    [{message:'USER_PERMISSION_DENIED for customer'}, 'account_access', 'account_access_required'],
    [{message:'GAQL query field is invalid'}, 'query', 'query_rejected'],
    [{message:'deadline timeout ECONNRESET'}, 'network', 'transient_network'],
    [{errors:[{message:'Token not approved',error_code:{authorization_error:'DEVELOPER_TOKEN_NOT_APPROVED'}}]}, 'developer_token', 'basic_access_required'],
    [{errors:[{message:'Developer token invalid',error_code:{authorization_error:'DEVELOPER_TOKEN_INVALID'}}]}, 'developer_token', 'developer_token_invalid'],
  ];
  for (const [error, category, reason] of cases) {
    const result=cleanGoogleDiagnostic(error);
    assert.equal(result.category,category);
    assert.equal(result.reason,reason);
    assert.equal(result.error,'google_read_failed');
  }
});

test("Meta pagination follows sanitized cursors and collects all pages", async () => {
  const calls=[];
  const client={get:async(endpoint,{params})=>{
    calls.push({endpoint,params});
    if(!params.after)return{data:{data:[{id:'1'}],paging:{next:'https://example.invalid/token-in-url',cursors:{after:'NEXT'}}}};
    return{data:{data:[{id:'2'}]}};
  }};
  const result=await collectMetaPages({client,endpoint:'/act_x/campaigns',params:{fields:'id'},accessToken:'SECRET',maxPages:5});
  assert.equal(result.truncated,false);
  assert.deepEqual(result.items.map(x=>x.id),['1','2']);
  assert.equal(calls.length,2);
  assert.equal(calls[1].endpoint,'/act_x/campaigns');
  assert.equal(calls[1].params.after,'NEXT');
});

test("Meta pagination fails closed as truncated after the page cap", async () => {
  const client={get:async()=>({data:{data:[{}],paging:{next:'x',cursors:{after:'NEXT'}}}})};
  const result=await collectMetaPages({client,endpoint:'/x',accessToken:'secret',maxPages:2});
  assert.equal(result.truncated,true);
  assert.equal(result.pages,2);
});