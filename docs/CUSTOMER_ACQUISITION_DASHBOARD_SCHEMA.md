# Customer Acquisition Dashboard Schema

## Outcome layer
- verified_direct_orders
- verified_reservations_created
- verified_reservations_seated (only if available)
- verified_marketplace_orders
- verified_incremental_customers
- walk_in_proxy (clearly labelled proxy)

## Value layer
- direct_order_contribution_value
- reservation_contribution_value
- marketplace_contribution_value
- break_even_cpa
- simplified_ltv
All dependent values become unknown when required economics are missing.

## Demand layer
- impressions, clicks, CTR, CPC
- local_intent_clicks and share
- near_me_clicks and share
- quality_seeking_clicks and share
- brand/open_now demand
- mobile click/cost share
- day/hour demand distribution

## Measurement layer
- Ads primary/all conversions
- GA4 candidate events
- Wix ground truth
- timezone/date basis
- attribution scope
- counting method
- maturity/lag
- conversion confidence

## Constraint layer
- lost impression share budget
- lost impression share rank
- ad-group overlap
- RSA structural health
- geo presence vs area-of-interest

## Safety/readiness layer
- software_readiness
- data_readiness
- external_access_readiness
- permission_readiness
- writes_allowed
- spend_authorized

Dashboard rule: no platform metric is visually promoted to `customer` unless its semantic identity and business ground truth are verified.
