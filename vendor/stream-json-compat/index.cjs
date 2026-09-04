'use strict';
// Node >=22.12 supports requiring this synchronous ESM module.
// No legacy parser/filter code is copied or retained.
const { parserStream } = require('stream-json-modern');
function Parser(options) { return parserStream(options); }
module.exports = { Parser, parser: options => parserStream(options) };
