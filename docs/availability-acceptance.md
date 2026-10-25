> Release-update 25 oktober: de goedgekeurde leesactivatie is toegepast als migratie 20261025003741. Onderstaande acceptatie beschrijft de toestand v??r release; deployment en scheduler worden apart geverifieerd.

# PLAYER_AVAILABILITY ? definitieve runtime-acceptatie, 24 oktober 2026

**Productieadvies voor de availability-verkoopblocker: GO.** De inconsistente persoonlijke verkoopafweging is gecorrigeerd en opnieuw geaccepteerd. De hieronder beschreven oorspronkelijke bevinding is opgelost. Er is niets gedeployed en geen permanente trigger geactiveerd. In deze acceptatieronde zijn geen productiedata of productie-instellingen gewijzigd.

## Vastgestelde Sheet ? Supabase-status

De handmatige Google-pilot van de gebruiker is geslaagd op 2026-10-24T16:32:14.049Z: 88 actuele rijen, 20 kolommen, 84 matches, 4 unmatched, 0 ambiguous. De echte gepubliceerde CSV is vervolgens met de bestaande collector ingelezen. Alle 84 identiteiten zijn op seizoen, speler-ID en club tegen de productie-spelerssnapshot gecontroleerd.

| Controle | Uitkomst |
|---|---:|
| Sheet-rijen | 88 |
| Gevalideerde gekoppelde spelers | 84 |
| Eerste database-RPC | 84 upserts |
| Identieke tweede database-RPC | 0 writes; 84 unchanged |
| Bewust ongekoppeld | 4 |
| Fouten / dubbele actuele sleutels | 0 / 0 |
| Actuele runtime-rijen | 84 |
| Tabel + index | 73.728 bytes = 72 KiB |
| Nieuwe history-triggers | 0 |
| Handmatige productie-records | 0 v??r en na; ongemoeid |

Teruggelezen speler-ID, percentage, source_hash en observed_at komen voor alle 84 overeen met de Sheet. Ongekoppeld blijven Caio Henrique (Ajax), Mohammed Ihattaren (Fortuna Sittard), Dele Thomas (N.E.C. Nijmegen), Thomas Didillon (Willem II). Geen fuzzy koppelingen.

Alleen opslag/writer-migratie 20261024163635_availability_sheet_current.sql is in de vorige acceptatiefase toegepast. De leesactivatie 20261025003741_availability_sheet_runtime_activation.sql is NIET toegepast in productie. De productieledenfunctie gebruikt de nieuwe bron nog niet.

Bewijsgrens: echte CSV + echte productie-RPC + database-readback zijn gecontroleerd. Het nog niet gedeployde Vercel HTTP-endpoint is lokaal met de echte handler getest; er is geen succesvolle productie-HTTP-aanroep geclaimd.

## Runtime UI

De echte teruggelezen 84 Supabase-records zijn zonder statusaanpassing in een ge?soleerde PostgreSQL-testomgeving geladen. De echte applicatiemodules gebruiken daar de toekomstige gecombineerde leesfunctie. Alle Supabase-browserrequests worden naar localhost onderschept; geen productieaccount of productie-testmutaties.

- Mijn selectie: drie lokale selectiespelers; Unnerstall toont OUT/rugklachten, M?rquez 25%/onbekende blessure. De onvolledige selectie wordt terecht als 3/15 gemarkeerd.
- Spelerprofiel: Unnerstall toont bronlink, observatietijd en verwachte terugkeer 1 november met afgeleide SR11. De status komt uit de echte snapshot.
- Advieskaarten: centrale badges en context zichtbaar, inclusief 50%-twijfelgevallen in Kopen & verkopen. Persoonlijk advies toont de statusreden; inhoudelijk voorbehoud hieronder.
- Captain Radar: persoonlijk Drommel, niet de geselecteerde OUT-speler Unnerstall of 25%-speler M?rquez. Algemene aanbeveling Koeman Jr.; vice-captain Zechi?l.
- Optimizer: succesvolle echte browserworkerberekening voor ??n ronde, 15 spelers, basiself 3-4-3, bank, captain Egbring, vice-captain Schendelaar; 22,15 xP en ?35,2 miljoen resterend. Gebruikt een begrensde pool van 38 echte spelers uit de lokale referentiesnapshot, met dezelfde 84 availability-records. De optionele minimumspeelkansfilter stond uit. Dit is resultaatacceptatie, geen benchmark of acceptatie van een volledige meerweekse zoekopdracht.
- Selectie/profiel, advies, Captain Radar en optimizerresultaat hebben bij 390, 820, 1366 en 1920 px geen horizontale documentoverflow in DOM-metingen. Dit is geen screenshot-gebaseerde pixelbeoordeling.

