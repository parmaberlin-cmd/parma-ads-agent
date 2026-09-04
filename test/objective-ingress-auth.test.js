'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const auth=require('../objective-ingress-auth');

test('objective ingress auth module exposes dedicated short-lived audience',()=>{
  assert.equal(auth.AUDIENCE,'parma-autonomous-objective-ingress');
  assert.equal(typeof auth.verify,'function');
  assert.equal(typeof auth.authorize,'function');
});
