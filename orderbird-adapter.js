'use strict';

class OrderbirdProviderUnavailableError extends Error {
  constructor(message = 'provider_supported_orderbird_transport_not_configured') {
    super(message);
    this.name = 'OrderbirdProviderUnavailableError';
    this.code = 'ORDERBIRD_PROVIDER_UNAVAILABLE';
  }
}

function createOrderbirdAdapter({ transport = null } = {}) {
  const hasTransport = transport && typeof transport.fetchAggregates === 'function';

  return {
    provider: 'orderbird',
    mode: 'read_only',
    mutation_permission: false,
    transport_verified: Boolean(hasTransport && transport.providerSupported === true),

    health() {
      if (!hasTransport || transport.providerSupported !== true) {
        return {
          provider: 'orderbird',
          healthy: false,
          usable: false,
          health: 'unavailable',
          reason: 'provider_supported_transport_not_verified',
          mutation_permission: false
        };
      }
      return {
        provider: 'orderbird',
        healthy: true,
        usable: true,
        health: 'healthy',
        reason: 'provider_supported_read_transport_verified',
        mutation_permission: false
      };
    },

    async readAggregates(range) {
      if (!hasTransport || transport.providerSupported !== true) {
        throw new OrderbirdProviderUnavailableError();
      }
      if (!range || !range.startDate || !range.endDate) throw new TypeError('date_range_required');
      return transport.fetchAggregates({ startDate: range.startDate, endDate: range.endDate, readOnly: true });
    },

    async mutate() {
      const err = new Error('orderbird_mutations_forbidden');
      err.code = 'ORDERBIRD_MUTATION_FORBIDDEN';
      throw err;
    }
  };
}

module.exports = { createOrderbirdAdapter, OrderbirdProviderUnavailableError };
