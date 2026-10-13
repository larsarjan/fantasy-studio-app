# Performance en centrale sync - productieacceptatie 13 oktober 2026

## Scope en basis

Basis: e0713bdf5036eabfaf1bdc89d8f0a4c4ee388594. Implementatie: 9b20a19 plus de acceptatiecommit die dit document bevat. Bestaande losse gebruikersbeheerwijzigingen zijn niet opgenomen. Bestaand Supabase-project rzunbquzffdivlpuomjc en Vercel-project fantasy-studio-app; geen nieuwe projecten of betaalde diensten.

## Gemeten resultaat

Zelfde Windows-testmachine, echte ingelogde data, volledige paginanavigaties. Browsermetingen bevatten CLI-overhead en meten gereed gerenderde inhoud, niet Lighthouse/LCP. Voor: 578 spelers; actuele productie: 579. Routevergelijking gebruikt een lege eigen selectie en warme browsercache.

| Onderdeel | Voor | Na productie | Verbetering |
|---|---:|---:|---:|
| Dashboard desktop | 87,8 s | 5,8 s | 93,4% |
| Spelers desktop | 19,0 s | 2,3 s | 88,1% |
| Speelschema desktop | 4,5 s | 1,3 s | 70,1% |
| Historie desktop | 2,3 s | 1,2 s | 47,5% |
| Dashboard tablet | 86,6 s | 5,7 s | 93,4% |
| Dashboard mobiel | 84,4 s | 5,8 s | 93,2% |
| Analyse CPU, dezelfde lokale snapshot | 4,542 s | 1,395 s | 69,3% |
| Modelpariteit-worker, dezelfde bron | 5,072 s | 1,459 s | 71,2% |
| Referentiedata warm | 40 requests / 13.752.687 bytes | 1 request / 483 bytes | 97,5% minder requests; >99,99% minder JSON |
| Referentiedata cold | 40 requests / 13.752.687 bytes | 37 requests / 13.795.540 bytes | 7,5% minder requests; actuele dataset iets groter |
| Alle Supabase-requests, warm Dashboard | 53 | 14 | 73,6% |
| Volledig verse Studio-login/load | Niet apart gemeten | 8,32 s | Geen vergelijkbare nulmeting |
| Warme Studio-load, verse sessie | Niet apart gemeten | 5,51 s | - |
| Sync bij ongewijzigde bron | Geen serverflow | 2,9-5,0 s | Geen modelberekening of publicatie |

Cold in de verse sessie begint bij indienen van de login, zonder opgeslagen Studio-assets of snapshot. Aanvullende cachetest met alleen lege IndexedDB: 6,65 s; warm 5,97 s. Totale resource-count daar 97 -> 61, Supabase 50 -> 14. Een oude snapshot-ID in de lokale cache werd automatisch vervangen door de nieuwe cloudsnapshot bij openen van Studio.

Met 15 echte spelers, captain, vice-captain en bekend budget: Dashboard 5,48 s, Spelers 2,07 s, Captain Radar 1,11 s. Selectie en budget bleven na herladen behouden; captainadvies kwam uit de eigen selectie.

## Bottlenecks en hergebruik

Herhaald normaliseren van clubnamen, lineair zoeken in wedstrijdstatistieken/fixtures en dubbele analyses waren CPU-hotspots. Bestaande modellen zijn behouden; begrensde caches en dataset-indexen hergebruiken identieke resultaten en worden bij een nieuwe snapshot geleegd. De 16 datasets zijn rij voor rij gelijk aan de oorspronkelijke berekening, uitgezonderd de berekeningstimestamp.

Zware schermen laden lazy. Manager-teamstatus is uit de optimizer gehaald zonder gedragswijziging. Een lege selectie start geen persoonlijke analyses. Snapshotdata en snapshot-ID worden in een IndexedDB-transactie bewaard. Een ongewijzigde snapshot vraagt alleen metadata op. De eerste download blijft circa 13,8 MB JSON; die is niet als opgelost payloadprobleem gepresenteerd.

## Serverflow en scheduler

POST /api/reference-sync haalt 14 bestaande Sheets-tabbladen op en gebruikt dezelfde normalisatie en scoreberekening als de bestaande import. SHA-256 over de bron inclusief modelversie voorkomt onnodige herberekening/publicatie bij gelijkblijvende bron. Niet-geactiveerde transferdatasets blijven behouden.

Supabase pg_cron job fantasy-studio-reference (job 6), schema `7,37 * * * *`: elke 30 minuten, op minuut 07 en 37. Geen browserimport of clientscheduler. Bestaande andere jobs blijven intact. Een geheim uit Supabase Vault beveiligt scheduler-aanroepen; uitsluitend de serverrol kan dit verifiëren. Handmatige import vereist zowel data.correct als sync.run en een geldig Auth-account. Service-role blijft server-side.

