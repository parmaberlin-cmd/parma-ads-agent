#!/usr/bin/env node
'use strict';

const { validateOnlyCanary, executeCanary } = require('../google-ads-canary-runner');

async function main() {
  const command = process.argv[2];
  if (command === 'VALIDATE_ONLY') {
    const result = await validateOnlyCanary({ env: process.env });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'EXECUTE_CANARY') {
    const result = await executeCanary({ env: process.env });
    console.log(JSON.stringify(result));
    return;
  }
  console.error('usage: node scripts/run-google-ads-canary.js VALIDATE_ONLY|EXECUTE_CANARY');
  process.exitCode = 2;
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'BLOCKED', blockers: [error.message], writes_executed: 0 }));
  process.exitCode = 1;
});
