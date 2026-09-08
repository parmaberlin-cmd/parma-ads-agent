#!/usr/bin/env node
'use strict';

const {
  facebookGraphReadTransport,
  instagramLoginWriteTransport,
} = require('../instagram-organic-read-path');
const {
  validateOnlyInstagramCanary,
  executeInstagramCanary,
} = require('../instagram-organic-canary');

async function main() {
  const mode = process.argv[2];
  if (!['VALIDATE_ONLY', 'EXECUTE_CANARY'].includes(mode)) {
    console.error('usage: node scripts/run-instagram-organic-canary.js VALIDATE_ONLY|EXECUTE_CANARY');
    process.exitCode = 2;
    return;
  }

  const env = process.env;
  const mediaUrl = env.INSTAGRAM_CANARY_MEDIA_URL;
  const mediaAsset = mediaUrl ? {
    media_type: env.INSTAGRAM_CANARY_MEDIA_TYPE || 'REELS',
    video_url: mediaUrl,
    caption: env.INSTAGRAM_CANARY_CAPTION || '',
  } : null;
  const facebookTransport = env.META_ACCESS_TOKEN
    ? facebookGraphReadTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;
  const loginTransport = env.META_ACCESS_TOKEN
    ? instagramLoginWriteTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;

  const common = {
    env,
    transport: facebookTransport,
    loginTransport,
    preferredReadPath: env.INSTAGRAM_ORGANIC_CANARY_READ_PATH || 'instagram_login',
    adAccountId: env.META_AD_ACCOUNT_ID,
    username: env.INSTAGRAM_CANARY_USERNAME,
    mediaAsset,
    instagramUserId: env.INSTAGRAM_CANARY_IG_USER_ID,
  };

  const result = mode === 'VALIDATE_ONLY'
    ? await validateOnlyInstagramCanary(common)
    : await executeInstagramCanary(common);
  console.log(JSON.stringify(result));
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKED', blockers: [error.message], writes_executed: 0 }));
  process.exitCode = 1;
});
