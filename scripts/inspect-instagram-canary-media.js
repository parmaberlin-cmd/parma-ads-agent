#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { instagramLoginReadTransport } = require('../instagram-organic-read-path');
const { discoverInstagramReelAssets } = require('../meta-paused-draft');
const { staleContentMarkers } = require('../instagram-content-autonomy');

const REEL_PERMALINK = 'https://www.instagram.com/reel/C9M7_b6MayR/';
const OUTPUT_FILE = '/tmp/ig-canary-selected-media-url';

function urlInfo(value) {
  if (!value) return { https: false, protocol: null, hostname: null, has_query: false, length: 0 };
  try {
    const url = new URL(value);
    return {
      https: url.protocol === 'https:',
      protocol: url.protocol,
      hostname: url.hostname,
      has_query: Boolean(url.search),
      length: value.length,
    };
  } catch {
    return { https: false, protocol: null, hostname: null, has_query: false, length: 0 };
  }
}

async function main() {
  const env = process.env;
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) {
    throw new Error('meta_read_configuration_missing');
  }
  const transport = instagramLoginReadTransport({
    accessToken: env.META_ACCESS_TOKEN,
  });
  const username = env.INSTAGRAM_CANARY_USERNAME || 'parma.divinibenedetti';
  const account = await transport.get('/me', {
    fields: 'id,user_id,username,account_type,media_count',
  });
  if (String(account?.username || '').toLowerCase() !== username.toLowerCase()) {
    throw new Error('instagram_username_not_verified');
  }

  let media = null;
  let after = null;
  for (let page = 0; page < 5 && !media; page += 1) {
    const collection = await transport.get('/me/media', {
      fields: 'id,caption,media_type,media_product_type,media_url,permalink,timestamp,thumbnail_url',
      limit: 100,
      ...(after ? { after } : {}),
    });
    media = (collection?.data || []).find(item => String(item?.permalink || '').replace(/\/$/, '') === REEL_PERMALINK.replace(/\/$/, '')) || null;
    after = collection?.paging?.cursors?.after || null;
    if (!collection?.paging?.next) break;
  }
  if (!media) throw new Error('known_parma_reel_not_found_in_live_inventory');

  const info = urlInfo(media.media_url);
  const stale = staleContentMarkers(media.caption, () => Date.now());
  let insights = null;
  try {
    const response = await transport.get(`/${media.id}/insights`, {
      metric: 'reach,views,likes,comments,shares,saved,total_interactions',
    });
    insights = response?.data || null;
  } catch {
    insights = null;
  }

  const sanitized = {
    status: info.https ? 'VALID_HTTPS_MEDIA_URL' : 'NO_VALID_MEDIA_URL',
    instagram_user_id: account.user_id || account.id,
    source_instagram_media_id: media.id,
    permalink: media.permalink,
    media_type: media.media_type || null,
    media_product_type: media.media_product_type || null,
    timestamp: media.timestamp || null,
    caption: media.caption || null,
    stale_markers: stale,
    media_url: {
      https: info.https,
      protocol: info.protocol,
      hostname: info.hostname,
      has_query: info.has_query,
      length: info.length,
    },
    insights_available: Boolean(insights),
    insights,
  };
  console.log(JSON.stringify(sanitized));

  if (!info.https || !media.media_url) {
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(OUTPUT_FILE, `${media.media_url}\n`, { mode: 0o600 });
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKED', blockers: [error.message], writes_executed: 0 }));
  process.exitCode = 1;
});
