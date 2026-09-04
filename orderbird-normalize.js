'use strict';

const ALLOWED_PAYMENT_KEYS = new Set(['cash','card','voucher','other']);

function money(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError('invalid_money');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safeText(value, max = 120) {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, max) || null;
}

function normalizePaymentMethod(value) {
  const raw = safeText(value, 80);
  if (!raw) return 'other';
  const v = raw.toLowerCase();
  if (/cash|bar/.test(v)) return 'cash';
  if (/card|karte|visa|master|amex|ec|giro/.test(v)) return 'card';
  if (/voucher|gutschein/.test(v)) return 'voucher';
  return 'other';
}

function aggregateNamedRows(rows = [], nameFields = ['name','label','category','article']) {
  if (!Array.isArray(rows)) throw new TypeError('rows_must_be_array');
  return rows.map((row) => {
    const source = row || {};
    const name = nameFields.map((k) => source[k]).find((v) => v !== undefined && v !== null);
    return {
      name: safeText(name, 120) || 'unknown',
      gross: money(source.gross ?? source.revenueGross ?? source.totalGross ?? 0),
      net: money(source.net ?? source.revenueNet ?? source.totalNet ?? 0),
      tax: money(source.tax ?? source.vat ?? source.totalTax ?? 0),
      quantity: Number.isFinite(Number(source.quantity)) ? Number(source.quantity) : null
    };
  });
}

function normalizeOrderbirdAggregate(input, { source = 'orderbird', timezone = 'Europe/Berlin' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('aggregate_input_required');
  const businessDate = safeText(input.businessDate ?? input.business_date ?? input.date, 32);
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new TypeError('business_date_required');

  const paymentRows = Array.isArray(input.paymentMethods ?? input.payment_methods) ? (input.paymentMethods ?? input.payment_methods) : [];
  const paymentMethods = paymentRows.map((row) => {
    const method = normalizePaymentMethod(row?.method ?? row?.name ?? row?.label);
    if (!ALLOWED_PAYMENT_KEYS.has(method)) throw new TypeError('invalid_payment_method');
    return { method, gross: money(row?.gross ?? row?.amount ?? row?.total ?? 0) };
  });

  return {
    schema_version: 1,
    source,
    source_kind: 'pos_ground_truth',
    attribution_kind: 'none',
    timezone,
    business_date: businessDate,
    shift_open_date: safeText(input.shiftOpenDate ?? input.shift_open_date, 32),
    source_generated_at: safeText(input.sourceGeneratedAt ?? input.source_generated_at, 64),
    gross: money(input.gross ?? input.revenueGross ?? input.totalGross),
    net: money(input.net ?? input.revenueNet ?? input.totalNet),
    tax: money(input.tax ?? input.vat ?? input.totalTax),
    discounts_gross: money(input.discountsGross ?? input.discounts_gross ?? 0),
    cancellations_gross: money(input.cancellationsGross ?? input.cancellations_gross ?? 0),
    payment_methods: paymentMethods,
    categories: aggregateNamedRows(input.categories ?? input.productGroups ?? input.product_groups ?? [], ['name','label','category']),
    articles: aggregateNamedRows(input.articles ?? input.products ?? [], ['name','label','article']),
    tables: aggregateNamedRows(input.tables ?? [], ['name','label','table']),
    hourly: Array.isArray(input.hourly) ? input.hourly.map((row) => ({
      hour: safeText(row?.hour, 16),
      gross: money(row?.gross ?? row?.amount ?? 0),
      net: money(row?.net ?? 0),
      tax: money(row?.tax ?? row?.vat ?? 0)
    })) : []
  };
}

function containsDisallowedPii(value) {
  const text = JSON.stringify(value || {}).toLowerCase();
  return ['customer_name','customer_email','customer_phone','receipt_text','receipt_id','guest_name'].some((key) => text.includes(key));
}

module.exports = { normalizeOrderbirdAggregate, normalizePaymentMethod, containsDisallowedPii };
