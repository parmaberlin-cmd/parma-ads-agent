'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ControlledAdsStore } = require('./ads-controlled-execution-core');

const META_DOMAIN_CONFIG = Object.freeze({
  META_ADS_EXECUTION: {
    keyEnv: 'META_ADS_AUDIT_INTEGRITY_KEY',
    pathEnv: 'META_ADS_AUDIT_PATH',
    subpath: 'parma-meta-ads-audit',
  },
  META_ORGANIC_PUBLISHING: {
    keyEnv: 'INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY',
    pathEnv: 'INSTAGRAM_ORGANIC_AUDIT_PATH',
    subpath: 'parma-instagram-organic-audit',
  },
});

function integrityKeyAvailable(env, domain) {
  const config = META_DOMAIN_CONFIG[domain];
  if (!config) return false;
  const value = env?.[config.keyEnv];
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 32;
}

function integrityKey(env, domain) {
  const config = META_DOMAIN_CONFIG[domain];
  if (!integrityKeyAvailable(env, domain)) throw new Error('audit_integrity_key_unavailable');
  return crypto.createHash('sha256').update(`parma-meta-domain-audit-v1:${domain}:${env[config.keyEnv]}`).digest();
}

function resolveAuditPath(env, domain, auditPath = null) {
  const config = META_DOMAIN_CONFIG[domain];
  if (!config) return null;
  if (auditPath) return auditPath;
  if (env[config.pathEnv]) return env[config.pathEnv];
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (typeof mount === 'string' && mount.trim()) return path.join(mount, config.subpath);
  return null;
}

function durableMountVerified(env, auditPath) {
  const expected = [
    auditPath,
    env.RAILWAY_VOLUME_MOUNT_PATH,
    '/data',
  ].filter(value => typeof value === 'string' && value.trim());
  if (!expected.length) return false;
  try {
    const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    return expected.some(candidate => mountinfo.split('\n').some(line => line.split(' ').includes(candidate)));
  } catch {
    return false;
  }
}

function createMetaDomainAuditStore({
  env = process.env,
  domain,
  now = Date.now,
  auditPath = null,
  requireDurableMount = true,
} = {}) {
  const key = integrityKey(env, domain);
  const resolved = resolveAuditPath(env, domain, auditPath);
  if (!resolved || !path.isAbsolute(resolved) || resolved === path.parse(resolved).root) {
    throw new Error('audit_path_unavailable');
  }

  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('audit_path_unavailable');
  }
  if (stat && !stat.isDirectory()) throw new Error('audit_path_unwritable');
  if (requireDurableMount && !durableMountVerified(env, resolved)) throw new Error('durable_audit_mount_unverified');

  return new ControlledAdsStore({ directory: resolved, integrityKey: key, now });
}

function createMetaAdsAuditStore(options = {}) {
  return createMetaDomainAuditStore({ ...options, domain: 'META_ADS_EXECUTION' });
}

function createInstagramOrganicAuditStore(options = {}) {
  return createMetaDomainAuditStore({ ...options, domain: 'META_ORGANIC_PUBLISHING' });
}

module.exports = {
  META_DOMAIN_CONFIG,
  integrityKeyAvailable,
  integrityKey,
  resolveAuditPath,
  durableMountVerified,
  createMetaDomainAuditStore,
  createMetaAdsAuditStore,
  createInstagramOrganicAuditStore,
};
