# Google Ads production canary runbook

Status: development ready. Real Google Ads mutation count during development: 0.

## Target

- Customer ID: `7376153998`
- Campaign ID: `23276824770`
- Exact campaign-level negative keyword: `zz-parma-canary-20260907`
- Financial exposure: `0`
- Automatic rollback: required and verified before success

## Environment requirements

All values are names only; never commit secret values.

- `GOOGLE_ADS_CANARY_ENABLED=true`
- `GOOGLE_ADS_WRITE_KILL_SWITCH=false`
- `GOOGLE_ADS_CANARY_KILL_SWITCH=false`
- `GOOGLE_ADS_CANARY_EXECUTION_AUTHORIZED=false` during validation; set to `true` only after the required human approval
- `GOOGLE_ADS_CANARY_EXPIRES_AT=<future ISO-8601 timestamp>`
- `ADS_AUDIT_INTEGRITY_KEY=<at least 32 UTF-8 bytes>`
- `ADS_AUDIT_PATH=<absolute owner-writable durable path>` or `RAILWAY_VOLUME_MOUNT_PATH=<durable mount>`
- Existing Google Ads read/mutation credentials must already be configured.

The runner also refuses to start when `ADS_AUDIT_INTEGRITY_KEY` is missing, the audit path is not
absolute/owner-writable, or the durable mount cannot be verified.

`EXECUTE_CANARY` additionally fails closed unless `GOOGLE_ADS_CANARY_EXECUTION_AUTHORIZED=true`.
Keep this gate false for `VALIDATE_ONLY` and restore it to false immediately after the approved canary.

## Runtime actions

1. Validate without writing:

   ```bash
   node scripts/run-google-ads-canary.js VALIDATE_ONLY
   ```

2. Only after `VALIDATE_ONLY` returns `READY_FOR_CANARY`, execute:

   ```bash
   node scripts/run-google-ads-canary.js EXECUTE_CANARY
   ```

The execution path adds the synthetic negative, verifies it by read-after-write, removes only the
agent-created resource, verifies absence, and returns `CANARY_VERIFIED`. On add verification
failure it attempts one emergency rollback. On rollback verification failure it returns
`CRITICAL_ROLLBACK_FAILURE` and stops further writes.

The canary runner is an internal CLI only. It does not expose a public endpoint.

Railway can invoke the same internal runner once at process start with
`GOOGLE_ADS_CANARY_STARTUP_MODE=VALIDATE_ONLY|EXECUTE_CANARY`. The value is cleared in process
memory before execution to prevent a duplicate invocation in the same process. Reset the Railway
variable after collecting the result; `EXECUTE_CANARY` still requires the separate execution gate.
