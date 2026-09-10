'use strict';

const {
  validateInstagramPublication,
  executeInstagramPublication,
  validatePublicationPackage,
} = require('./instagram-organic-publication');
const {
  validateStableVideoUrl,
} = require('./instagram-media-host');

const STORY_DISCOVERY_STATUS = Object.freeze({
  VERIFIED_LIVE: 'VERIFIED_LIVE',
  SUPPORTED_NOT_YET_TESTED: 'SUPPORTED_NOT_YET_TESTED',
  NOT_AVAILABLE_FROM_PROVIDER: 'NOT_AVAILABLE_FROM_PROVIDER',
});

function normalizeStories(rows = []) {
  return (rows || [])
    .filter(row => String(row?.media_product_type || row?.media_type || '').toUpperCase() === 'STORIES')
    .map(row => ({
      id: String(row.id || ''),
      media_type: 'STORIES',
      timestamp: row.timestamp || null,
      permalink: row.permalink || null,
      thumbnail_url: row.thumbnail_url || null,
      media_url: row.media_url || null,
      has_media_url: Boolean(row.media_url),
    }));
}

async function discoverStories({ transport } = {}) {
  if (!transport || typeof transport.get !== 'function') throw new TypeError('instagram_transport_required');
  const account = await transport.get('/me', {
    fields: 'id,user_id,username,account_type,media_count',
  });
  const first = await transport.get('/me/media', {
    fields: 'id,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url',
    limit: 100,
  });
  const stories = normalizeStories(first?.data || []);
  return {
    schema: 'instagram.story_discovery.v1',
    account: {
      username: account?.username || null,
      account_type: account?.account_type || null,
      media_count: account?.media_count || 0,
    },
    stories_count: stories.length,
    stories,
    historical_depth: 'only_currently_visible_media',
    status: stories.length ? STORY_DISCOVERY_STATUS.VERIFIED_LIVE : STORY_DISCOVERY_STATUS.NOT_AVAILABLE_FROM_PROVIDER,
    contains_secret: false,
  };
}

function buildStoryPublicationPackage(input = {}, { now = Date.now } = {}) {
  const blockers = [];
  if (!input || typeof input !== 'object') return { ok: false, blockers: ['story_package_required'] };
  if (String(input.media_type || '').toUpperCase() !== 'STORIES') blockers.push('story_media_type_required');
  if (input.caption !== undefined && input.caption !== null && input.caption !== '') blockers.push('story_caption_not_supported');
  if (!input.media_url) blockers.push('stable_story_media_url_required');
  else {
    const urlCheck = validateStableVideoUrl(input.media_url);
    if (!urlCheck.ok) blockers.push(...urlCheck.blockers);
  }
  const packageCheck = validatePublicationPackage({ ...input, media_type: 'STORIES', caption: '' }, { now });
  if (!packageCheck.ok) blockers.push(...packageCheck.blockers);
  return {
    ok: blockers.length === 0,
    blockers: [...new Set(blockers)],
    package: blockers.length === 0 ? { ...input, media_type: 'STORIES', caption: '' } : null,
  };
}

function validateStoryPublication(options = {}) {
  const built = buildStoryPublicationPackage(options.publicationPackage, { now: options.now });
  if (!built.ok) {
    return {
      status: 'BLOCKED',
      blockers: built.blockers,
      interface: 'VALIDATE_PUBLICATION',
      publication_id: options.publicationPackage?.publication_id || null,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
      media_type: 'STORIES',
    };
  }
  return validateInstagramPublication({
    ...options,
    publicationPackage: built.package,
  });
}

function executeStoryPublication(options = {}) {
  const built = buildStoryPublicationPackage(options.publicationPackage, { now: options.now });
  if (!built.ok) {
    return Promise.resolve({
      status: 'BLOCKED',
      blockers: built.blockers,
      interface: 'EXECUTE_PUBLICATION',
      publication_id: options.publicationPackage?.publication_id || null,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
      media_type: 'STORIES',
    });
  }
  return executeInstagramPublication({
    ...options,
    publicationPackage: built.package,
  });
}

module.exports = {
  STORY_DISCOVERY_STATUS,
  normalizeStories,
  discoverStories,
  buildStoryPublicationPackage,
  validateStoryPublication,
  executeStoryPublication,
};
