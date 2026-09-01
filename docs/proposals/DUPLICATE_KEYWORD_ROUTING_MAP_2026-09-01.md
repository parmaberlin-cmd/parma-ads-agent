# Duplicate BROAD Keyword Routing Map — 2026-09-01

Source: live read-only keyword/search-term audit for 2026-08-02..2026-08-31. Proposal/simulation only.

## Duplicate set

| Keyword | Current POOR 7/2 RSA group | Observed GOOD 15/4 RSA group | Combined observed traffic | Current decision |
|---|---:|---:|---:|---|
| `beste pizza berlin` | 147 clicks / €20.66 | 232 clicks / €51.5436 | 379 clicks / €72.2036 | Do not consolidate before RSA structural repair |
| `pizza napoletana berlin` | 18 clicks / €2.5721 | 23 clicks / €3.8160 | 41 clicks / €6.3881 | Observe after RSA structures are comparable |
| `pizza bio berlin` | 0 clicks / €0 | 14 clicks / €4.2326 | 14 clicks / €4.2326 | Observe after RSA structures are comparable |

The group label returned by the current production payload for the GOOD RSA appears malformed in the source data. This document therefore identifies it by its observed **GOOD / 15-headline / 4-description** structure rather than treating the malformed label as canonical identity.

## Why no consolidation yet

The duplicate keywords currently route into ad groups with materially different RSA structures. If a keyword were removed from one group at the same time the POOR RSA were rebuilt, later traffic changes could not be attributed cleanly to creative structure versus routing.

The safe sequence is:

1. prepare/approve RSA structural repair;
2. change only RSA assets if separately authorized;
3. observe traffic under unchanged keywords/budget;
4. then reassess duplicate routing;
5. only then prepare a keyword mutation package if evidence still supports it.

## Local-intent guard

`beste pizza berlin` is not merely generic Berlin traffic. Its search-term corpus contains a dominant near-me role, including 211 near-me clicks across both ad groups. Consolidation must preserve that acquisition route and must not be implemented as a negative-keyword shortcut.

## What can be measured before conversion integrity is fixed

- impressions and clicks by duplicated keyword and ad group;
- CTR/CPC and routing share;
- RSA structural state/ad strength;
- intent mix in the privacy-safe search-term taxonomy.

Registered conversion differences are not used to choose the destination group while conversion integrity is unverified.

## Mutation safety

No keyword pause/removal is authorized. No budget change is proposed. No negative is proposed. No campaign write occurred.

`routing_map_complete=true`

`consolidation_execution_supported=false`

`writes_allowed=false`