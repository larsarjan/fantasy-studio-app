# Nieuws: redactionele blokken

`news_articles.content_blocks` is optioneel JSONB: `{version: 1, blocks: [...]}`. Elk blok heeft een stabiele UUID. Ondersteunde typen: `paragraph`, `heading` (H2/H3), `image`, `imageCarousel`, `quote`, `list`. Maximaal 80 blokken en 12 beelden per carrousel. Publicatie vereist minimaal twee carrouselbeelden en alt-tekst, tenzij een beeld expliciet decoratief is.

`src/admin/articleBlockEditor.js` biedt invoegen boven/onder, omhoog/omlaag, verwijderen, uploaden/vervangen, alt/onderschrift en beeldinstellingen. Losse beelden: small/medium/large/full en left/center/right. Carrousels: medium/large/full, individuele beeldvolgorde. Tekstknoppen schrijven beperkte inline-opmaak; geen raw HTML-workflow.

`src/services/articleBlocks.js` rendert zowel de CMS-preview als de publieke artikelbody. Carrousels ondersteunen vorige/volgende, dots, pijltjestoetsen, Home/End en horizontale swipe; geen autoplay of externe slider. Inline afbeeldingen laden lazy en hebben bekende dimensies. Onbekende bloktypen worden overgeslagen; ongeldige of ontbrekende blokstructuur valt terug op de bestaande veilige body-renderer.

Titel, intro, auteur, categorie, status, datum en hoofdafbeelding blijven aparte velden. Nieuwskaarten zijn ongewijzigd. Legacy-artikelen behouden de bestaande editor; omzetting is expliciet en bewaart `body`. De JSON-versie is een formaatversie, geen revisiearchief. Bestaande `updated_at`-concurrencycontrole en audit blijven actief.

Opslaan blijft expliciet, met waarschuwing voor onopgeslagen wijzigingen. Tijdens uploads en opslaan worden conflicterende acties geblokkeerd; mislukkingen laten de invoer staan. Er is geen achtergrond-autosave toegevoegd: concept/review/publicatiestatus en de bestaande concurrencyflow blijven eenduidig.

Uploads gebruiken `news-images`, eigen UUID-pad, JPG/PNG/WebP, maximaal 5 MB, decoded-imagecontrole en opnieuw encoderen. Grote beelden worden verkleind tot maximaal 2560 pixels aan de langste zijde. De bestaande publieke bucket en Storage/RLS-rechten blijven behouden; geen nieuwe frontend-secrets.

Verwijderen van een opgeslagen beeldblok verwijdert het Storage-object niet automatisch. De bestaande verweesde-objectpolicy controleert nu ook inline- en carouselreferenties, inclusief andere privéconcepten. Alleen eigen, niet-gerefereerde objecten kunnen worden verwijderd. Opgebouwde maar niet opgeslagen uploads kunnen bij expliciet verlaten worden opgeruimd; er is geen brede periodieke cleanup toegevoegd.

Migraties: `20261011212156_news_content_blocks.sql` en `20261011212746_news_blocks_publication_guard.sql`. Bestaande content-RLS en publicatierechten zijn niet verruimd. De server valideert blokken en alt-tekst ook bij directe API-calls. Bij blokartikelen controleert publicatie de actuele bloktekst in plaats van de bewaarde legacytekst.

## Gerichte verificatie

```text
npm run test:cms
npm run dev -- --host 127.0.0.1 --port 5180
node scripts/test-news-blocks-browser.mjs
npm run build
git diff --check
```

De lokale browserfixture gebruikt echte editor-/previewmodules en een expliciete Storage-teststub, schrijft geen productiecontent en test 390/820/1366/1920 px. Live acceptatie gebruikt uitsluitend één tijdelijk concept; dit wordt niet gepubliceerd. Testaccounts en eventuele tijdelijke rechten worden na de livecontrole verwijderd.
