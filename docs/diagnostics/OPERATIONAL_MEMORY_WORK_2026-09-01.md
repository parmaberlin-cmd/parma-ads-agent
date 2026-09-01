# Parma Ads Agent — avanzamento operativo del 1 settembre 2026

## Perimetro

Ramo `feature/operational-memory`, basato sulla PR152 al commit
`b6d09baa019df5d372a8443dc9095bd250c8bc0d` (525 test).
La PR150 è proseguita separatamente fino a `f926211f3ee30e650c191d298f5b03339cbbf95b`:
testi RSA, modelli economici e relativo backlog non sono stati duplicati né
modificati da questo lavoro. Nessun merge su main o deploy.

## Lavori eseguiti e test di accettazione

| Funzione | Risultato tecnico | Prova |
| --- | --- | --- |
| Memoria dei report | Confronto con la rilevazione precedente, anche dopo riavvio | Test del bootstrap reale con collector simulati e file di storico locale |
| Priorità senza falsi cambiamenti | Nuove, persistenti, non più osservate, non verificabili; incluse le priorità differite | Nessuna falsa novità quando cambia soltanto l'ordine delle cinque priorità |
| Confronti numerici corretti | Stesso account/query e periodo; variazioni indicate come revisioni | Periodi diversi, baseline mancanti e metriche ignote bloccano il confronto |
| Selezione del lavoro | Esclude attività concluse, già assegnate, bloccate o fallite senza nuove evidenze | Test di dipendenze, cicli, doppioni, operazioni non autorizzate e tentativi esauriti |
| Segnali degli ordini | Candidati GA4 di prodotto, carrello, checkout e completamento, separati dalle prenotazioni | Nessuna somma dei candidati di completamento come vendite reali |
| Riepilogo leggibile | Testo italiano nel riepilogo runtime e strumento offline | Test senza credenziali e con contenuti ostili/errati |
| Dati scaduti | Vecchie raccomandazioni sospese dopo refresh fallito o scadenza | Avanzamento dell'orologio senza refresh: qualità e validazione vengono bloccate |
| Integrità dello storico | File corrotto conservato, non sovrascritto da una baseline vuota | Test verifica byte per byte e assenza di contenuto privato nei log |
| Raccolte parziali | Errore nella raccolta termini distinto da metriche campagne disponibili | Test dedicato sul report integrato |

Le funzioni sono implementate e verificate **offline**. Non è una verifica dei
risultati commerciali e non è una prova della nuova versione su Railway.

## Sicurezza e compatibilità

- Campagne, budget, bidding, keyword, annunci, tracking e credenziali invariati.
- Nessuna spesa, prenotazione, vendita di prova o messaggio esterno.
- Nessuna chiamata GA4 aggiuntiva: si riutilizza l'inventario già letto.
- Nessuna installazione di plugin o servizio a pagamento.
- Storico precedente compatibile; nessuna migrazione distruttiva.
- I test usano directory temporanee proprie, ripulite al termine.
- Il selettore propone lavoro: non avvia autonomamente un esecutore e non
  modifica il modello di autorizzazione dell'agente.
- Il riepilogo non dichiara ordini reali, fatturato o incremento dei clienti
  finché manca la riconciliazione con il gestionale.

## Verifica di consegna

- Suite locale: 609 test superati, 84 nuovi rispetto alla base PR152.
- Controllo sintassi: superato; nuovi moduli esercitati direttamente dai test.
- Audit dipendenze di produzione: zero vulnerabilità.
- Diff senza errori di formattazione.
- CI da verificare sul commit remoto esatto prima della consegna della PR.

## Limiti che restano espliciti

Non confrontiamo due finestre mobili sovrapposte come se fossero ieri e oggi.
Il primo run non dispone ancora di una baseline nuova; vecchi record senza
checkpoint non vengono reinterpretati. Lo storico resta limitato a 90 run,
non a 90 giorni: con refresh orario copre circa 3,75 giorni. Nessuna retention
di produzione è stata modificata.

Una priorità non più osservata non equivale a un problema dimostrato risolto.
Gli eventi GA4 candidati non equivalgono a ordini pagati o ricevuti dal locale.
Non sono state attivate notifiche né è stato avviato lavoro in background
nella chat. Il passaggio a produzione e la validazione live restano separati.
