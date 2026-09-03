'use strict';

const { listConnections, connectionHealth } = require('./connection-registry');

function envPresent(env, names) {
  return names.every((name) => typeof env[name] === 'string' && env[name].trim().length > 0);
}

function runtimeEvidence(env = process.env) {
  return {
    google_ads: {
      configured: envPresent(env, [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_DEVELOPER_TOKEN',
        'GOOGLE_REFRESH_TOKEN',
        'GOOGLE_CUSTOMER_ID',
      ]),
      secret_values_exposed: false,
    },
    ga4: {
      configured: Boolean(
        env.GA4_PROPERTY_ID &&
        (env.GOOGLE_REFRESH_TOKEN || env.GOOGLE_APPLICATION_CREDENTIALS || env.GA4_SERVICE_ACCOUNT_JSON)
      ),
      secret_values_exposed: false,
    },
    meta: {
      configured: envPresent(env, ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID']),
      secret_values_exposed: false,
    },
    wix: {
      configured: Boolean(env.WIX_ACCESS_TOKEN || env.WIX_API_KEY || env.WIX_REFRESH_TOKEN),
      secret_values_exposed: false,
    },
    railway: {
      configured: Boolean(env.RAILWAY_TOKEN || env.RAILWAY_API_TOKEN || env.RAILWAY_SERVICE_TOKEN),
      secret_values_exposed: false,
    },
    github: {
      configured: Boolean(env.GITHUB_TOKEN || env.GH_TOKEN),
      secret_values_exposed: false,
    },
  };
}

function buildRuntimeConnectionHealth(env = process.env) {
  const evidence = runtimeEvidence(env);
  return {
    mode: 'non_secret_runtime_configuration_probe',
    external_calls_performed: false,
    mutation_permission: false,
    connections: listConnections().map((connection) => {
      const staticHealth = connectionHealth(connection.id);
      const runtime = evidence[connection.id] || { configured: false, secret_values_exposed: false };
      return {
        id: connection.id,
        system: connection.system,
        registry_status: connection.status,
        registry_usable: staticHealth.usable,
        backend_credentials_configured: runtime.configured,
        secret_values_exposed: false,
        verified_live_health: false,
        live_probe_required: runtime.configured,
        blocker: staticHealth.blocker || null,
      };
    }),
  };
}

module.exports = { envPresent, runtimeEvidence, buildRuntimeConnectionHealth };
