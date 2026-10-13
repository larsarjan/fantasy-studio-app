# Slimme artikelen

Artikel-JSON blijft versie 1. Spelerkoppelingen zijn optionele `players`-ranges op tekstblokken: `start`, `end` (UTF-16), `text`, `playerId` (Studio payload.id) en `season`. De validator controleert tekst, grenzen en overlap. Bewerkingen verplaatsen onaangetaste ranges; een wijziging binnen een naam verwijdert die koppeling. Gewone hyperlinks krijgen geen geneste knoppen.

Herkenning is uitsluitend een voorstel. Unieke volledige namen krijgen hoge zekerheid; achternamen middelmatige zekerheid; meerdere kandidaten lage zekerheid. Elke keuze vraagt een expliciete redacteursactie. Alleen de eerste betekenisvolle vermelding wordt voorgesteld. `ignoredEntities` bewaart expliciet genegeerde voorstellen. Handmatig selecteren kan extra vermeldingen koppelen. Analyse, openen en preview muteren geen artikelinhoud.

Een optioneel `match`-blok bevat `fixtureId`, `season` en vijf booleans: `collapsedByDefault`, `showTopScorer`, `showLegend`, `showSubstitutes`, `playerLinks`. Het voegt niets toe aan bestaande tekstblokken. De picker biedt wedstrijden met uitslag of spelersstatistieken en vermeldt onvolledige data.

## Publieke gegevens

`GET /api/article-entities?kind=player|summary|match&id=...&season=...` leest alleen expliciet toegestane voetbalvelden uit de laatste atomische Google Sheets-snapshot. Geen volledig Studio-dataset, Auth-identificatie, interne notities of service-role in de browser. Onbekende/ambigue identiteiten geven geen gegokte speler. De catalogus (`kind=catalog`) vereist een geldige sessie plus `articles.create` of `articles.edit`. Bestaande artikel-RLS en publicatierechten blijven gelden.

De RPC gebruikt een private, afgeschermde definer met lege search_path en een publieke invoker-wrapper; publiek lezen is hier bewust beperkt tot de voetbalprojectie. De endpoint gebruikt alleen de publishable key. Public caches verlopen na 30 seconden; de browsercache is begrensd op 100 entries en dedupliceert gelijktijdige verzoeken. De editorcatalogus is privé en wordt pas op aanvraag geladen.

Wedstrijdheaders laden een kleine samenvatting. Spelersstatistieken laden pas bij uitklappen; popups pas bij aanklikken. Bestaande `resolveHistoricalMatch` en `buildPlayerMatch` verzorgen de scores. `historicalScoreView` wordt door Historie en artikelen gedeeld. Foto's gebruiken de centrale fotohelper met incrementele records, zonder bestaande Studio-fotorecords te vervangen. Preview en publicatie gebruiken dezelfde renderer en interacties.

## Validatie

```
node --test src/services/articleEntities.test.js server/articleEntities.test.js
node scripts/test-article-entities-database.mjs
node scripts/test-article-entities-ui-server.mjs PATH_TO_EXISTING_REAL_SNAPSHOT_JSON
node scripts/test-article-entities-browser.mjs
npm test
npm run build
```

De lokale browserharness is uitsluitend testgereedschap; deze publiceert niets. Live acceptatie gebruikt een afzonderlijk tijdelijk artikel en minimaal bevoegd testaccount. Bestaande productiecontent wordt nooit genormaliseerd, herschreven of als functioneel testobject gebruikt. Vergelijk de beschermde rij, JSON, afbeeldingen/captions en view-totalen vóór en na de release. Natuurlijke extra views mogen blijven bestaan.