Databaselease van maximaal vijf minuten, advisory lock en unieke running-index blokkeren parallelle publicatie. Alle 16 datasets moeten aanwezig zijn; lege kerndatasets en meer dan 20% krimp worden geweigerd. Publicatie en importregistratie gebeuren in dezelfde transactie. Fouten bewaren de vorige snapshot en worden zichtbaar gelogd. Logs worden 30 dagen bewaard.

Admin Data toont bron, laatste succesvolle publicatie, laatste poging, status, duur, aantallen en foutmelding, plus Nu synchroniseren. Zowel API als echte Admin-knop zijn live getest.

## Migraties en indexes

- 20261013133121_reference_sync_pipeline.sql: daadwerkelijk door Supabase geregistreerde versie; lokale bestandsnaam daarop afgestemd. Slechts eenmaal toegepast.
- 20261013133835_reference_sync_duration.sql: duur telt ook databasepublicatie mee; finished_at gebruikt clock_timestamp.

Nieuwe indexes: unieke actieve lease (correctheid) en started_at voor laatste 20 runs. Lokale EXPLAIN ANALYZE met 1.440 logregels: top-N sort/scan 1,549 ms -> indexscan 0,100 ms. Geen extra voetbaldata-indexen toegevoegd zonder aantoonbaar nut.

## Live bewijs

Echte handmatige publicatie: 2026-10-13T13:33:56.404186Z, snapshot 5d16b77c-8037-42f5-9ad0-94309cf29efb. Records: spelers 579; historisch 513; fixtures 306; Europees 44; ratings 18; results 4282; metadata 592; player_match_stats 4500; elite_stats 8902; elite_transfers 6017; elite_sync 1530; chips 247; formaties 0; club_exposure 979; transferdatasets 0.

De eerste run registreerde 8,71 s voorbereiding, nog exclusief het afronden van de publicatie. Dat getal is bewust niet als volledige syncduur gebruikt. De vervolgmigratie corrigeert deze duurmeting voor volgende runs. Ongewijzigde runs zijn gemeten op 2,9-5,0 s.

- Member: HTTP 403; anoniem: 401; fout scheduler-token: 403.
- Member kan lease-/scheduler-RPC niet uitvoeren en ziet geen operationele synclogs.
- Tijdelijk account met exact admin.access, data.view, data.correct, sync.view, sync.run mocht synchroniseren; geen admin/super_admin-rol.
- Gelijktijdige tweede sync: 409; ongewijzigde herhaling: bestaande snapshot, geen nieuwe import.
- Incomplete publicatie live geweigerd; snapshot-ID en echte dataset bleven intact. Alleen de eigen fouttest-logregel is daarna opgeruimd.
- Echte automatische cron-run gestart 13:37:00 UTC; serverrun 13:37:01 UTC, succesvol unchanged in 5,036 s.
- Gewone member ontving nieuwe snapshot zonder handmatige bronimport.
- Vercel-logscan bevatte alleen verwachte 200/401/403/409 voor de sync-route, geen 5xx.

## Tests en cleanup

132 regressietests; 18 gerichte JS sync/cache-tests (waarvan 9 server-securitytests); 23 lokale sync/atomiciteit/RLS-checks; 39 bestaande databasechecks; 97 admin/RLS-checks; 128 HTML/securitychecks. Build geslaagd. Modelpariteit van alle 16 datasets eerder bewezen en behouden.

21 Studio-route/breedtechecks (1440/768/390) en 10 publieke route/breedtechecks zonder horizontale overflow. De bestaande mobiele tooltip-overflow in Speelschema is gericht verholpen. Geen redesign.

Tijdelijke rechten eerst ingetrokken en member-denial opnieuw getest. Daarna account verwijderd. SQL bevestigde nul Auth-users, sessies, profielen, selecties, selectieversies, userrollen, tijdelijke rollen en tijdelijke permissies voor dit account. De 579 echte spelers bleven staan. Registratieconfiguratie is niet gewijzigd.

## Beperkingen / beheer

Geen nieuwe security-advisorfouten. Twee bestaande waarschuwingen blijven: pg_net in public en gelekte-wachtwoordcontrole uit. Performance-advisor noemt drie niet-geindexeerde foreign keys van het begrensde sync-log op informatieniveau; bij deze kleine logtabel is geen aanvullende index gerechtvaardigd. Andere bestaande adviezen zijn buiten deze scope gehouden.

Een werkelijk nieuwe snapshot blijft circa 13,8 MB JSON. De grote verkeerswinst geldt voor hergebruik van dezelfde snapshot. Er is geen vergelijkbare oude volledig koude browsersessiemeting, dus daarvoor is geen verbeterpercentage verzonnen. Schermtijden zijn machineafhankelijk.

De scheduler is actief in het bestaande project. Definitieve release-identiteit: https://fantasyvoetbaltalk.nl/release.json; moet gelijk zijn aan GitHub main. Productie: https://fantasyvoetbaltalk.nl/studio/dashboard en /admin/data.
