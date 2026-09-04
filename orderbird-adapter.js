'use strict';

const ALLOWED_METHODS = new Set(['GET']);

function normalizeMoney(value, currency='EUR') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('invalid_amount');
  return { amount, currency:String(currency || 'EUR').toUpperCase() };
}

function normalizeSalesSummary(raw={}) {
  const source = raw.source || 'orderbird';
  const gross = normalizeMoney(raw.gross_sales ?? raw.gross ?? raw.revenue ?? 0, raw.currency);
  const net = normalizeMoney(raw.net_sales ?? raw.net ?? 0, gross.currency);
  const transactions = Number(raw.transactions ?? raw.transaction_count ?? raw.receipts ?? 0);
  if (!Number.isInteger(transactions) || transactions < 0) throw new Error('invalid_transaction_count');
  return {
    source,
    period: { start: raw.start || raw.period_start || null, end: raw.end || raw.period_end || null },
    gross_sales: gross,
    net_sales: net,
    transactions,
    average_ticket: transactions ? { amount: gross.amount / transactions, currency:gross.currency } : { amount:0, currency:gross.currency }
  };
}

function createOrderbirdAdapter({ transport, baseUrl }={}) {
  if (typeof transport !== 'function') throw new Error('transport_required');
  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) throw new Error('official_https_base_url_required');
  async function request(path, options={}) {
    const method = String(options.method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw new Error('orderbird_read_only_violation');
    if (!String(path).startsWith('/')) throw new Error('invalid_path');
    return transport(new URL(path, baseUrl).toString(), { ...options, method:'GET' });
  }
  return { request, normalizeSalesSummary };
}

module.exports = { createOrderbirdAdapter, normalizeSalesSummary };
