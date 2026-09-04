# Connection control plane

This current-main extraction exposes only sanitized capability and health metadata. It does not contain provider credentials and does not grant mutation permission.

## Contract
- Known, verified read capabilities may be reported usable.
- Unknown connections/capabilities fail closed.
- Every mutation request is denied by this module and requires a separate permission class.
- Human intervention is reported only for an evidenced provider gate, not merely because a capability is incomplete.
- Registry state is non-secret; customer/reservation/order records must not be persisted here.

## Integration gate
The route installer exists but is not mounted into production bootstrap by this extraction. Mounting is a separate change after exact-head CI is green and route authentication is independently reviewed.
