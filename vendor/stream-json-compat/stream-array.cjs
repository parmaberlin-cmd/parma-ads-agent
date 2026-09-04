'use strict';
const { streamArray } = require('stream-json-modern/streamers/stream-array.js');
module.exports = { streamArray: options => streamArray.asStream(options) };
