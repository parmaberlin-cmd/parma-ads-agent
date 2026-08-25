const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyBookingSource}=require('../ga4-shadow-data');

test('classifies Google paid and organic separately',()=>{
 assert.equal(classifyBookingSource('google','cpc'),'google_paid');
 assert.equal(classifyBookingSource('google','organic'),'google_organic');
});

test('classifies Meta paid and organic separately',()=>{
 assert.equal(classifyBookingSource('instagram','paid_social'),'meta_paid');
 assert.equal(classifyBookingSource('facebook.com','referral'),'meta_organic');
});

test('classifies direct and other acquisition without exposing raw source values',()=>{
 assert.equal(classifyBookingSource('(direct)','(none)'),'direct');
 assert.equal(classifyBookingSource('newsletter','email'),'other');
 assert.equal(classifyBookingSource('partner.example','referral'),'referral');
});