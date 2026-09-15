'use strict';

// Bounded REST transport for controlled operational Google Ads writes.
//
// google-ads-api's `customer.mutateResources` runs over gax/gRPC. In constrained
// runtimes that channel can hang without ever answering (observed in the Railway
// production container: no response within 60s while REST calls answered in
// ~150ms). Reads already use REST, and this repository already performs provider
// writes over REST in google-negative-rest-adapter.js and
// google-budget-rest-adapter.js with a bounded timeout and no retries.
//
// This module keeps the exact operation contract the controlled gateway already
// uses - mutateResources(operations, { validate_only, partial_failure }) - but
// sends one non-retrying, non-redirecting REST POST per operation:
//   POST https://googleads.googleapis.com/<version>/customers/<id>/<service>:mutate
// Fail-closed semantics:
//   * 4xx            -> provider_mutation_rejected  (definitive, no write)
//   * 5xx / timeout  -> provider_transport_ambiguous (caller must reconcile)
//   * unknown shape  -> unsupported_operational_* (no provider call)
// The returned evidence distinguishes a validate-only result from a write result
// (http_status, request_id, validate_only, provider_write).
const axios = require('axios');
const { googleAdsVersion } = require('google-ads-api/build/src/version');

const ID = /^\d{1,20}$/;
const SERVICE_BY_ENTITY = Object.freeze({
  campaign_criterion: 'campaignCriteria',
  ad_group_criterion: 'adGroupCriteria',
  ad_group_ad: 'adGroupAds',
  ad_group: 'adGroups',
  campaign: 'campaigns',
  campaign_budget: 'campaignBudgets',
});

function restKeyword(keyword) {
  if (!keyword || typeof keyword.text !== 'string' || !keyword.text) throw new Error('invalid_operational_keyword');
  return { text: keyword.text, matchType: keyword.match_type };
}

function restOperation(operation) {
  if (!operation || typeof operation !== 'object') throw new Error('invalid_operational_operation');
  const resource = operation.resource;
  const remove = () => {
    if (typeof resource !== 'string' || !resource) throw new Error('invalid_operational_resource_name');
    return { remove: resource };
  };
  const update = (mask, fields) => {
    if (!resource || typeof resource.resource_name !== 'string') throw new Error('invalid_operational_resource_name');
    return { update: { resourceName: resource.resource_name, ...fields }, updateMask: mask.join(',') };
  };

  if (operation.entity === 'campaign_criterion') {
    if (operation.operation === 'remove') return remove();
    if (!resource || typeof resource.campaign !== 'string') throw new Error('invalid_operational_campaign_binding');
    if (resource.ad_schedule) {
      const ad = resource.ad_schedule;
      return { create: { campaign: resource.campaign, adSchedule: { dayOfWeek: ad.day_of_week, startHour: ad.start_hour, startMinute: ad.start_minute, endHour: ad.end_hour, endMinute: ad.end_minute } } };
    }
    if (resource.location) return { create: { campaign: resource.campaign, negative: resource.negative === true, location: { geoTargetConstant: resource.location.geo_target_constant } } };
    if (resource.language) return { create: { campaign: resource.campaign, language: { languageConstant: resource.language.language_constant } } };
    return { create: { campaign: resource.campaign, negative: resource.negative === true, keyword: restKeyword(resource.keyword) } };
  }

  if (operation.entity === 'ad_group_criterion') {
    if (operation.operation === 'remove') return remove();
    if (operation.operation === 'update') return update(['status'], { status: resource.status });
    if (!resource || typeof resource.ad_group !== 'string') throw new Error('invalid_operational_ad_group_binding');
    return { create: { adGroup: resource.ad_group, status: resource.status, negative: resource.negative === true, keyword: restKeyword(resource.keyword) } };
  }

  if (operation.entity === 'ad_group_ad') {
    if (operation.operation === 'remove') return remove();
    if (operation.operation === 'update') return update(['status'], { status: resource.status });
    if (!resource || typeof resource.ad_group !== 'string') throw new Error('invalid_operational_ad_group_binding');
    const ad = resource.ad;
    if (!ad || !ad.responsive_search_ad) throw new Error('unsupported_operational_ad_type');
    return {
      create: {
        adGroup: resource.ad_group,
        status: resource.status,
        ad: {
          finalUrls: ad.final_urls,
          responsiveSearchAd: {
            headlines: (ad.responsive_search_ad.headlines || []).map(value => ({ text: value.text })),
            descriptions: (ad.responsive_search_ad.descriptions || []).map(value => ({ text: value.text })),
          },
        },
      },
    };
  }

  if (operation.entity === 'ad_group') {
    if (operation.operation === 'remove') return remove();
    if (operation.operation === 'update') {
      const fields = {};
      const mask = [];
      if (resource.name !== undefined) { fields.name = resource.name; mask.push('name'); }
      if (resource.status !== undefined) { fields.status = resource.status; mask.push('status'); }
      if (!mask.length) throw new Error('invalid_operational_update');
      return update(mask, fields);
    }
    if (!resource || typeof resource.campaign !== 'string') throw new Error('invalid_operational_campaign_binding');
    return {
      create: {
        campaign: resource.campaign,
        name: resource.name,
        status: resource.status,
        type: resource.type,
        ...(resource.cpc_bid_micros === undefined ? {} : { cpcBidMicros: String(resource.cpc_bid_micros) }),
      },
    };
  }

  if (operation.entity === 'campaign') {
    if (operation.operation === 'remove') return remove();
    if (operation.operation === 'update') {
      const fields = {};
      const mask = [];
      if (resource.name !== undefined) { fields.name = resource.name; mask.push('name'); }
      if (resource.status !== undefined) { fields.status = resource.status; mask.push('status'); }
      if (!mask.length) throw new Error('invalid_operational_update');
      return update(mask, fields);
    }
    return {
      create: {
        ...(resource.resource_name ? { resourceName: resource.resource_name } : {}),
        name: resource.name,
        campaignBudget: resource.campaign_budget,
        advertisingChannelType: resource.advertising_channel_type,
        status: resource.status,
        manualCpc: {},
      },
    };
  }

  if (operation.entity === 'campaign_budget') {
    if (operation.operation === 'remove') return remove();
    return {
      create: {
        ...(resource.resource_name ? { resourceName: resource.resource_name } : {}),
        name: resource.name,
        amountMicros: String(resource.amount_micros),
        explicitlyShared: resource.explicitly_shared === true,
      },
    };
  }

  throw new Error('unsupported_operational_entity');
}

