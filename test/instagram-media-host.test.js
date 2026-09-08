'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { registerInstagramMediaHost, safeAssetFilename } = require('../instagram-media-host');

test('asset filename allowlist prevents traversal and non-mp4 files', () => {
  assert.equal(safeAssetFilename('C9M7_b6MayR.mp4'), true);
  assert.equal(safeAssetFilename('../secret.mp4'), false);
  assert.equal(safeAssetFilename('secret.txt'), false);
});

test('media host serves only safe mp4 files from the configured asset directory', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'instagram-media-host-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'C9M7_b6MayR.mp4'), 'fake-video');
  const app = express();
  registerInstagramMediaHost(app, { env: { INSTAGRAM_ORGANIC_ASSET_DIR: root } });
  const invoke = url => new Promise(resolve => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; resolve({ status: this.statusCode, contentType: this.headers['content-type'], body: this.body }); },
      sendFile(file, callback) {
        if (file === path.join(root, 'C9M7_b6MayR.mp4')) {
          this.body = 'fake-video';
          resolve({ status: this.statusCode, contentType: this.headers['content-type'], body: this.body });
        } else {
          callback(new Error('missing'));
        }
      },
    };
    app({ method: 'GET', url, headers: {} }, res);
  });
  const ok = await invoke('/instagram-canary-assets/C9M7_b6MayR.mp4');
  assert.equal(ok.status, 200);
  assert.equal(ok.contentType, 'video/mp4');
  const traversal = await invoke('/instagram-canary-assets/..%2F..%2Fsecret.mp4');
  assert.equal(traversal.status, 404);
});
