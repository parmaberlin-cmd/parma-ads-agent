'use strict';

const crypto = require('node:crypto');

const CONTENT_AUTONOMY_DEFAULT = Object.freeze({
  content_autonomy: true,
  publish_autonomy: false,
  media_types: Object.freeze(['REELS', 'STORIES']),
});

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function staleContentMarkers(caption, now = Date.now()) {
  const text = String(caption || '').toLowerCase();
  const markers = [];
  if (/\b(?:today|tonight|this weekend|this week)\b/.test(text)) markers.push('relative_date');
  if (/\b(?:20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(text)) markers.push('date_reference');
  if (/\b(?:€|eur|price|preis|offer|rabatt|discount|happy hour|ab \d|ab \d{1,2} uhr)\b/.test(text)) markers.push('price_or_offer');
  if (/\b(?:opening hours|öffnungszeiten|hours|mon|tue|wed|thu|fri|sat|sun)\b/.test(text)) markers.push('hours_reference');
  if (/\b(?:event|live|concert|special)\b/.test(text)) markers.push('event_reference');
  return { stale: markers.length > 0, markers };
}

function normalizeHistoricalMedia(rows = []) {
  return rows.map((row, index) => ({
    id: String(row?.id || row?.media_id || index),
    media_type: String(row?.media_type || row?.media_product_type || 'REELS').toUpperCase(),
    caption: String(row?.caption || ''),
    permalink: row?.permalink || null,
    timestamp: row?.timestamp || null,
    thumbnail_url: row?.thumbnail_url || null,
    insights: row?.insights || {},
    content_hash: row?.content_hash || stableHash({ id: String(row?.id || row?.media_id || index), caption: String(row?.caption || '') }),
  }));
}

function scoreHistoricalMedia(media) {
  const insights = media?.insights || {};
  const reach = numberOrZero(insights.reach);
  const views = numberOrZero(insights.views);
  const likes = numberOrZero(insights.likes);
  const comments = numberOrZero(insights.comments);
  const shares = numberOrZero(insights.shares);
  const saved = numberOrZero(insights.saved);
  return {
    score: reach + views + likes * 2 + comments * 3 + shares * 4 + saved * 5,
    metrics: { reach, views, likes, comments, shares, saved },
  };
}

function recentlyRepeated(media, history = [], { now = Date.now, recentWindowMs = 90 * 24 * 60 * 60 * 1000 } = {}) {
  const cutoff = now() - recentWindowMs;
  return (history || []).some(record => {
    if (record.content_hash && media.content_hash && record.content_hash === media.content_hash) return true;
    if (record.instagram_media_id && media.id && record.instagram_media_id === media.id) return true;
    return record.published_at && Date.parse(record.published_at) >= cutoff;
  });
}

function buildInstagramPublicationProposal({
  media,
  mediaType = 'REELS',
  caption = null,
  hook = null,
  cta = null,
  now = Date.now,
} = {}) {
  const type = String(mediaType || '').toUpperCase();
  if (!['REELS', 'STORIES'].includes(type)) throw new TypeError('mediaType must be REELS or STORIES');
  if (type === 'STORIES' && caption) throw new TypeError('Stories does not accept caption in this contract');
  const generatedCaption = caption || [hook, media?.caption, cta].filter(Boolean).join(' ').trim() || media?.caption || 'Parma fresh pasta in Berlin';
  return {
    schema: 'instagram.content_proposal.v1',
    media_source: media?.permalink || media?.thumbnail_url || media?.id || null,
    caption: type === 'REELS' ? generatedCaption : null,
    media_type: type,
    content_hash: stableHash({ media_source: media?.permalink || media?.thumbnail_url || media?.id || null, caption: type === 'REELS' ? generatedCaption : null, media_type: type }),
    generated_caption: Boolean(caption || hook || cta),
    publish_autonomy: false,
    content_autonomy: true,
    proposed_at: new Date(now()).toISOString(),
  };
}

function selectHistoricalCandidate({
  media = [],
  history = [],
  now = Date.now,
  preferNew = true,
  maxCandidates = 3,
} = {}) {
  const normalized = normalizeHistoricalMedia(media);
  const scored = normalized
    .filter(item => !staleContentMarkers(item.caption, now).stale)
    .filter(item => !recentlyRepeated(item, history, { now }))
    .map(item => ({ ...item, ...scoreHistoricalMedia(item) }));
  scored.sort((a, b) => {
    if (preferNew && a.timestamp && b.timestamp) return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    return b.score - a.score;
  });
  return scored.slice(0, maxCandidates);
}

module.exports = {
  CONTENT_AUTONOMY_DEFAULT,
  staleContentMarkers,
  normalizeHistoricalMedia,
  scoreHistoricalMedia,
  recentlyRepeated,
  buildInstagramPublicationProposal,
  selectHistoricalCandidate,
};
