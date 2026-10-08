# Prijsvoorspelling — productieacceptatie

Model: `empirical-window-v2.1`. Studio-route: `/studio/prices`.

## Werkelijke bron en import

De aangeleverde ZIP is eenmaal gestreamd naar een lokale, genegeerde compacte cache. Er zijn **1.164 snapshotmomenten met 696.030 spelerwaarnemingen** verwerkt, van 6 september tot 8 oktober 2026. Alle CSV/JSON-paren zijn gecontroleerd op speler-ID, prijs, ownership en transfertellers; geen bestandsfouten. Vier ingesloten ZIP-kopieën zijn overgeslagen omdat de bijbehorende CSV/JSON al aanwezig zijn. Tijdstempels komen uit de expliciete CSV-offset, niet uit bestandsnamen. De laatste rijtijd geldt als moment waarop de volledige snapshot beschikbaar was.

Er zijn **220 echte prijswijzigingen: 38 stijgingen en 182 dalingen**, telkens één prijseenheid (€0,1). De live collector heeft daarna drie aanvullende dalingen gedetecteerd (N. Amrabat, De Ruijter, Van der Heide) en de cycli gereset: totaal bij acceptatie **223 events, 38 stijgingen en 185 dalingen**. Deze drie hebben een meetgat en worden niet als nauwkeurig getimede updates gepresenteerd. Geen synthetische marktdata is naar productie geschreven. Import is append-only en hervatbaar; conflicterende bronrecords worden niet overschreven. Oudere tussenmetingen worden conform retentie op uur-/dagresolutie bewaard. Bij controle stonden circa 277.000 compacte bronrecords in de database; dit aantal verandert door nieuwe metingen en retentie. Alle events met hun exacte reset-, voor- en nameting blijven bewaard.

**87 wijzigingen** zijn pas na een meetgat groter dan 45 minuten gezien en uitgesloten van nauwkeurige timing/kalibratie. Detectieclusters (UTC): 7 september 08:33, 8 september 21:50, 14 september 21:30, 19 september 21:30, 21 september 21:30 en 24 september 21:30. Van de resterende observaties zijn 50 bruikbaar voor een positieve drempelmeting: 17 stijgingen en 33 dalingen. De overige gevallen missen passende druk, hebben afgeronde ownership of een tellercorrectie. De 50 drempelmetingen hebben **voorlopige referenties**, geen volledig betrouwbaar gevolgd resettraject. Het model behandelt deze drempels daarom als schattingen.

## Collectie, detectie en opslag

`priceCollector.js` hergebruikt de bestaande `createEspnClient` en `prominent_bootstrap` cache. De Prominenten-collector bewaart nu ook de populatiegrootte in deze gedeelde cache. Er is geen aparte scraper, geen browserjob en geen nieuw publiek schrijfendpoint.

Supabase Cron controleert iedere vijf minuten of een meting nodig is. Normaal wordt iedere vijftien minuten verzameld; rond 02:10–03:00 UTC iedere vijf minuten. Het verwachte prijsvenster is 02:30–02:40 UTC, weergegeven als **03:30–03:40 UTC+1** volgens de bronoffset. Dit is empirisch, geen ESPN-garantie en geen automatisch omschakelende Nederlandse zomertijd. De intervallen en venstergrenzen staan in de modelconfiguratie. De actieve Cron-job en zelfstandig opgeslagen snapshots zijn gecontroleerd.

Prijsverschillen worden vergeleken met de vorige waarneming. Een event bewaart oude/nieuwe prijs, detectie-interval, bronmetingen, druk, reset en de geldige voorafgaande voorspelling. Daarna start een nieuwe cyclus. Teruglopende totaaltellers of zeer grote meetgaten maken het referentiepunt voorlopig. Seizoentellers bepalen de druk; rondevelden blijven als bronbewijs bewaard. ESPN-ID's blijven ESPN-ID's en worden niet verward met de andere Studio-speler-ID's.

Tabellen: `price_snapshots`, `price_change_events`, `price_predictions`, `price_model_evaluations`, `price_model_calibration`, `price_current` en `price_event_backtests`. Tijd-, seizoen-, speler-, ronde- en modelindexen ondersteunen de queries. Vergelijk-en-schrijfcontrole voorkomt gelijktijdige state-overschrijving. Modelversies bewaren hun eigen evaluaties en forecasts; eerdere echte events blijven onveranderd. Een nieuwe modelversie wordt op de bestaande compacte cache doorgerekend en haalt daarna opgeslagen recentere waarnemingen in.