De eerdere 23-spelerpool bood geen geldige selectie. De testharness is aangepast naar een betaalbare, over clubs verdeelde pool; productielogica is hiervoor niet aangepast.

## Worker en adviesregels

Worker ontvangt expliciet records en ready-status. Zeven tests vergelijken exact de centrale policy ?n de opstellingsuitkomst na structured clone: OUT, 25%, 50%, 75%, 100%, suspension en manual override. Alle zeven slagen. De gecombineerde databaseleesfunctie geeft handmatige records voorrang; die prioriteit is ge?soleerd getest.

Centrale factoren: OUT/suspension 0; 25% 0,10; 50% 0,40; 75% 0,85; 100% 1. OUT/suspension/25% zijn uitgesloten voor nieuwe aankopen en captain. Langdurige bekende OUT (>21 dagen) geeft sterke verkoopcontext. Kort herstel (?7 dagen) bewaart minimaal 80% van meerdaagse waarde. Algemene classificatie houdt 50%-twijfel zonder onafhankelijk negatief signaal vast.

### Oorspronkelijke bevinding (opgelost): persoonlijk transferadvies

Reproduceerbaar met: node scripts/check-availability-runtime-acceptance.mjs

Twee verder gelijkwaardige middenvelders: ieder 10 verwachte punten, 90 minuten en prijs 5; ??n is reeds in bezit; geen transferstraf. Alleen de status van de eigen speler verandert.

| Geval | Algemene actie | Persoonlijk transferadvies |
|---|---|---|
| Zonder statuskorting | consider | geen transfer |
| doubt 50% | hold | verkoop voor alternatief, berekende winst +6 |
| OUT, terug over 3 dagen | hold | verkoop voor alternatief, berekende winst +2 |

Het persoonlijke pad in src/services/personalSelection.js past de puntenkorting toe en presenteert elke positieve winst als transferkandidaat. Het verlangt geen onafhankelijke verkoopreden voor deze hold-gevallen. Daarmee ontstaat juist het statusgedreven verkoopadvies dat niet gewenst is. De acceptatieprobe eindigde v??r de correctie met exitcode 1; na de correctie eindigt hij met 0.

### Centrale correctie en heracceptatie

availabilitySaleDecision in src/services/availability.js bepaalt voor beide adviespaden of availability op zichzelf verkoop rechtvaardigt. Alleen bekende langdurige OUT/schorsing (>21 dagen) mag dat zelfstandig. 25/50/75%, kortdurig OUT en onbekende afwezigheidsduur verlangen aanvullende context. De bestaande risicofactoren, koopuitsluitingen, captain- en workerweging zijn ongewijzigd.

De algemene laag gebruikt deze beslissing met bestaande onafhankelijke context (hoge cautionScore of expliciet geen fixtures). Het persoonlijke transferpad gebruikt dezelfde beslissing en kan bovendien positieve vervangingswinst aantonen: de incoming-score minus de ONGEKORTE punten van de huidige speler minus transferkosten. Daardoor kan een statuskorting op de eigen speler niet meer zelf de verkoopdrempel cre?ren. De statuskorting mag een reeds onderbouwde transfer nog wel versterken. Er worden geen bankdekking, wedstrijdentellingen of andere ontbrekende gegevens verzonnen.

Na correctie geven de exacte oorspronkelijke gevallen doubt50 en shortOUT beide hold en 0 persoonlijke transfers. Langdurig OUT geeft sell en een transfer bij een gelijkwaardig beschikbaar alternatief. 75%, 100% en 25% geven zonder extra reden geen verkoop. Een betere vervanger blijft geldig; een verbetering die volledig door transferkosten wordt opgegeten niet.

De acceptatieprobe is uitgebreid en uitgevoerd met de eerder echt teruggelezen Supabase-snapshot van 84 records: alle originele statussen geven in beide paden dezelfde zelfstandige verkoopbeslissing bij verder gelijkwaardige alternatieven. Dit hergebruikt de vastgelegde snapshot; er is geen nieuwe live fetch of productiewijziging gedaan.

Commando: node scripts/check-availability-runtime-acceptance.mjs test-results/availability-runtime-snapshot.json

Resultaat: PASS, 84/84 consistent. Tien nieuwe regressietests dekken A?F, onbekende schorsingsduur, onafhankelijke winst inclusief transferkosten en effectieve handmatige override. Worker/hoofdthread en captainregressies blijven groen.

