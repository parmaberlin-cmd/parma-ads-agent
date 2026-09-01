# Search Term Review Protocol

Purpose: turn the full sanitized search-term corpus into an auditable commercial taxonomy without using unverified conversions as truth.

## Required row fields
query, impressions, clicks, cost, ad_group, keyword/match context when available, registered conversions (diagnostic only).

## Intent labels
- brand
- near_me
- local_kreuzberg
- open_now
- berlin_generic
- pizza_generic
- quality_seeking
- organic_bio
- sourdough
- italian_style
- delivery_or_takeaway
- reservation_intent
- direct_order_intent
- informational
- competitor_brand
- clearly_irrelevant
- ambiguous_other

## Commercial-role labels
- likely_visit_or_walk_in
- likely_direct_order
- likely_marketplace_or_delivery
- likely_reservation
- discovery
- unknown

These are hypotheses, never observed customers.

## Negative-candidate rules
A term may become a negative *candidate* only if its semantics are clearly irrelevant or incompatible with Parma's offer. Zero registered conversions are insufficient. `near me`, brand, Kreuzberg/Wrangelkiez, Schlesisches Tor, open-now and plausible visit intent are protected by default. Competitor-brand queries require separate strategy review rather than automatic exclusion.

## Opportunity rules
Promote a term to opportunity candidate when it has meaningful volume/click evidence and a coherent Parma offer/landing path. Opportunity does not imply adding a keyword; it may instead indicate copy, landing or local-SEO work.

## Corpus completion output
- rows reviewed / total rows;
- click and cost coverage by intent;
- protected-local share;
- clearly-irrelevant share;
- ambiguous share requiring human/business context only if unavoidable;
- top opportunity themes;
- negative candidates with semantic reason;
- no automatic writes.

## Integrity rule
If the corpus is incomplete, report coverage explicitly. Never extrapolate a reviewed subset into a claim that all 2,055 rows were reviewed.
