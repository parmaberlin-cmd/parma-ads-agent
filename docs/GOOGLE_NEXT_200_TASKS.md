# Parma Ads Agent — prossimi 200 compiti

## Perimetro
Mandato ricevuto nella conversazione: massimo 7,50 EUR/giorno di budget medio totale; redistribuzione tra le due campagne esistenti e modifiche ad annunci, keyword, esclusioni, orari e targeting locale. Non equivale a consenso OAuth di scrittura né a tetto rigido della spesa effettiva giornaliera. Nessun aumento totale, nuova campagna, modifica credenziali o tracking.

## Regole di esecuzione
Questa è una coda di lavoro, non una dichiarazione che 200 attività siano già eseguite. Ogni riga è un risultato verificabile. [ ] = da completare; [x] = completato con evidenza. Le verifiche live richiedono accessi disponibili; osservazioni storiche richiedono tempo. I task 11–20 coprono il solo contratto interno, non certificano la completezza del reader live. Le dipendenze prevalgono sulla numerazione: nessuna scrittura prima dei controlli 141–180. Le attività di tracking sono diagnostiche, non autorizzazioni a cambiarlo. Pubblicazione e spesa restano disabilitate finché i requisiti tecnici non sono soddisfatti.

## 1. Mandato e perimetro

- [ ] 1. Persistire il mandato ricevuto: budget medio totale 7,50 EUR/giorno.
- [ ] 2. Registrare la redistribuzione autorizzata tra le due campagne esistenti.
- [ ] 3. Registrare le modifiche autorizzate ad annunci, keyword, esclusioni, orari e targeting locale.
- [ ] 4. Separare nel mandato le azioni escluse: nuovi budget totali, nuove campagne, tracking e credenziali.
- [ ] 5. Identificare con lettura live l’account pubblicitario effettivo.
- [ ] 6. Identificare con lettura live la seconda campagna e i suoi ID.
- [ ] 7. Associare il mandato ai due ID verificati senza inferirli dai nomi.
- [ ] 8. Definire una scadenza tecnica prudente del mandato, senza inventare consenso permanente.
- [ ] 9. Implementare revoca e sospensione del mandato.
- [ ] 10. Visualizzare al proprietario il perimetro operativo effettivamente abilitato.

## 2. Inventario budget

- [ ] 11. Definire il contratto interno per un inventario completo di campagne e budget.
- [ ] 12. Validare ID di account, campagne e budget come stringhe numeriche.
- [ ] 13. Validare importi in micros interi senza arrotondamenti silenziosi.
- [ ] 14. Rifiutare inventari vuoti, incompleti o dichiarati non completi.
- [ ] 15. Rifiutare campagne duplicate.
- [ ] 16. Rifiutare lo stesso budget riportato con importi discordanti.
- [ ] 17. Contare ogni budget condiviso una sola volta nel totale.
- [ ] 18. Includere i budget delle campagne in pausa nel controllo conservativo.
- [ ] 19. Rifiutare snapshot scaduti, futuri o con orologio non valido.
- [ ] 20. Verificare automaticamente casi validi, avversi e overflow dell’inventario.

## 3. Collettore live

- [ ] 21. Collegare il contratto inventario al reader Google esistente.
- [ ] 22. Raccogliere l’intero account, non soltanto le due campagne autorizzate.
- [ ] 23. Completare tutte le pagine di risposta prima di dichiarare l’inventario completo.
- [ ] 24. Rilevare pagine ripetute o interrotte.
- [ ] 25. Confrontare account richiesto e account effettivamente restituito.
- [ ] 26. Raccogliere valuta dell’account.
- [ ] 27. Raccogliere fuso orario dell’account.
- [ ] 28. Identificare budget condivisi con campagne fuori mandato.
- [ ] 29. Salvare timestamp e versione del collettore.
- [ ] 30. Confrontare un inventario live con l’interfaccia Google Ads.

## 4. Qualità e provenienza dei dati