### Schorsingen: grens van de bron

De huidige Sheet bevat geen betrouwbare telling van resterende schorsingswedstrijden. Suspension wordt veilig uitgesloten zolang de status actief is. Een beschikbare terugkeerdatum kan aan echte fixtures worden gekoppeld voor de UI, maar er is geen geverifieerde automatische aftelling van N wedstrijden of ronde-afhankelijke vrijgave in de optimizer. Geen wedstrijdduur verzonnen; dit onderdeel is niet als volledig groen afgetekend.

## Failsafe en tests

Opnieuw geslaagde ge?soleerde keten: eerste/tweede import, statuswijziging, lege/misvormde/onvolledige bron, verdwenen speler, unmatched/ambiguous, onbereikbare Sheet, databasefout, volgende geslaagde sync, handmatige prioriteit. Fouten wissen de bestaande actuele statussen niet. Een verdwenen bronkaart wordt nooit automatisch fit. Een geldige deelverzameling verwijdert geen ontbrekende runtime-rijen; semantische volledigheid van elke bronclub kan niet volledig worden bewezen.

- 207 regressietests: geslaagd (197 bestaande + 10 nieuwe).
- 291 database/securitycontroles: geslaagd (39 + 97 + 155).
- 21 gerichte availability/worker/backendtests: geslaagd (overlappen deels met regressies).
- Ge?soleerde PostgreSQL-keten met echte handler/RPC: geslaagd.
- Productiebuild: geslaagd.
- Aanvullende persoonlijke-adviesacceptatie: geslaagd, inclusief 84 echte snapshot-records.

Bekende Supabase-advisories uit de voorgaande controle: RLS zonder direct beleid op de private runtimetabel is bewust deny-by-default, toegang uitsluitend via gecontroleerde functies. Bestaande pg_net-public-schema- en leaked-password-protection-waarschuwingen zijn niet gewijzigd.

## Resources en activering

| Onderdeel | Begroting na eventuele uurlijkse activering |
|---|---|
| HTML-bron | maximaal 24 pogingen/dag, harde Apps Script-guard van 60 minuten |
| ESPN-aliasbron | maximaal 24 bulkrequests/dag |
| Sheet-observatievelden | maximaal 2.112 rijupdates/dag bij 88 rijen; historie alleen bij inhoudelijke verandering |
| Backend/CSV | maximaal 24 invocations/fetches per dag indien scheduler eenmaal per uur wordt ingesteld |
| Supabase Edge Functions | 0 nieuwe invocations; backend is Vercel |
| Supabase runtime | maximaal circa 2.016 actuele rijupdates/dag bij 84 nieuwe uurlijkse observatietijden; identieke observatie 0 writes |
| Opslag | 84 actuele rijen, gemeten 72 KiB incl. index; geen nieuwe uurhistorie |
| Logs | samenvattingen en uitvoeringslogs, geen SQL-logtabel per speler/sync |

De backend zelf bevat nog geen harde 60-minuten-throttle: de begroting veronderstelt een toekomstige uurscheduler en geldige scheduler-authenticatie. Er is nu geen permanente scheduler geactiveerd. Bronfetch is w?l hard begrensd. Herhaalde identieke databasebatches schrijven niets; nieuwe observatietijden schrijven bewust de actuele heartbeat. Normale PostgreSQL dead tuples en nieuwe spelers/seizoenen kunnen fysieke opslag laten groeien; nul groei wordt niet beloofd. Dagelijks logvolume kan zonder actieve scheduler niet empirisch worden vastgesteld.

## Besluit

**GO: de aangewezen NO-GO blocker is opgelost.** Beide adviespaden gebruiken de centrale availability-verkoopbeslissing. Alle 207 regressies, 291 database/securitycontroles, 3 backendtests, ge?soleerde databaseketen en productiebuild zijn groen. git diff --check is groen.

Schorsingsduur blijft beperkt tot betrouwbare broninformatie; geen verzonnen wedstrijdenteller. Geen nieuwe browserronde nodig voor deze uitsluitend logische wijziging: de eerder gecontroleerde UI-compositie is ongemoeid; de actuele heracceptatie is uitgevoerd op de adviesfuncties met echte snapshot-statussen.

Niet gedeployed. Publieke leesactivatie niet toegepast. Geen permanente trigger aangemaakt. Geen productiedata, schema, Apps Script of frontendlayout gewijzigd tijdens deze correctie.
