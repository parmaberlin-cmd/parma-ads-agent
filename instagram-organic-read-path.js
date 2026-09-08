'use strict';

const axios = require('axios');
const {
  auditInstagramContentCapability,
  auditInstagramLoginCapability,
} = require('./instagram-content-publishing');

const INSTAGRAM_READ_API_VERSION = 'v19.0';

function facebookGraphReadTransport({
  accessToken,
  apiVersion = INSTAGRAM_READ_API_VERSION,
  client = axios,
} = {}) {
  if (!accessToken) throw new Error('instagram_facebook_access_token_required');
  const http = client.create
    ? client.create({ baseURL: `https://graph.facebook.com/${apiVersion}`, timeout: 20000 })
    : client;
  return {
    async get(endpoint, params = {}) {
      const response = await http.get(endpoint, { params: { ...params, access_token: accessToken } });
      return response.data;
    },
  };
}

function instagramLoginReadTransport({
  accessToken,
  apiVersion = INSTAGRAM_READ_API_VERSION,
  client = axios,
} = {}) {
  if (!accessToken) throw new Error('instagram_login_access_token_required');
  const http = client.create
    ? client.create({ baseURL: `https://graph.instagram.com/${apiVersion}`, timeout: 20000 })
    : client;
  return {
    async get(endpoint, params = {}) {
      const response = await http.get(endpoint, { params: { ...params, access_token: accessToken } });
      return response.data;
    },
  };
}

function instagramLoginWriteTransport({
  accessToken,
  apiVersion = INSTAGRAM_READ_API_VERSION,
  client = axios,
} = {}) {
  if (!accessToken) throw new Error('instagram_login_access_token_required');
  const http = client.create
    ? client.create({ baseURL: `https://graph.instagram.com/${apiVersion}`, timeout: 20000 })
    : client;
  return {
    async get(endpoint, params = {}) {
      const response = await http.get(endpoint, { params: { ...params, access_token: accessToken } });
      return response.data;
    },
    async post(endpoint, payload = {}) {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) {
        body.set(key, value && typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      body.set('access_token', accessToken);
      const response = await http.post(endpoint, body, {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      return response.data;
    },
  };
}

async function resolveInstagramOrganicCapability({
  facebookTransport,
  loginTransport,
  adAccountId = null,
  username = 'parma.divinibenedetti',
  preferredReadPath = null,
} = {}) {
  if (!facebookTransport || typeof facebookTransport.get !== 'function') {
    throw new Error('instagram_facebook_transport_required');
  }
  if (preferredReadPath === 'instagram_login') {
    if (!loginTransport || typeof loginTransport.get !== 'function') {
      throw new Error('instagram_login_transport_required_for_approved_context');
    }
    const loginAudit = await auditInstagramLoginCapability({
      transport: loginTransport,
      username,
    });
    return {
      ...loginAudit,
      resolved_read_path: 'instagram_login',
    };
  }
  if (preferredReadPath === 'facebook_page_linked_instagram_business') {
    const facebookAudit = await auditInstagramContentCapability({
      transport: facebookTransport,
      adAccountId,
      username,
    });
    return {
      ...facebookAudit,
      login_type: 'facebook_login',
      resolved_read_path: 'facebook_page_linked_instagram_business',
    };
  }
  const facebookAudit = await auditInstagramContentCapability({
    transport: facebookTransport,
    adAccountId,
    username,
  });

  if (facebookAudit.checks.permissions_readable || facebookAudit.capabilities.read_account) {
    return {
      ...facebookAudit,
      login_type: 'facebook_login',
      resolved_read_path: 'facebook_page_linked_instagram_business',
    };
  }

  if (loginTransport && typeof loginTransport.get === 'function') {
    const loginAudit = await auditInstagramLoginCapability({
      transport: loginTransport,
      username,
    });
    return {
      ...loginAudit,
      resolved_read_path: 'instagram_login',
    };
  }

  return {
    ...facebookAudit,
    resolved_read_path: 'facebook_page_linked_instagram_business',
  };
}

module.exports = {
  INSTAGRAM_READ_API_VERSION,
  facebookGraphReadTransport,
  instagramLoginReadTransport,
  instagramLoginWriteTransport,
  resolveInstagramOrganicCapability,
};