- [ ] 31. Distinguere dati live, cache e fixture nei risultati.
- [ ] 32. Impedire a input del modello di dichiararsi fonti attendibili.
- [ ] 33. Conservare l’hash dello snapshot usato per ogni proposta.
- [ ] 34. Conservare errori parziali senza trasformarli in valori zero.
- [ ] 35. Rilevare importi o contatori fuori intervallo.
- [ ] 36. Rilevare cambi di account tra due letture.
- [ ] 37. Verificare coerenza del periodo tra tutti i report.
- [ ] 38. Segnalare righe mancanti senza stimarle come dati reali.
- [ ] 39. Mascherare segreti nelle risposte diagnostiche.
- [ ] 40. Testare la rimozione di dati personali non necessari.

## 5. Conversioni e ordini

- [ ] 41. Inventariare le conversion action Google Ads.
- [ ] 42. Distinguere conversioni primarie e secondarie.
- [ ] 43. Distinguere data del clic e data della conversione.
- [ ] 44. Allineare fusi orari GA4 e Google Ads.
- [ ] 45. Allineare gli intervalli dei due reader.
- [ ] 46. Distinguere attribuzione di sessione e attribuzione dell’evento.
- [ ] 47. Determinare con evidenza cosa genera booking_completed.
- [ ] 48. Verificare la semantica di table_reservation_completed.
- [ ] 49. Identificare l’evento effettivo degli ordini online.
- [ ] 50. Confrontare conteggi con ordini Wix senza esportare dati clienti.

## 6. Funnel degli ordini

- [ ] 51. Misurare accessi alla pagina ordini.
- [ ] 52. Misurare visualizzazioni dei prodotti dove disponibili.
- [ ] 53. Misurare aggiunte al carrello dove disponibili.
- [ ] 54. Misurare avvii del checkout dove disponibili.
- [ ] 55. Misurare ordini completati e annullati separatamente.
- [ ] 56. Verificare eventuali duplicazioni dello stesso ordine.
- [ ] 57. Identificare interruzioni tra sito e checkout esterno.
- [ ] 58. Controllare comportamento del consenso analytics.
- [ ] 59. Distinguere ordini per ritiro e consegna, se i dati lo consentono.
- [ ] 60. Documentare lacune del funnel senza modificare tracking.

## 7. Pagina di destinazione

- [ ] 61. Verificare l’URL pubblico esatto degli ordini.
- [ ] 62. Controllare eventuali redirect dell’URL annunci.
- [ ] 63. Verificare raggiungibilità mobile della pagina.
- [ ] 64. Controllare visibilità del pulsante per ordinare.
- [ ] 65. Controllare leggibilità del menu su smartphone.
- [ ] 66. Verificare presenza chiara del ritiro al locale.
- [ ] 67. Verificare disponibilità reale della consegna prima di pubblicizzarla.
- [ ] 68. Verificare coerenza tra orari pagina e servizio.
- [ ] 69. Verificare costi e condizioni visibili prima del pagamento.
- [ ] 70. Documentare errori bloccanti del checkout senza creare ordini reali.

## 8. Diagnosi delle campagne

- [ ] 71. Leggere metriche recenti di entrambe le campagne.
- [ ] 72. Confrontare periodi omogenei senza includere giorni incompleti.
- [ ] 73. Separare performance per dispositivo.
- [ ] 74. Separare performance per fascia oraria.
- [ ] 75. Separare performance per giorno della settimana.
- [ ] 76. Leggere impressioni perse per budget e ranking.
- [ ] 77. Leggere stato e motivi di limitazione degli annunci.
- [ ] 78. Leggere strategia di offerta senza cambiarla.
- [ ] 79. Ricostruire modifiche recenti disponibili.
- [ ] 80. Conservare una baseline prima degli interventi.

## 9. Termini di ricerca

- [ ] 81. Raccogliere termini di ricerca con costi e clic.
- [ ] 82. Segnalare la copertura incompleta dei termini visibili.
- [ ] 83. Separare ricerche del marchio da ricerche generiche.
- [ ] 84. Distinguere intento cena da intento ordine.
- [ ] 85. Identificare località chiaramente fuori servizio.
- [ ] 86. Identificare richieste chiaramente non pertinenti.
- [ ] 87. Valutare nomi concorrenti caso per caso senza esclusioni automatiche indiscriminate.
- [ ] 88. Classificare termini ambigui come da osservare.
- [ ] 89. Ordinare sprechi potenziali per costo ed evidenza.
- [ ] 90. Produrre proposte motivate di esclusione, verificabili singolarmente.