Retentie loopt ieder uur in begrensde batches: zeven dagen volledige meetresolutie, daarna per uur, na dertig dagen per dag. Eventbronmetingen en gekoppelde forecasts worden beschermd; events en backtestkoppelingen blijven permanent beschikbaar. Grote importbatches zijn verkleind na een database-timeout; succesvolle batches zijn niet opnieuw geïmporteerd.

## Probability, confidence en vergelijkbare prestaties

Kansen zijn intern percentages 0–100. Het model leert per volledig waargenomen nachtvenster stijging/daling/stabiel. Vergelijkbare profielen combineren netto druk, relatief ownershipverlies, ownershipklasse en resetkwaliteit. Kleine groepen krijgen een empirische prior uit een breder profiel, daarna zo nodig de seizoensbasis. **Een lage confidence verwijdert de kans niet.** Alleen zonder voldoende onderbouwde vergelijkings-/basisgegevens blijft probability onbekend. Ook groepen zonder prijswijziging leveren informatie over een lage kans.

Kalibratie gebruikt uitsluitend eerder afgesloten vensters. Per richting worden voorspelde kansgroepen met werkelijke frequenties vergeleken; bij voldoende voorbeelden en minstens drie vensters wordt de ruwe kans naar de eerder gemeten frequentie gewogen. Nooit automatisch 100%. Stijging/daling zijn wederzijds exclusief.

`confidence_score` is een afzonderlijke 0–100 kwaliteitsscore, geen tweede kans. Gewichten: steekproefomvang en vensterdiversiteit 25; resetkwaliteit 15; snapshots sinds reset 10; freshness 10; meetgaten 10; drempelstabiliteit 10; eerdere kalibratieafwijking 15; ownershipresolutie 5. Brede/seizoensprofielen verminderen de steekproefbijdrage. Labels: <25 Zeer laag; 25–49 Laag; 50–74 Midden; 75–89 Hoog; ≥90 Zeer hoog. Dit is een transparante kwaliteitsrubriek, geen bewezen statistisch betrouwbaarheidsinterval.

`comparable_historical_hitrate` gebruikt vooraf getoetste forecasts uit hetzelfde profiel, **inclusief correct stabiel**. Minder dan tien voorbeelden of drie vensters geeft geen hitrate. Bij acceptatie hadden 586 van 601 spelers deze profielstatistiek, gemiddeld circa 3.078 getoetste speler-vensters per profiel. Dat zijn geen duizenden echte prijswijzigingen; herhaalde vergelijkbare observaties en stabiele uitkomsten domineren. De afzonderlijke event-hitrate voorkomt dat dit als succesvolle signalering wordt gepresenteerd.

‘Geschat nog’ gebruikt de mediane historische drempel minus actuele druk. Bij dalingen wordt de relatieve ownershipdruk via ownership bij reset en de toen beschikbare populatie naar netto verkopen omgerekend. Ownership 0,0% geeft geen valse schatting van nul verkopen. De 20e–80e percentielen leveren een bandbreedte. Als deze meer dan tien transfers of 20% van de puntschatting omvat, toont de UI een range. Dit is empirische spreiding, geen exact ESPN-punt of formeel betrouwbaarheidsinterval. Threshold-confidence staat apart in het detailpaneel.

Statusregels: ≥90% en confidence ≥75 ‘Zeer waarschijnlijk’; ≥80% en confidence ≥50 ‘Waarschijnlijk’; ≥60% of 80–120% geschatte drempeldruk ‘Dicht bij grens’; overige gerichte signalen lichte druk, anders stabiel. Dit zijn productdrempels, **niet historisch gevalideerde precisiegaranties**. De huidige dataset bevat geen hoge kansgroepen waarmee deze labels gevalideerd kunnen worden.

## Walk-forwardresultaten

24 volledig waargenomen vensters bevatten **133 prijswijzigingen: 18 stijgingen en 115 dalingen**. Bij de vooraf gekozen grens van minstens 50% kans: **0 correct, 0 false positives, 133 false negatives**. Event-hitrate totaal/stijging/daling: **0% / 0% / 0%**. Precision is ongedefinieerd doordat geen sterk signaal is afgegeven; recall is 0%. Dit is nadrukkelijk geen betrouwbaar handelssignaalmodel. De UI meldt dit zichtbaar en kopieert geen mockup-percentages.

