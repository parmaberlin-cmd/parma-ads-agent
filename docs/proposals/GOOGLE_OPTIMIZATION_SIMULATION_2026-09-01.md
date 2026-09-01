# Google Ads optimization simulation — 2026-09-01

Status: proposal/simulation only. No write, merge, deploy, budget change, keyword change, targeting change or ad publication authorized.

## Current read-only evidence — 2026-08-02..2026-08-31

- 16,594 impressions
- 511 clicks
- EUR 103.54 spend
- 10 registered primary conversions, measurement unverified
- Search impression share 12.88%
- Lost IS budget 45.52%
- Lost IS rank 41.60%
- Mobile: 501/511 clicks (98.0%), 97.0% of spend
- Area of interest: 484/511 observed geo clicks (94.7%)
- Location of presence: 27/511 clicks (5.3%)

## Search intent

`near_me` is the dominant cluster: 270 clicks / EUR 27.18, average CPC about EUR 0.10. These searches are protected from premature negative-keyword recommendations because local-intent traffic can create unmeasured walk-ins.

Other observed clusters include generic pizza, Berlin-generic, Italian-style, quality-seeking and local Kreuzberg intent. Registered conversions remain unsuitable as the sole ranking criterion until measurement integrity is reconciled.

## Keyword overlap

Cross-ad-group overlap is confirmed for at least:

- `beste pizza berlin`: 379 clicks / EUR 72.20 across two ad groups
- `pizza napoletana berlin`: 41 clicks / EUR 6.39
- `pizza bio berlin`: 14 clicks / EUR 4.23

Simulation hypothesis: reduce redundant internal competition and clarify ad-group intent. This is not yet a recommendation to pause/remove a keyword because query routing, match types and conversion truth still need reconciliation.

## RSA structure

Weak RSA:
- 7 headlines
- 2 descriptions
- Google Ad Strength: POOR

Stronger RSA:
- 15 headlines
- 4 descriptions
- Google Ad Strength: GOOD

Safe proposal: rebuild the weak RSA to full asset coverage with differentiated local, product-quality and action-oriented messaging. Conversion counts are explicitly excluded from the structural verdict while conversion integrity is unverified.

### Draft asset themes for future review

Headline themes:
- Pizza artigianale a Kreuzberg
- Bio Pizza Berlin Kreuzberg
- Lievito Madre a Berlino
- Pizza vicino Schlesisches Tor
- Ingredienti italiani selezionati
- Pizza italiana a Kreuzberg
- Cena a Wrangelkiez
- Prenota un tavolo da Parma
- Pizza fatta a mano ogni sera
- Sourdough Pizza Berlin
- Pizza Bio in Wrangelstraße
- Italian Pizza Near You
- Cena italiana a Kreuzberg
- Parma Berlin Pizza
- Pizza e vini italiani

Description themes:
- Pizza artigianale con lievito madre e ingredienti selezionati, ogni sera a Kreuzberg.
- A pochi passi da Schlesisches Tor. Tavoli, asporto e pizza italiana fatta a mano.
- Scopri Parma in Wrangelkiez: farine selezionate, salumi italiani e ingredienti di qualità.
- Prenota il tuo tavolo oppure passa direttamente: esperienza italiana nel cuore di Kreuzberg.

These are drafts only and require normal ad-policy/character-length validation before any future publication.

## Rank vs budget

Current snapshot has budget loss (45.52%) slightly above rank loss (41.60%). Earlier snapshots had rank loss above budget loss, so the constraint is not stable enough to justify a simple budget escalation.

Simulation rule:
1. first improve structural relevance / query-to-ad alignment and measurement confidence;
2. estimate incremental eligible traffic after those changes;
3. only then model additional budget;
4. no spend increase while conversion integrity is unverified.

## Mobile priority

With 98% of clicks on mobile, any future optimization plan should treat mobile landing/reservation friction as a P0 commercial surface. No claim is made yet about actual UX failure; this is a prioritization signal from traffic mix.

## Schedule

Highest-click windows include Sunday 19:00, Friday 20:00, Monday 18:00 and several 17:00–21:00 periods. Registered conversion concentration is not trusted enough to authorize schedule changes. Future schedule proposals should use click/impression demand plus verified business outcomes.

## Geography

The observed `AREA_OF_INTEREST` vs `LOCATION_OF_PRESENCE` split is large (about 17.9:1 by clicks). This is descriptive evidence, not proof of wasted traffic. Before any targeting change the Agent must verify campaign location settings semantics and reconcile actual customer value.

## Safe priority order

1. Restore conversion truth / measurement semantics.
2. Resolve overlapping keyword/ad-group structure.
3. Rebuild weak RSA assets.
4. Audit mobile reservation path conceptually and, when accessible, empirically.
5. Validate location-setting semantics.
6. Re-evaluate rank vs budget after structural improvements.
7. Only then simulate spend changes from verified commercial outcomes.

## Rollback principle for any future authorized change

Every mutation package must contain before-state, exact changed entities, expected effect, success/failure thresholds, observation period and reversible rollback instructions. This proposal itself executes nothing.
