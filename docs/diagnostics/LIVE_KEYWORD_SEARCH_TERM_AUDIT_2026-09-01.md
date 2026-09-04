# Live Keyword + Search-Term Audit — 2026-09-01

Evidence source: GitHub Actions read-only runs **33561666913** and **33562420838** against the existing Railway intelligence endpoint for **2026-08-02..2026-08-31**. Production reader remained v3; no deploy was performed.

## Corpus completion

- Keyword rows received/audited: **29/29**
- Unique normalized keywords: **26**
- Cross-ad-group duplicate keywords: **3**
- Search-term rows received/accounted for: **2,153/2,153**
- Search-term rows with clicks/cost: **170**
- Ad groups represented in search-term corpus: **2**
- Matched keywords producing the observed search-term corpus: **6**
- Search-term match type observed: **BROAD**
- Raw user search terms written to diagnostic logs: **no**

This supersedes the older planning reference to 2,055 rows. The current exact-window payload contains 2,153 rows.

## Keyword portfolio

Keyword-view totals: **14,483 impressions, 475 clicks, €94.253516**. These totals are not expected to equal campaign totals because the views/scopes differ.

`beste pizza berlin` exists as BROAD in both ad groups and accounts for **379 clicks and €72.2036**, about **79.8% of keyword-view clicks** and **76.6% of keyword-view cost**. It is a structural concentration finding, not proof that the keyword is good or bad.

Other traffic-bearing rows include:

- `pizza napoletana berlin` in both ad groups: **41 clicks, €6.3881** combined.
- `pizza bio berlin`: **14 clicks, €4.232568** on the traffic-bearing copy; duplicate exists with zero observed traffic.
- `pizza kreuzberg`: **17 clicks, €0.90**, protected local intent.
- `pizzeria kreuzberg`: **17 clicks, €0.947044**, protected local intent.
- `pizzeria italiana berlin`: **7 clicks, €9.582128**, average CPC about **€1.37**; high-cost review priority, not a pause recommendation.

The three normalized cross-ad-group overlaps are `beste pizza berlin`, `pizza napoletana berlin`, and `pizza bio berlin`. They are routing/consolidation simulation candidates only.

## Dormant inventory — fully classified

The live hygiene classifier found **21 dormant keyword rows** (zero impressions, clicks and cost):

- **10** competitor/other-business strategy review
- **4** off-area/nonlocal review
- **7** unknown dormant

This confirms dormant cleanup is low-impact while the rows remain at zero spend. No pause/removal is authorized.

## Search-term routing

Search-term totals: **13,009 impressions, 403 clicks, €71.312978** across 2,153 rows.

Primary taxonomy:

- `near_me`: **977 rows, 9,666 impressions, 270 clicks, €27.177063** — about **67.0% of search-term clicks** and **38.1% of search-term cost**; protected because walk-ins may be unmeasured.
- `pizza_generic`: **365 rows, 62 clicks, €19.980581**.
- `other`: **325 rows, 34 clicks, €14.645998** — about **8.4% of clicks but 20.5% of cost**.
- `berlin_generic`: **328 rows, 15 clicks, €6.750026**.
- `italian_style`: **79 rows, 10 clicks, €1.098016**.
- `competitor_brand`: **11 rows, 4 clicks, €0.58**; strategy review only.
- `quality_seeking`: **16 rows, 4 clicks, €0.735557**.
- `local_kreuzberg`: **39 rows, 3 clicks, €0.295906**, protected.
- `sourdough`: **5 rows, 1 click, €0.049831**.
- `brand`: 4 rows; protected.
- `organic_bio`: 1 row.
- `open_now`: 2 rows; protected.
- `delivery_or_takeaway`: 1 row.

No current rows were classified as reservation/direct-order intent by the deterministic vocabulary in this window; this does not prove those journeys do not exist.

### Secondary refinement of the 325-row `other` bucket

The second live pass reduced ambiguity without logging raw queries:

- `unknown_entity_or_phrase`: **248 rows, 1,108 impressions, 25 clicks, €11.013593**
- `other_area`: **54 rows, 255 impressions, 5 clicks, €2.395929**
- `restaurant_generic`: **15 rows, 61 impressions, 3 clicks, €0.990045**
- `menu_intent`: **7 rows, 18 impressions, 1 click, €0.246431**
- `dietary_intent`: **1 row, 0 impressions/clicks/cost**

So **77 of the original 325 ambiguous rows (23.7%)** now have a more specific secondary role, leaving **248** deliberately unresolved rather than forcing them into an irrelevant bucket.

## Ad-group routing evidence

The same broad keyword is demonstrably feeding near-me demand into both ad groups. For `beste pizza berlin` + `near_me`:

- structurally GOOD 15/4 RSA group: **4,714 impressions, 135 clicks, €13.461788**
- current POOR 7/2 RSA group: **3,536 impressions, 76 clicks, €9.38926**

This strengthens the sequencing rule: **do not consolidate the duplicated keyword first**. Repair the RSA structural asymmetry, then observe routing with one variable changed at a time.

Across both groups, the `beste pizza berlin` near-me role totals **661 rows, 8,250 impressions, 211 clicks, €22.851048**. Removing/aggressively narrowing it before measuring walk-ins would be unsafe.

## First experiment sequence

The live sequencing engine returns:

1. `rsa_structural_rebuild` — remove RSA structural asymmetry first; budget delta €0.
2. `duplicate_keyword_routing_observation` — observe overlap only after RSA structures are comparable; budget delta €0.

It explicitly returns `simultaneous_rsa_and_keyword_mutation_supported=false`, `conversion_led_decision_supported=false`, `execution_authorized=false` and `writes_allowed=false`.

## Decision priorities

1. Protect near-me, Kreuzberg, brand and open-now demand.
2. First future Google experiment candidate: validated 15-headline/4-description local RSA rebuild for the current POOR group, with no budget/bid/keyword/targeting/tracking/landing change.
3. Do not combine RSA repair with duplicate keyword consolidation.
4. Continue privacy-safe refinement of the remaining 248 unknown entity/phrase rows, prioritizing cost concentration.
5. Review `pizzeria italiana berlin` because of its high CPC/cost share, without pausing it from unverified conversions.
6. Keep dormant-keyword hygiene below live-traffic work while dormant spend remains zero.
7. Do not increase budget until business-outcome measurement/value evidence is sufficient.

## Safety state

`writes_allowed=false`, `execution_allowed=false`, `spend_allowed=false`. Registered conversions were not used to decide keyword quality. No campaign, keyword, ad, targeting, tracking or budget mutation occurred.