## 10. Keyword e conflitti

- [ ] 91. Inventariare keyword e corrispondenze attive.
- [ ] 92. Individuare sovrapposizioni tra gruppi annunci.
- [ ] 93. Valutare la concentrazione su beste pizza berlin.
- [ ] 94. Preparare varianti locali coerenti con il servizio.
- [ ] 95. Preparare keyword per ordini diretti.
- [ ] 96. Preparare keyword per cena al locale.
- [ ] 97. Rilevare conflitti tra negative e keyword positive.
- [ ] 98. Verificare che negative di account non blocchino il marchio.
- [ ] 99. Controllare duplicati prima di ogni aggiunta.
- [ ] 100. Validare proposte con corrispondenza e destinazione esplicite.

## 11. Annunci RSA

- [ ] 101. Inventariare testi, URL, pinning e stato RSA.
- [ ] 102. Preparare copy tedesco per cena al locale.
- [ ] 103. Preparare copy tedesco per ordine diretto.
- [ ] 104. Verificare limiti dei singoli titoli.
- [ ] 105. Verificare limiti delle descrizioni.
- [ ] 106. Eliminare ripetizioni inutili tra asset.
- [ ] 107. Verificare veridicità di prezzi, orari e promesse.
- [ ] 108. Evitare promesse di consegna non verificate.
- [ ] 109. Confrontare testo proposto e originale prima della pubblicazione.
- [ ] 110. Conservare identificativi e risultati della revisione Google.

## 12. Asset e presenza locale

- [ ] 111. Inventariare sitelink esistenti.
- [ ] 112. Preparare sitelink diretto agli ordini.
- [ ] 113. Preparare sitelink per prenotare un tavolo.
- [ ] 114. Verificare URL del menu.
- [ ] 115. Verificare asset di chiamata e relativo numero.
- [ ] 116. Verificare collegamento del profilo attività agli annunci.
- [ ] 117. Controllare indirizzo e indicazioni stradali.
- [ ] 118. Controllare coerenza degli orari pubblici.
- [ ] 119. Valutare callout veritieri senza nuove promesse commerciali.
- [ ] 120. Distinguere interventi Ads autorizzati da modifiche al profilo Maps.

## 13. Targeting e orari

- [ ] 121. Leggere le località effettivamente incluse.
- [ ] 122. Leggere esclusioni geografiche esistenti.
- [ ] 123. Verificare presenza locale rispetto a interesse per la località.
- [ ] 124. Confrontare area servita e targeting.
- [ ] 125. Verificare impostazioni linguistiche.
- [ ] 126. Verificare pianificazione reale rispetto al nome Dinner.
- [ ] 127. Allineare annunci ordini alla disponibilità effettiva.
- [ ] 128. Valutare fascia late dinner con dati verificabili.
- [ ] 129. Controllare sovrapposizione geografica delle due campagne.
- [ ] 130. Preparare modifiche geografiche e orarie con prima/dopo.

## 14. Redistribuzione del budget

- [ ] 131. Rappresentare il tetto autorizzato come 7.500.000 micros.
- [ ] 132. Impedire somme finali superiori al tetto.
- [ ] 133. Gestire la redistribuzione come un’unica proposta composta.
- [ ] 134. Verificare il totale anche tra le operazioni intermedie.
- [ ] 135. Impedire aumento prima della riduzione quando supererebbe il tetto.
- [ ] 136. Rifiutare budget condivisi non pienamente compresi.
- [ ] 137. Non redistribuire sulla sola base di conversioni semanticamente incerte.
- [ ] 138. Limitare cambi ripetuti prima di poter misurarne l’effetto.
- [ ] 139. Registrare motivazione e dati di ogni redistribuzione.
- [ ] 140. Mostrare che budget medio non equivale a tetto rigido della spesa giornaliera.

## 15. Autorizzazioni tecniche

- [ ] 141. Persistire il mandato in una fonte server-side attendibile.
- [ ] 142. Associare ogni proposta alla versione del mandato.
- [ ] 143. Separare consenso di lettura e consenso di scrittura.
- [ ] 144. Non riutilizzare parma.read per operazioni di modifica.
- [ ] 145. Validare la presenza di un’autorizzazione tecnica effettiva.
- [ ] 146. Rifiutare azioni fuori dalla lista consentita.
- [ ] 147. Rifiutare campi non previsti dal contratto.
- [ ] 148. Impedire bypass mediante flag approved forniti dal chiamante.
- [ ] 149. Invalidare proposte quando cambia il mandato.
- [ ] 150. Testare che la revoca blocchi anche proposte già preparate.

