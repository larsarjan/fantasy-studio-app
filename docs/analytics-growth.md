# Analytics & Groei

## Inventarisatie en ontwerp
Er bestond geen GA4-tag, consent-UI of Google reporting-integratie. De Vite-app gebruikt volledige navigaties voor publieke pagina’s en History API voor Studio; popup-history wijzigt de route niet. De bestaande article view counters en RPC’s blijven ongewijzigd. Rapportage gebruikt Vercel Functions, Supabase Auth/current_access en de nieuwe `analytics.view`-permission voor admin/super_admin.

Basic consent: geen Google-script of analytics-cookie vóór analytics-toestemming. Advertentieconsent blijft denied. De keuze verloopt na 180 dagen en is wijzigbaar via Cookievoorkeuren. Route/query-data wordt beperkt tot bekende routes en veilige UTM-codes. Geen accountvelden, selecties of user-id. Automatische browsers, previews, admin en auth worden uitgesloten.

## Google-configuratie (nog te verifiëren)
1. Open https://console.cloud.google.com/apis/library in het bestaande FVT-project. Activeer uitsluitend **Google Analytics Data API** en **Google Search Console API**.
2. IAM en beheer → Serviceaccounts → Serviceaccount maken: `fvt-analytics-reader`. Geef geen Google Cloud-projectrol; resource-rechten worden hieronder toegekend.
3. Open het serviceaccount en kopieer het e-mailadres (eindigt op `iam.gserviceaccount.com`).
4. https://analytics.google.com → Beheer → Property → Toegangsbeheer voor property → + → Gebruikers toevoegen: serviceaccount-e-mailadres, uitsluitend **Kijker/Viewer**.
5. Beheer → Propertydetails: kopieer het numerieke property-ID. Het is niet Measurement ID `G-TLBCVFX0Q1`.
6. Beheer → Gegevensstreams → webstream G-TLBCVFX0Q1 → Verbeterde meting: schakel automatische paginaweergaven/historywijzigingen uit. Bij voorkeur alle automatische events uit voor de expliciet beperkte eventset. `send_page_view:false` alleen schakelt Enhanced Measurement history-events niet uit.
7. https://search.google.com/search-console → property `fantasyvoetbaltalk.nl` → Instellingen → Gebruikers en rechten → Gebruiker toevoegen: hetzelfde serviceaccount met **Beperkt/Restricted** leestoegang. Geen eigenaar maken.
8. Serviceaccount → Sleutels → Sleutel toevoegen → Nieuwe sleutel → JSON. Bewaar veilig; niet in chat of Git. Gebruik organisatiebeleid voor keyless auth indien sleutels verboden zijn; beperk dat beleid niet.
9. Vercel → bestaand project `fantasy-studio-app` → Settings → Environment Variables → Production:
   - `GOOGLE_ANALYTICS_CLIENT_EMAIL`: `client_email` uit JSON (server-only).
   - `GOOGLE_ANALYTICS_PRIVATE_KEY`: `private_key` uit JSON, als Secret (server-only; echte newlines of escaped `\n`).
   - `GA4_PROPERTY_ID`: numeriek property-ID (server-only).
   - `VITE_GA4_MANUAL_PAGEVIEWS_CONFIRMED=true`: pas na stap 6 en acceptatie. Zonder deze bevestiging blijft browsertracking uit.
10. Redeploy en controleer de API-rechten en actuele data. Search Console-site staat vast op `sc-domain:fantasyvoetbaltalk.nl`.

Google-accounttoegang is in deze werksessie niet gekoppeld. Deze stappen vereisen de bevoegde Google-accountbeheerder; geen secrets via chat.

## Rapportage
GA4-cache vijf minuten; Search Console-cache dertig minuten, binnen warme function-instanties. Koude instanties halen opnieuw op. Timestamp is ophaaltijd, geen garantie op complete brondata. Vandaag en recente Search Console-dagen kunnen onvolledig zijn. Tabellen zijn top 50; first-party artikelstatistieken cumulatief voor laatste 20 publicaties, apart van GA4-datumfilter. Geen eigen attributiemodel of causale campagneclaims.

## SEO
Sitemap: https://fantasyvoetbaltalk.nl/sitemap.xml — submit deze URL bij Search Console → Sitemaps. Gepubliceerde artikelen worden read-only opgehaald via anon/RLS; drafts/admin/private routes zijn uitgesloten. Canonical/meta/structured data worden client-side aangebracht. De bestaande SPA heeft geen volledige server-rendered artikel-HTML: social scrapers zonder JavaScript krijgen nog de generieke HTML. Dit is een bestaande beperking, geen claim van volledige SSR-SEO.

## Acceptatie zonder datavervuiling
Unit/browsertests gebruiken lokale stubs. Productieautomatisering blijft uitgesloten via navigator.webdriver. Een echte GA4-acceptatierun moet bewust door een normale browser na toestemming gebeuren; testcampagne `analytics-acceptance` kan als echte testmeting in GA4 blijven staan. Realtime/bronontvangst moet in Google bevestigd worden voordat tracking als end-to-end gereed geldt.
