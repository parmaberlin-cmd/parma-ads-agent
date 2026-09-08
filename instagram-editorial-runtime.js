'use strict';

const { createInstagramOrganicAuditStore } = require('./meta-durable-audit');
const {
  facebookGraphReadTransport,
  instagramLoginWriteTransport,
} = require('./instagram-organic-read-path');
const { InstagramEditorialScheduler } = require('./instagram-editorial-timing');
const { executeInstagramPublication } = require('./instagram-organic-publication');

function createProductionExecutionCallback({ env, store, now = Date.now } = {}) {
  const facebookTransport = env.META_ACCESS_TOKEN
    ? facebookGraphReadTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;
  const loginTransport = env.META_ACCESS_TOKEN
    ? instagramLoginWriteTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;
  return async publicationPackage => executeInstagramPublication({
    publicationPackage,
    env,
    store,
    transport: facebookTransport,
    loginTransport,
    now,
    requireDurableMount: true,
  });
}

function startInstagramEditorialRuntime({
  env = process.env,
  store = null,
  scheduler = null,
  intervalMs = 60000,
  now = Date.now,
  execute = null,
} = {}) {
  const resolvedStore = store || createInstagramOrganicAuditStore({
    env,
    now,
    requireDurableMount: true,
  });
  const resolvedScheduler = scheduler || new InstagramEditorialScheduler({
    store: resolvedStore,
    now,
  });
  const callback = execute || createProductionExecutionCallback({
    env,
    store: resolvedStore,
    now,
  });

  resolvedScheduler.start({
    technical_ready: true,
    editorial_ready: true,
    execute: callback,
    intervalMs,
  });

  return {
    scheduler: resolvedScheduler,
    store: resolvedStore,
    stop: () => resolvedScheduler.stop(),
    wakeNow: () => resolvedScheduler.tick({
      technical_ready: true,
      editorial_ready: true,
      execute: callback,
    }),
  };
}

module.exports = {
  createProductionExecutionCallback,
  startInstagramEditorialRuntime,
};
