'use strict';

const path = require('node:path');

function safeAssetFilename(name) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.mp4$/.test(String(name || ''));
}

function validateStableVideoUrl(value) {
  const blockers = [];
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return { ok: false, blockers: ['stable_video_url_invalid'] };
  }
  if (url.protocol !== 'https:') blockers.push('stable_video_url_not_https');
  if (url.search) blockers.push('stable_video_url_must_not_be_signed');
  if (!String(url.pathname).toLowerCase().endsWith('.mp4')) blockers.push('stable_video_url_not_mp4');
  const filename = url.pathname.split('/').at(-1);
  if (!safeAssetFilename(filename)) blockers.push('stable_video_filename_invalid');
  return { ok: blockers.length === 0, blockers, url, filename };
}

function buildStableVideoUrl({ baseUrl, filename } = {}) {
  if (!/^https:\/\//.test(String(baseUrl || ''))) throw new TypeError('stable_asset_base_url_must_be_https');
  if (!safeAssetFilename(filename)) throw new TypeError('stable_asset_filename_invalid');
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}/instagram-canary-assets/${filename}`;
}

function registerInstagramMediaHost(app, { env = process.env, assetDir = null } = {}) {
  if (!app || typeof app.get !== 'function') throw new TypeError('express_app_required');
  const root = path.resolve(assetDir || env.INSTAGRAM_ORGANIC_ASSET_DIR || '/data/instagram-organic-assets');

  app.get('/instagram-canary-assets/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!safeAssetFilename(filename)) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    const file = path.resolve(root, filename);
    if (!file.startsWith(`${root}${path.sep}`)) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(file, error => {
      if (error && !res.headersSent) {
        res.status(404).json({ success: false, error: 'Not found' });
      }
    });
  });
}

module.exports = {
  safeAssetFilename,
  validateStableVideoUrl,
  buildStableVideoUrl,
  registerInstagramMediaHost,
};