function createOperationalRestTransport(customer, { http = axios.create(), timeoutMs = 15000 } = {}) {
  const customerId = String(customer?.credentials?.customer_id || customer?.customerId || '').replace(/\D/g, '');
  if (!ID.test(customerId) || typeof customer?.getAccessToken !== 'function' || !/^v\d+$/.test(googleAdsVersion)) {
    throw new Error('invalid_operational_rest_transport');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new Error('invalid_operational_rest_timeout');
  if (!http || typeof http.request !== 'function') throw new Error('invalid_operational_rest_http');

  async function mutateResources(operations, options = {}) {
    if (!Array.isArray(operations) || operations.length !== 1) throw new Error('invalid_operational_rest_batch');
    if (typeof options.validate_only !== 'boolean') throw new Error('validate_only_required');
    if (options.partial_failure !== false) throw new Error('partial_failure_must_be_false');
    const operation = operations[0];
    const service = SERVICE_BY_ENTITY[operation.entity];
    if (!service) throw new Error('unsupported_operational_entity');
    const body = restOperation(operation);
    // Defence in depth: every resource referenced by the request must belong to
    // the same customer as the credentials used for this transport.
    const referenced = [...JSON.stringify(body).matchAll(/customers\/(\d{1,20})/g)].map(match => match[1]);
    if (referenced.some(referencedId => referencedId !== customerId)) throw new Error('operational_cross_customer_transport_blocked');
    const token = await customer.getAccessToken();

    let response;
    try {
      response = await http.request({
        method: 'POST',
        url: `https://googleads.googleapis.com/${googleAdsVersion}/customers/${customerId}/${service}:mutate`,
        timeout: timeoutMs,
        maxRedirects: 0,
        headers: { ...customer.callHeaders, Authorization: `Bearer ${token}` },
        data: { operations: [body], validateOnly: options.validate_only, partialFailure: false },
      });
    } catch (error) {
      const reason = String(error?.code || error?.message || '');
      if (/ECONNABORTED|ETIMEDOUT|timeout/i.test(reason)) throw new Error('provider_transport_timeout');
      throw new Error('provider_transport_ambiguous');
    }

    const status = Number(response?.status ?? 200);
    if (!Number.isInteger(status) || status < 200 || status >= 300) {
      const detail = JSON.stringify(response?.data?.error || response?.data || {}).slice(0, 1000);
      const definitive = Number.isInteger(status) && status >= 400 && status < 500;
      throw new Error(`${definitive ? 'provider_mutation_rejected' : 'provider_transport_ambiguous'}:${status}:${detail}`);
    }
    return {
      results: Array.isArray(response?.data?.results) ? response.data.results : [],
      request_id: response?.data?.requestId || response?.headers?.requestId || null,
      http_status: status,
      service,
      entity: operation.entity,
      validate_only: options.validate_only,
      provider_write: options.validate_only !== true,
    };
  }

  return { customerId, timeout_ms: timeoutMs, mutateResources };
}

module.exports = { createOperationalRestTransport, restOperation, SERVICE_BY_ENTITY };
