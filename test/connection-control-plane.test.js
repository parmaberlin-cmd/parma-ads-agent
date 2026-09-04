'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {listConnections,connectionHealth,canUseCapability,humanActionNeeded}=require('../connection-registry');
const {buildConnectionsView,buildConnectionsHealth,resolveCapability}=require('../connection-api');

test('registry exposes sanitized named connections',()=>{const rows=listConnections();assert.ok(rows.length>=6);assert.ok(rows.every(x=>x.id&&x.system&&Array.isArray(x.capabilities)));assert.equal(JSON.stringify(rows).includes('token'),false);});
test('known healthy read capability is allowed',()=>{assert.equal(canUseCapability('google_ads','campaign_read').allowed,true);});
test('all mutation requests fail closed',()=>{assert.deepEqual(canUseCapability('google_ads','campaign_read',{mutation:true}).allowed,false);assert.equal(resolveCapability({connectionId:'wix',capability:'reservation_read',mutation:true}).mutation_permission,false);});
test('unknown connection and unknown capability fail closed',()=>{assert.equal(canUseCapability('missing','read').allowed,false);assert.equal(canUseCapability('ga4','made_up').allowed,false);});
test('degraded verified read remains usable but not healthy',()=>{const h=connectionHealth('meta');assert.equal(h.usable,true);assert.equal(h.healthy,false);});
test('healthy connection needs no human action',()=>{assert.equal(humanActionNeeded('wix').needed,false);});
test('views are explicitly read only',()=>{assert.equal(buildConnectionsView().mutation_permission,false);assert.equal(buildConnectionsHealth().mutation_permission,false);assert.equal(buildConnectionsHealth().summary.total,listConnections().length);});
test('missing capability request is rejected',()=>{assert.equal(resolveCapability({connectionId:'ga4'}).success,false);});
