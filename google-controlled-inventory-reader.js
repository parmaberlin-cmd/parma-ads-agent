'use strict';
const { collectControlledInventory } = require('./google-controlled-inventory');
const ACCOUNT_QUERY = 'SELECT customer.id, customer.currency_code, customer.time_zone FROM customer';
const INVENTORY_QUERY = `SELECT campaign.id, campaign.resource_name, campaign.status,
  campaign.campaign_budget, campaign_budget.id, campaign_budget.resource_name,
  campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.period
  FROM campaign WHERE campaign.status != 'REMOVED'`;
function identifier(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('invalid_identifier');
  if (!['string','number','bigint'].includes(typeof value) || !/^\d{1,20}$/.test(String(value)))
    throw new Error('invalid_identifier');
  return String(value);
}
function normalizeRow(row, customerId) {
  const c = row.campaign, b = row.campaign_budget;
  const campaignId = identifier(c?.id), budgetId = identifier(b?.id);
  const budgetResource = `customers/${customerId}/campaignBudgets/${budgetId}`;
  if (c.resource_name !== `customers/${customerId}/campaigns/${campaignId}` ||
      c.campaign_budget !== budgetResource || b.resource_name !== budgetResource)
    throw new Error('resource_account_mismatch');
  if (b.period !== 'DAILY' && b.period !== 2) throw new Error('unsupported_budget_period');
  const status = ({2:'ENABLED',3:'PAUSED',ENABLED:'ENABLED',PAUSED:'PAUSED'})[c.status];
  if (!status || typeof b.explicitly_shared !== 'boolean') throw new Error('invalid_inventory_row');
  const amount = identifier(b.amount_micros), micros = Number(amount);
  if (!Number.isSafeInteger(micros) || micros <= 0) throw new Error('invalid_budget_amount');
  return { campaign_id:campaignId, budget_id:budgetId, daily_budget_micros:micros,
    status, shared_budget:b.explicitly_shared };
}
function createInventoryPageReader(customer) {
  if (!customer || typeof customer.queryStream !== 'function') throw new Error('reader_required');
  let rows = null, account = null, expectedToken = null;
  return async ({customerId,pageToken,signal}) => {
    if (signal.aborted) throw new Error('read_aborted');
    if (pageToken === null) {
      rows = null; account = null; expectedToken = null;
      const accounts = [];
      for await (const row of customer.queryStream(ACCOUNT_QUERY)) {
        if (signal.aborted || accounts.length >= 1) throw new Error('invalid_account_response');
        accounts.push(row);
      }
      if (accounts.length !== 1 || identifier(accounts[0].customer?.id) !== customerId)
        throw new Error('account_mismatch');
      account = accounts[0].customer;
      const collected = [];
      for await (const row of customer.queryStream(INVENTORY_QUERY)) {
        if (signal.aborted || collected.length >= 10000) throw new Error('inventory_limit_or_abort');
        collected.push(normalizeRow(row,customerId));
      }
      rows = collected;
    } else if (!rows || pageToken !== expectedToken) throw new Error('unexpected_page_token');
    const offset = pageToken === null ? 0 : Number(pageToken);
    const next = offset + 1000 < rows.length ? String(offset + 1000) : null;
    expectedToken = next;
    return {customer_id:identifier(account.id),currency:account.currency_code,time_zone:account.time_zone,
      campaigns:rows.slice(offset,offset+1000),next_page_token:next};
  };
}
async function collectConfiguredInventory({env=process.env, createCustomer} = {}) {
  const blocked = {success:false,mode:'read_only_inventory',snapshot:null,blockers:['google_inventory_configuration_or_read_failed'],
    writes_allowed:false,spend_allowed:false,execution_allowed:false};
  try {
    for (const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_DEVELOPER_TOKEN','GOOGLE_REFRESH_TOKEN','GOOGLE_CUSTOMER_ID'])
      if (typeof env[key] !== 'string' || !env[key].trim()) return blocked;
    const cleanId = value => {
      const raw = value.trim();
      if (!/^\d{1,20}$/.test(raw) && !/^\d{3}-\d{3}-\d{4}$/.test(raw)) throw new Error('invalid_config_id');
      return raw.replace(/-/g,'');
    };
    const customerId = cleanId(env.GOOGLE_CUSTOMER_ID);
    const options = {customer_id:customerId,refresh_token:env.GOOGLE_REFRESH_TOKEN};
    if (env.GOOGLE_LOGIN_CUSTOMER_ID) options.login_customer_id=cleanId(env.GOOGLE_LOGIN_CUSTOMER_ID);
    const clientOptions={client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,developer_token:env.GOOGLE_DEVELOPER_TOKEN};
    const factory = createCustomer || ((config, opts) => {
      const {GoogleAdsApi}=require('google-ads-api'); return new GoogleAdsApi(config).Customer(opts);
    });
    const customer = factory(clientOptions,options);
    return await collectControlledInventory({customerId,fetchPage:createInventoryPageReader(customer)});
  } catch { return blocked; }
}
module.exports={collectConfiguredInventory,createInventoryPageReader,ACCOUNT_QUERY,INVENTORY_QUERY};
