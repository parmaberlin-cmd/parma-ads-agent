'use strict';
// Diagnostics only: this module never sends a real mutation.
const { customerFrom, configured, validateWritePath } = require('./google-write-path');
const {createBudgetRestAdapter}=require('./google-budget-rest-adapter');
const safeCode = error => Number.isInteger(error?.response?.status) ? error.response.status : Number.isInteger(error?.code) ? error.code : null;
function berlinDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
async function readToday(customer, now = new Date()) {
  const day = berlinDay(now);
  const account = await customer.query('SELECT customer.id, customer.currency_code, customer.time_zone FROM customer');
  if (account.length !== 1 || account[0].customer.currency_code !== 'EUR' || account[0].customer.time_zone !== 'Europe/Berlin') throw new Error('account_metadata_invalid');
  const spend = await customer.query(`SELECT customer.id, metrics.cost_micros FROM customer WHERE segments.date = '${day}'`);
  if (spend.length !== 1 || String(spend[0].customer.id) !== String(account[0].customer.id)) throw new Error('today_spend_unavailable');
  const cost = Number(spend[0].metrics?.cost_micros);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('today_spend_invalid');
  const history = await customer.query(`SELECT change_event.change_date_time, change_event.change_resource_type, change_event.change_resource_name, change_event.changed_fields, change_event.old_resource, change_event.new_resource FROM change_event WHERE change_event.change_date_time >= '${day} 00:00:00' AND change_event.change_date_time <= '${day} 23:59:59' ORDER BY change_event.change_date_time ASC LIMIT 10000`);
  if (!Array.isArray(history) || history.length >= 10000) throw new Error('history_truncated');
  // Change-event has reporting latency. Empty results are NOT proof of no changes.
  return { day, currency: 'EUR', time_zone: 'Europe/Berlin', reported_cost_micros: cost,
    change_rows: history.length, history_reconciled: false, hard_daily_spend_cap_verified: false, execution_allowed: false };
}
async function runRuntimePreflight({ env = process.env, customer, log = entry => console.log(JSON.stringify(entry)), timeoutMs = 45000 } = {}) {
  const enabled = env.GOOGLE_ADS_VALIDATE_WRITE_PATH_ON_START === 'true';
  log({ event: 'google_write_path_startup', enabled, writes_executed: false });
  if (!enabled) return { status: 'disabled' };
  if (!configured(env)) { log({ event: 'google_write_path_preflight', success: false, blockers: ['google_configuration_incomplete'], writes_executed: false }); return { status: 'blocked' }; }
  let timer;
  const work = async () => {
    customer = customer || customerFrom(env);
    const adapter=createBudgetRestAdapter(customer);
    let queryNumber=0;
    const observed={query:async q=>{log({event:'google_write_path_stage',stage:'read',number:++queryNumber,writes_executed:false});return customer.query(q);},
      mutateResources:async(...args)=>{log({event:'google_write_path_stage',stage:'validate_only_rest',writes_executed:false});return adapter.mutateResources(...args);}};
    const preflight = await validateWritePath({ env, customer:observed, maxTotalMicros: 10000000 });
    let today = null, today_error = null;
    try { today = await readToday(customer); } catch (error) { today_error = safeCode(error); }
    return { event: 'google_write_path_preflight', success: preflight.success === true,
      mode: 'validate_only', mutation_permission_validated: preflight.mutation_permission_validated === true,
      writes_executed: false, spend_changed: false, execution_allowed: false,
      enabled_campaigns: preflight.inventory?.enabled_count ?? null,
      current_enabled_daily_budget_micros: preflight.inventory?.total_enabled_budget_micros ?? null,
      blockers: preflight.blockers, today, today_read_success: today !== null, today_error_code: today_error };
  };
  try {
    const result = await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('preflight_timeout')), timeoutMs); })]);
    log(result); return result;
  } catch (error) {
    const result = { event: 'google_write_path_preflight', success: false, mode: 'validate_only', writes_executed: false,
      execution_allowed: false, blockers: [error.message === 'preflight_timeout' ? 'preflight_timeout' : 'preflight_failed'], provider_code: safeCode(error) };
    log(result); return result;
  } finally { clearTimeout(timer); }
}
module.exports = { berlinDay, readToday, runRuntimePreflight };
