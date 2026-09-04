'use strict';
const { runRuntimePreflight } = require('./google-write-runtime');
setImmediate(() => { runRuntimePreflight().catch(() => {}); });
