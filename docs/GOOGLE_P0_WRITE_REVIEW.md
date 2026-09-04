# P0 Google Ads — verifica del 4 settembre 2026

## Mandato attuale
Il limite aggiornato è 10 EUR di spesa effettiva totale al giorno, non 10 EUR
di budget medio. Sostituisce la precedente indicazione di 7,50 EUR di budget medio.
Nessuna modifica alle conversioni primarie. Proteggere ricerche locali/near-me.
Late Night: 22:00–23:00 Europe/Berlin; walk-in non equiparabili a prenotazioni online.

## Evidenza live
Reader campagna 23276824770, periodo 2026-08-28 / 2026-09-03:
- 4.469 impressioni, 129 clic, 23,773819 EUR; 13 conversioni NON riconciliate.
- Due gruppi annunci: 93 e 36 clic, rispettivamente 15,258525 e 8,515294 EUR.
- Keyword broad beste pizza berlin: 19,448573 EUR nei due gruppi.
- Dispositivi: mobile 126 clic, desktop 2, tablet 1.
- RSA: prevalentemente italiano, un GOOD e un POOR.
- Ora 22 (22:00–22:59): 462 impressioni, 14 clic, 5,205616 EUR.
- Query esatte pizza near me / pizza in meiner nähe: 43 clic, 3,211721 EUR.
  Questi numeri coprono solo i termini visibili, non tutte le ricerche possibili.
- Geografia: 125 clic classificati AREA_OF_INTEREST e 4 LOCATION_OF_PRESENCE.
  Non prova dove fossero fisicamente le persone: serve leggere impostazioni e dettaglio locale.
- Questo report non contiene spesa odierna completa né inventario della seconda campagna.

## Strategia pronta da validare, non applicata
1. Conservare le query near-me pertinenti anche se senza conversioni.
2. Verificare presenza locale e area servita prima di cambiare località.
3. Migliorare il copy tedesco e separare cena da ordine diretto.
4. Mantenere e misurare 22–23 separatamente: non dichiarare assenza di erogazione.
5. Misurare clic/costi della fascia e walk-in con evidenza separata.
6. Non utilizzare booking_completed per decidere vincitori o clienti acquisiti.
7. Non escludere indiscriminatamente competitor o località da un solo clic.
8. Non modificare budget prima di validare il limite economico effettivo.

## Codice verificato e corretto
PR #182: mutateResources chiamato esclusivamente con validate_only:true e
partial_failure:false, seguito da rilettura. Non è un esecutore di modifiche reali.
Correzioni aggiunte: inventario mancante/malformato, stati sconosciuti, campagne duplicate,
limiti invalidi, condivisione sconosciuta, somma intera, costruzione client dopo verifica config.
Risultati espliciti execution_allowed:false e hard_daily_spend_cap_verified:false.
Test mirati 10/10; suite del workspace 494/494. Il workspace contiene anche lavoro
precedente: il CI del commit remoto è la verifica della composizione esatta della PR.

## Blocco prima di modifiche reali
Una prova validate_only non garantisce audit/rollback delle operazioni effettive,
consenso di scrittura, esecuzione singola o rispetto del tetto di spesa.
Non usare il suo success:true per abilitare automaticamente l'esecutore.

Google considera per molte campagne il doppio del maggiore budget medio della giornata.
Una riduzione o redistribuzione nel corso del giorno non cancella il massimo precedente.
Non certificare 10 EUR effettivi usando soltanto somma budget <=10 EUR:
https://support.google.com/google-ads/answer/10487143?hl=en

Servono inventario completo e storia dei budget odierni, stato di spesa/contabilizzazione,
applicabilità dei limiti Google e un percorso di modifica realmente autorizzato.
Finché non sono verificati, nessuna ottimizzazione viene applicata. Una pausa/rollback
non recupera la spesa già sostenuta.
