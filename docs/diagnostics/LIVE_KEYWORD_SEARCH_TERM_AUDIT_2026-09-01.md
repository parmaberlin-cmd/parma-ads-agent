# Live Keyword + Search-Term Audit — 2026-09-01

Evidence source: GitHub Actions `google-live-access` run **33561666913**, job **100035389632**, against the existing Railway read-only intelligence endpoint for **2026-08-02..2026-08-31**. Production reader remained v3; no deploy was performed.

## Corpus completion

- Keyword rows received: **29**
- Keyword rows audited: **29**
- Unique normalized keywords: **26**
- Cross-ad-group duplicate keywords: **3**
- Search-term rows received: **2,153**
- Search-term rows classified/accounted for: **2,153**
- Search-term rows with clicks/cost: **170**
- Matched keywords producing the observed search-term corpus: **6**
- Search-term match type observed: **BROAD**
- Raw user search terms written to the diagnostic log: **no**

This supersedes the older planning reference to 2,055 rows. The current exact-window payload contains 2,153 rows.

## Keyword portfolio

Keyword-view totals for the 29 rows: **14,483 impressions, 475 clicks, €94.253516**. These totals are not expected to equal campaign totals because the views/scopes differ.

### Concentration

`beste pizza berlin` exists as BROAD in both ad groups and accounts for **379 clicks and €72.2036**, about **79.8% of keyword-view clicks** and **76.6% of keyword-view cost**. This is a structural concentration finding, not proof that the keyword is good or bad.

Other live traffic-bearing rows visible in the full audit include:

- `pizza napoletana berlin` in both ad groups: **41 clicks, €6.3881** combined.
- `pizza bio berlin`: **14 clicks, €4.232568** on the traffic-bearing copy; duplicate exists in the other ad group with zero observed traffic in the window.
- `pizza kreuzberg`: **17 clicks, €0.90**, protected local intent.
- `pizzeria kreuzberg`: **17 clicks, €0.947044**, protected local intent.
- `pizzeria italiana berlin`: **7 clicks, €9.582128**, average CPC about **€1.37**; this is a high-cost structural review priority, not a pause recommendation.

### Duplicate/cannibalization review set

The three exact normalized cross-ad-group overlaps are:

1. `beste pizza berlin`
2. `pizza napoletana berlin`
3. `pizza bio berlin`

They are candidates for routing/consolidation simulation. No deletion or pause is supported from conversion counts because conversion integrity remains unverified.

### Dormant inventory

The remaining inventory contains many exact keywords with zero impressions/clicks/cost in this window, including off-area or other-restaurant/name patterns such as `pizza wilmersdorf`, `pipasa potsdam`, `zero stress`, `l osteria ...`, `döneria berlin`, `alexanderplatz restaurants berlin`, `milano vice pizza berlin`, `toukis pizza`, `toros kreuzberg`, `gambino's by amano`, `nonno mà ristorante pizzeria`, and `mosaiko pizza di napoli berlin`.

Because they generated no observed traffic, they are a **low-impact hygiene/strategy-review set**, not an urgent performance lever. Competitor-like names require an explicit competitor strategy decision rather than automatic exclusion.

## Search-term routing

Search-term-view totals: **13,009 impressions, 403 clicks, €71.312978** across 2,153 rows.

The expanded taxonomy shows:

- `near_me`: **977 rows, 9,666 impressions, 270 clicks, €27.177063** — about **67.0% of search-term clicks** and **38.1% of search-term cost**. This is the dominant query role and is protected because walk-ins may be unmeasured.
- `pizza_generic`: **365 rows, 62 clicks, €19.980581**.
- `other`: **325 rows, 34 clicks, €14.645998** — only about **8.4% of clicks but 20.5% of search-term cost**. This is the highest-priority semantic refinement bucket.
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

No current rows were classified as reservation/direct-order intent by the present deterministic vocabulary in this window; this is an observed taxonomy result, not evidence that those customer journeys do not exist.

## Important routing fact

Within `beste pizza berlin`, the near-me cell alone accounts for **661 search-term rows, 8,250 impressions, 211 clicks and €22.851048**. The broad keyword is therefore functioning substantially as a local/near-me acquisition gateway. Removing or aggressively narrowing it before measuring walk-ins would be unsafe.

## Decision priorities from this audit

1. **Protect local demand.** No negative action on near-me, Kreuzberg, brand or open-now query families.
2. **Fix RSA structure first.** `Gruppo di annunci 1` remains POOR with 7 headlines / 2 descriptions; a complete 15/4 local RSA proposal now exists and changes no budget.
3. **Simulate duplicate routing.** Model consolidation of the three duplicated BROAD keywords without executing it.
4. **Refine the `other` bucket.** It carries disproportionate cost relative to clicks and is the best next corpus-analysis target.
5. **Review `pizzeria italiana berlin`.** Its CPC/cost concentration is unusual relative to its click share, but no pause is justified without semantic and business-outcome evidence.
6. **Deprioritize dormant exact-keyword cleanup.** It has essentially no current spend impact.
7. **Do not increase budget yet.** Conversion/business-value integrity is still unresolved.

## Safety state

`writes_allowed=false`, `execution_allowed=false`, `spend_allowed=false`. Registered conversions were not used to decide keyword quality. No campaign, keyword, ad, targeting, tracking or budget mutation occurred.