| Richting / kansgroep | Voorspellingen | Werkelijke wijzigingen | Gem. voorspelde kans | Werkelijke frequentie |
|---|---:|---:|---:|---:|
| Stijging 0–9% | 13.140 | 16 | 0,21% | 0,12% |
| Daling 0–9% | 13.139 | 103 | 1,18% | 0,78% |
| Stijging 10–19% | 3 | 0 | 10,86% | 0% |
| Daling 10–19% | 4 | 1 | 13,63% | 25% |
| Alle groepen vanaf 20%, inclusief 50–59 t/m 95–100 | 0 | 0 | — | Niet gevalideerd |

Gewogen kalibratieafwijking is circa **0,25 procentpunt**, sterk gedomineerd door de lage basisfrequentie. Dit bewijst niet dat hoge kansen betrouwbaar zijn. Gemiddelde confidence bij correcte uitkomsten inclusief stabiel: **64,48**; bij fouten **57,80**. Gemiddelde absolute afwijking in ‘nog nodig’: **109,73 netto transfers** voor de meetbare gevallen. Drempelafwijkingen worden per eenheid gescheiden: circa 474,75 netto aankopen en 0,14 ownershipfractie. Exacte interne ESPN-drempels en exacte timing zijn niet observeerbaar; dit zijn fouten tegenover publieke metingen.

## UI, performance, security en tests

De pagina, CSS en presentatiefuncties worden alleen bij `/studio/prices` geladen. De browser krijgt de actuele compacte cache, 25 events per historiepagina, beperkte samenvattingsvelden en evaluaties; geen ruwe snapshots of modelstate. Alle zware import, detectie en kalibratie blijven buiten de frontend. Bestaande schermimplementaties zijn niet gewijzigd. De testharness van één bestaande fixturetest gebruikt nu Vite-transformaties omdat die browsermodules importeert.

Getest: zoeken, vijf views, sortering, selectie/detail, numerieke confidence, vergelijkbare historie, echte prijswijzigingen en paginatie, alle vier periodefilters, desktop 1920/1366, tablet 820, mobiel 390. Periodes worden uit ronde-deadlines bepaald, niet uit mogelijk verplaatste wedstrijden. Freshness toont ESPN-, snapshot- en modeltijd; na 45 minuten waarschuwt ook een open pagina. Vorige geldige cache blijft beschikbaar bij een tijdelijke prijsservicefout. De twee verschillende richtingen — transferdruk en hoogste voorspelde kans — worden afzonderlijk benoemd.

Alle twaalf bestaande schermen zijn in de browser geopend: Dashboard, Spelers, Vergelijken, Speelschema, Historische Data, Analyse, Captain Radar, Differentials, Manager, Dream Team, Invoer en Instellingen. Op Dashboard is bevestigd dat prijsmodules en snapshots niet worden geladen. De bestaande koude Studio-initialisatie kan traag zijn; deze feature voegt daar geen historische verwerking aan toe.

Validatie: **62 regressietests**, **104 platform/HTML-security checks**, **21 prijsdatabasechecks**, importparsertests, 25 profiel/selectiechecks en 24 forum/RLS-checks geslaagd. Aanvullend zijn live collector, duplicate-source handling, gegevensactualiteit, confidencevelden, voor-event timestamps en weigering van publieke/niet-admin writes getest. Productiebuild geslaagd. Responsive screenshots en uitvoer staan in de genegeerde map `test-results`.

RLS staat op alle nieuwe tabellen. Alleen publieke marktcache, events en evaluaties zijn leesbaar. Ruwe snapshots, historische forecasttabel en modelstate zijn uitsluitend server-side toegankelijk. De Edge Function valideert het echte adminprofiel of het bestaande Vault-schedulertoken. Service-role sleutels staan niet in clientcode. Advisors bevatten geen nieuwe securitywaarschuwingen; interne tabellen hebben bewust geen publieke RLS-policy. De bestaande pg_net-schemawaarschuwing en uitgeschakelde gelekte-wachtwoordcontrole blijven externe platformpunten.

## Reproduceerbare beheercommando's

```powershell
node scripts/inspect-price-archive.mjs '<pad naar historische ZIP>'
node scripts/import-prices.mjs                  # uitsluitend initiële echte import
node scripts/import-prices.mjs --resume         # verder vanaf bevestigde batch
node scripts/backtest-prices.mjs                # bestaande compacte cache hergebruiken
node scripts/activate-price-model.mjs           # admin; versie apart opslaan en live bijwerken
node scripts/test-price-live.mjs
node scripts/test-price-database.mjs
node --test scripts/test-price-import.mjs
npm test
npm run build
```

Gebruik een geautoriseerd adminaccount via `PRICE_ADMIN_EMAIL` / `PRICE_ADMIN_PASSWORD`; de bestaande lokale acceptatieaccountconfig is een genegeerde fallback. Import- en activatiescripts loggen geen credentials. Kopieer nooit `.env`, accountbestanden of de historische cache naar GitHub.

