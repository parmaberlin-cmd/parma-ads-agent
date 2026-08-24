const test=require('node:test');
const assert=require('node:assert/strict');
const {googleRuntimeConfigDiagnostics}=require('../google-runtime-config-diagnostics');

test('Google runtime diagnostics expose only shape booleans and lengths',()=>{
 const env={GOOGLE_DEVELOPER_TOKEN:'ABcdeFGH93KL-NOPQ_STUv',GOOGLE_CUSTOMER_ID:'123-456-7890',GOOGLE_LOGIN_CUSTOMER_ID:'111-222-3333',GOOGLE_CLIENT_ID:'x',GOOGLE_CLIENT_SECRET:'y',GOOGLE_REFRESH_TOKEN:'z'};
 const result=googleRuntimeConfigDiagnostics(env);
 assert.equal(result.developer_token_present,true);
 assert.equal(result.developer_token_length,22);
 assert.equal(result.developer_token_length_ok,true);
 assert.equal(result.developer_token_charset_ok,true);
 assert.equal(result.developer_token_trim_clean,true);
 assert.equal(result.customer_id_length_ok,true);
 assert.equal(result.login_customer_configured,true);
 assert.equal(result.login_customer_length_ok,true);
 assert.equal(result.exposes_secret_values,false);
 assert.equal(result.writes_allowed,false);
 assert.equal(JSON.stringify(result).includes(env.GOOGLE_DEVELOPER_TOKEN),false);
});

test('hidden whitespace is detected without exposing the token',()=>{
 const result=googleRuntimeConfigDiagnostics({GOOGLE_DEVELOPER_TOKEN:' ABcdeFGH93KL-NOPQ_STUv\n',GOOGLE_CUSTOMER_ID:'1234567890'});
 assert.equal(result.developer_token_length_ok,true);
 assert.equal(result.developer_token_trim_clean,false);
 assert.equal(result.developer_token_charset_ok,true);
});

test('invalid customer and login-customer shapes fail diagnostics only',()=>{
 const result=googleRuntimeConfigDiagnostics({GOOGLE_DEVELOPER_TOKEN:'short',GOOGLE_CUSTOMER_ID:'123',GOOGLE_LOGIN_CUSTOMER_ID:'456'});
 assert.equal(result.developer_token_length_ok,false);
 assert.equal(result.customer_id_length_ok,false);
 assert.equal(result.login_customer_length_ok,false);
 assert.equal(result.writes_allowed,false);
});