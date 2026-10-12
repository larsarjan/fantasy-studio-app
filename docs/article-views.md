# First-party artikelweergaven

Publieke gepubliceerde artikelen tonen uitsluitend het werkelijk gemeten totaal naast de bestaande metadata. Er is geen backfill, multiplier of bewerkbaar tellerveld. Een nieuwe teller begint bij nul. CMS-overzicht en artikelbewerking tonen met `articles.read` daarnaast unieke sessies, weergaven per sessie en laatste weergavedatum.

## Registratie en privacy

`/api/article-views` valideert de aanvraag op de server. Alleen `published` met een bereikte publicatiedatum en ingeschakelde nieuwsfunctie telt. Preview, CMS, redactionele bezoekers en herkenbare crawler/preview/monitoring user-agents tellen niet. De bestaande artikelrenderer blijft intact; registratie start asynchroon wanneer de pagina zichtbaar is. Bij storing blijft het artikel leesbaar en wordt geen verzonnen nul getoond.

Een ondertekende first-party `__Host-fvt_article_session` cookie is HttpOnly, Secure, SameSite=Lax en verloopt na maximaal 24 uur. Zonder werkende cookie wordt niet geteld. De database bewaart alleen een HMAC die aan één artikel is gebonden, geen cookie, IP-adres, e-mailadres, account-ID of user-agent. Er is geen fingerprinting of externe analyticsprovider. De dagelijkse cron `news-view-session-retention` verwijdert verlopen hashes; hun bewaartermijn is minder dan 48 uur. Anonieme aggregaten blijven bestaan. De privacy-pagina beschrijft dit gebruik.

Per artikel en sessie telt maximaal één bezoek binnen 30 minuten, ook bij refresh, meerdere tabs en gelijktijdige verzoeken. Daarna mag dezelfde sessie nog een totaalweergave toevoegen zonder opnieuw uniek te worden. Unieke sessies zijn een schatting, geen unieke personen. Nieuwe browsers, verwijderde cookies en verlopen sessies zijn nieuwe sessies. De eenvoudige botfilter is geen bescherming tegen doelbewust gesimuleerde browsers.

## Grenzen en beveiliging

`private.news_view_totals` en `private.news_view_sessions` hebben RLS, expliciete deny-policies en geen clientrechten. Artikelverwijdering ruimt de bijbehorende statistieken via foreign keys op. Publieke invoker-RPC `article_view_total` geeft alleen het totaal van een zichtbaar gepubliceerd artikel terug. `article_view_statistics` controleert `articles.read` in de private implementatie. `record_article_view` is uitsluitend voor de serverrol; transacties en rijvergrendeling voorkomen dubbele registratie. De API accepteert alleen een artikel-ID, nooit een clientteller of visitor-ID.

Productie vereist de bestaande publieke Supabase-configuratie plus geheime Vercel-variabelen `SUPABASE_SERVICE_ROLE_KEY` en `ARTICLE_VIEWS_SESSION_SECRET`. Deze worden nooit naar browserbundels geëxporteerd. Foutlogs bevatten uitsluitend vaste foutcodes. Secretrotatie maakt bestaande anonieme sessies ongeldig.

## Verificatie

- `npm run test:article-views`: endpoint, sessies, clientdeduplicatie en geïsoleerde SQL/RLS-tests.
- `npm run test:cms`: bestaande editor-, renderer-, upload- en Storage-regressies.
- `node scripts/test-article-views-ui-server.mjs`, daarna eigen browser-sessies `article-views-ui` en `article-views-second` initialiseren en `node scripts/test-article-views-browser.mjs`: lokale browseracceptatie op 390/820/1366/1920 px. Start met een verse fixture/server voor herhaalbaarheid.
- Productieacceptatie gebruikt uitsluitend een expliciet toegestaan tijdelijk gepubliceerd artikel; artikel, tellerdata, testaccount en tijdelijke rechten worden daarna verwijderd.

Migraties: `20261012092925_news_article_views.sql` en `20261012093320_news_article_views_boundaries.sql`.
