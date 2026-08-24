function googleRuntimeConfigDiagnostics(env = process.env) {
  const raw = String(env.GOOGLE_DEVELOPER_TOKEN || "");
  const trimmed = raw.trim();
  const customer = String(env.GOOGLE_CUSTOMER_ID || "").replace(/\D/g, "");
  const loginCustomer = String(env.GOOGLE_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
  return {
    developer_token_present: raw.length > 0,
    developer_token_length: trimmed.length,
    developer_token_length_ok: trimmed.length === 22,
    developer_token_charset_ok: /^[A-Za-z0-9_-]{22}$/.test(trimmed),
    developer_token_trim_clean: raw === trimmed,
    customer_id_present: customer.length > 0,
    customer_id_length_ok: customer.length === 10,
    login_customer_configured: loginCustomer.length > 0,
    login_customer_length_ok: loginCustomer.length === 0 || loginCustomer.length === 10,
    oauth_client_configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    refresh_token_configured: Boolean(env.GOOGLE_REFRESH_TOKEN),
    exposes_secret_values: false,
    writes_allowed: false,
  };
}

module.exports = { googleRuntimeConfigDiagnostics };