## 16. Esecuzione controllata

- [ ] 151. Implementare un adattatore di modifica disabilitato per impostazione predefinita.
- [ ] 152. Consentire soltanto i campi esplicitamente supportati.
- [ ] 153. Eseguire validazione della piattaforma prima delle modifiche.
- [ ] 154. Rileggere lo stato immediatamente prima di applicare.
- [ ] 155. Bloccare proposte con stato iniziale cambiato.
- [ ] 156. Serializzare le modifiche sullo stesso account.
- [ ] 157. Impedire esecuzione doppia della stessa proposta.
- [ ] 158. Registrare separatamente esito certo e incerto.
- [ ] 159. Non ritentare alla cieca una modifica dall’esito incerto.
- [ ] 160. Verificare lo stato finale tramite nuova lettura.

## 17. Registro e recupero

- [ ] 161. Creare registro persistente delle intenzioni di modifica.
- [ ] 162. Registrare timestamp, account e proposta senza segreti.
- [ ] 163. Registrare l’esito di ogni operazione.
- [ ] 164. Testare arresto tra invio e conferma.
- [ ] 165. Testare riavvio con operazioni incomplete.
- [ ] 166. Riconciliare operazioni incerte tramite lettura.
- [ ] 167. Gestire errori parziali senza dichiarare successo totale.
- [ ] 168. Preparare compensazioni solo su stato ancora compatibile.
- [ ] 169. Distinguere ripristino configurazione da recupero della spesa.
- [ ] 170. Verificare backup e recuperabilità del registro.

## 18. Sicurezza operativa

- [ ] 171. Implementare arresto d’emergenza verificato a ogni esecuzione.
- [ ] 172. Bloccare scritture se il registro non è disponibile.
- [ ] 173. Bloccare scritture se il collector è degradato.
- [ ] 174. Bloccare scritture se account o valuta cambiano.
- [ ] 175. Applicare scadenza alle proposte.
- [ ] 176. Limitare il numero di modifiche per ciclo.
- [ ] 177. Testare concorrenza tra due processi.
- [ ] 178. Testare richieste malformate e replay.
- [ ] 179. Verificare assenza di segreti nei log di errore.
- [ ] 180. Verificare che aggiornamenti del software non abilitino scritture automaticamente.

## 19. Misurazione dei risultati

- [ ] 181. Misurare costi effettivi per periodo nel fuso corretto.
- [ ] 182. Segnalare ritardi dei dati di spesa.
- [ ] 183. Separare clic, ordini verificati e prenotazioni verificate.
- [ ] 184. Confrontare costo per ordine solo con conversioni affidabili.
- [ ] 185. Confrontare giorni della settimana equivalenti.
- [ ] 186. Annotare cambi al sito e indisponibilità del servizio.
- [ ] 187. Evitare conclusioni definitive su campioni troppo piccoli.
- [ ] 188. Valutare impatto delle modifiche per obiettivo.
- [ ] 189. Produrre un report sintetico con fatti e incertezze.
- [ ] 190. Conservare raccomandazioni scartate e relativa motivazione.

## 20. Rilascio e gestione continuativa

- [ ] 191. Verificare sintassi e suite completa prima del rilascio.
- [ ] 192. Verificare dipendenze senza ignorare vulnerabilità.
- [ ] 193. Verificare CI sul commit esatto da rilasciare.
- [ ] 194. Documentare quali capacità sono implementate e quali no.
- [ ] 195. Verificare deployment senza modificare autorizzazioni implicite.
- [ ] 196. Completare il consenso tecnico richiesto con il proprietario, se necessario.
- [ ] 197. Eseguire una prima modifica limitata entro il mandato e verificarla.
- [ ] 198. Controllare il risultato dopo un intervallo di osservazione adeguato.
- [ ] 199. Attivare un controllo ricorrente solo con un meccanismo realmente configurato.
- [ ] 200. Rivedere le priorità in base a ordini e clienti verificati, non al numero di task.