Externe platformdocumentatie bij bestaande meldingen: [pg_net in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [gelekte-wachtwoordcontrole](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Deze punten blokkeren de prijsfunctie niet.

## UX-pass: druk eerst (8 oktober 2026)

Alleen de presentatie is aangepast; modelberekeningen, kanskalibratie, backtest, collector, cache en database blijven ongewijzigd. De browser gebruikt dezelfde API-verzoeken en krijgt geen ruwe snapshots.

- Richting komt overal uit `pressure_direction`: lijst, status, near-kaart en detail. De secundaire modelkans betreft dezelfde richting. Zonder drukrichting blijft de hoogste beschikbare modelkans zichtbaar; beide kansen staan in de uitklapbare uitleg.
- Druklabels: 0% geen meetbare drempeldruk; >0–<40% lichte druk; 40–<80% matige druk; 80–<100% dicht bij stijging/daling; 100–<120% sterke druk; vanaf 120% zeer sterke druk. Ontbrekende drempeldata wordt expliciet benoemd. Dit zijn UI-labels voor geschatte historische drempels, geen nieuwe voorspellingen of officiële ESPN-grenzen.
- Stijgers zijn groen/cyaan, dalers rood/magenta, neutrale spelers blauw/grijs. Vanaf 100% krijgen rijen en details een sterkere tint, volle balk en grensmelding. De primaire metrics zijn prijsdruk en geschat nog nodig.
- Bijna op grens omvat alle gerichte druk vanaf 80%, ook boven 120% en bij lage kans. De kaarten staan boven de tabel. De sortering op nabijheid gebruikt de absolute afstand tot 100%.
- Waarschijnlijk vannacht vereist minstens 80% kans in de drukrichting en minstens 50/100 confidence. De lege staat verwijst naar de bruikbare drempelsignalen. De bestaande serverstatus bepaalt deze UI-filter niet meer: daardoor worden zeer waarschijnlijke spelers niet per ongeluk uitgesloten.
- Stijgers/dalers openen op hoogste prijsdruk. Beschikbare sorteringen: prijsdruk, afstand tot grens, modelkans, confidence, resterende netto transfers, netto koopdruk, netto verkoopdruk, prijs en naam. Ontbrekende waarden staan onderaan.
- Onder 10% krijgt modelkans geen balk; 10–<40% een kleine, 40–<70% een gewone en vanaf 70% een sterkere secundaire balk. Het percentage zelf wordt niet gewijzigd. Confidence blijft afzonderlijk als score/100 en label zichtbaar, met toetsenbord- en touchbereikbare uitleg.
- Geschat nog nodig gebruikt de bestaande waarde/range. Een range wordt getoond bij spreiding groter dan 10 transfers of 20% van de schatting, met de tekst Brede onzekerheidsmarge. Een onveranderde of tegengestelde verwachte prijs wordt niet als directionele forecast gepresenteerd; daarvoor staat Nog geen prijswijziging voorspeld.
- Modelvalidatie krijgt een korte hoofdtekst; exacte backtestcijfers en uitgebreide prestaties blijven uitklapbaar. Historische wijzigingen houden hun echte vooraf opgeslagen voorspelling, confidence en resultaat.
- Desktop houdt tabel links en detail rechts; tablet plaatst detail eronder. Op mobiel wordt dezelfde tabel een compacte kaartlijst met richting, druk en resterende transfers zichtbaar. Selectie scrollt naar het onderliggende detail. Tabellen/lijsten hebben begrensde scrollhoogte.

Validatie van deze UX-pass: 73 regressietests, 104 platform-/HTML-securitychecks en 68 gerichte browserchecks. De browserchecks gebruiken echte productiecache en controleren alle vijf views en richtingen op 1920, 1366, 820 en 390 pixels. Synthetische randgevallen (hoge druk/lage kans, hoge kans/lage confidence, neutraal, onbekend en tegengestelde verwachte prijs) bestaan uitsluitend in geïsoleerde rendertests. Geen testdata wordt naar productie geschreven.

De daaropvolgende kwaliteitscontrole kwalificeert alle hierboven genoemde druklabels, KPI-tellingen en filters. De actuele voorwaarden en de onderzochte productievoorbeelden staan in [PRICE-THRESHOLD-QUALITY.md](PRICE-THRESHOLD-QUALITY.md). Ongekwalificeerde percentages worden niet meer als drempelsignaal gepresenteerd.
