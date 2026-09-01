# Next Approval Batch — independent gates

This document batches future human decisions without combining permissions that have different risk.

## Gate A — publish read-only diagnostic readers
Scope: merge/deploy the exact-date and conversion-semantics readers after review. Purpose: obtain live Ads timezone/conversion-date metadata and exact-date GA4 semantics. No campaign, tracking, site or spend mutation is included.

Status: permission required before merge/deploy. This gate can improve evidence but cannot authorize optimization writes.

## Gate B — Google RSA structural experiment
Scope: replace only the weak RSA assets with the validated 15-headline/4-description local proposal after a separate mutation-package review. Budget, bidding, keywords, negatives, targeting, tracking and landing page remain unchanged.

Status: external ad-write approval required. Keep independent from Gate A so reader publication cannot silently become campaign permission.

## Gate C — tracking / conversion-definition repair
Scope: only if ground truth proves a semantic defect and a concrete reversible tracking repair is prepared.

Status: not ready. Correct business ground truth and semantic reconciliation are prerequisites. Similar event counts are not sufficient evidence.

## Gate D — keyword routing / negatives
Scope: duplicated BROAD keyword consolidation or negative-keyword changes.

Status: not ready for execution. RSA structural repair should be isolated and observed first; near-me/local/open-now/brand intent remains protected.

## Gate E — budget/spend
Scope: any increase from the current budget or any new paid delivery.

Status: not ready. Requires verified measurement, explicit customer contribution value, verified marginal response and separate spend approval.

## Gate F — site/direct-order changes
Scope: CTA hierarchy or order-path changes.

Status: not ready. Requires verified direct-order completion semantics, mobile path evidence and explicit economics; separate site publication approval.

## Human-intervention rule
Ask only for the smallest gate that has become decision-ready. Do not bundle a low-risk reader publication with tracking, campaign or spend permission.

`merge_deploy_authorized=false`

`campaign_write_authorized=false`

`tracking_write_authorized=false`

`site_write_authorized=false`

`spend_authorized=false`
