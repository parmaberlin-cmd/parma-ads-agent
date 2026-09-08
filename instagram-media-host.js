'use strict';

const path = require('node:path');

function safeAssetFilename(name) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.mp4$/.test(String(name || ''));
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
  registerInstagramMediaHost,
};
