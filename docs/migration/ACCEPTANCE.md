# Eindacceptatie — 6 oktober 2026

Productie: https://fantasy-studio-app.vercel.app. Canonical repository: `larsarjan/fantasy-studio-app`. De exacte gedeployde commit is controleerbaar via `/release.json`; bij CLI-deploy geef je de volledige commit mee als `--build-env STUDIO_RELEASE_SHA=<sha>`. Lokale credentials, testprofielen en ruwe acceptatiegegevens staan uitsluitend in genegeerde bestanden.

## Hersteld tijdens eindacceptatie

- De volledige teamimport verstuurde 4.769.764 bytes door herhaalde afgeleide spelersprofielen. Dit overschreed de databasebeperking en verhinderde opslaan. Opslag bewaart nu identiteit, gebruikersprijzen, importstatus en overige keuzes zonder wedstrijdhistorie. De live 15-spelerselectie gebruikt 18.023 bytes; reload toont alle spelers en prijzen. De resolver zoekt dezelfde IDs in de actuele profielen. Er is geen schema- of chiplogica gewijzigd.
- Transferplanning toetste een bestaande selectie ten onrechte aan het initiële budget van 100 miljoen. Bestaande selecties mogen in waarde stijgen. De financiering van iedere transfer en de overige selectieregels blijven gecontroleerd; regressies testen ook onbetaalbare aankopen en dubbele IDs.
- Workerresultaten bevatten dezelfde wedstrijdhistorie vele malen. Alleen de resultaatrepresentatie is verkleind, met behoud van scores, projecties en totalen. Het rekenalgoritme en de invoer zijn ongewijzigd.

## Bewijs

- Volledige eindrun na functionele fixes: 32 testbestanden geslaagd, 0 mislukt; 38 lokale PostgreSQL/RLS/opslagchecks; 83 HTML/platformchecks; productiebuild geslaagd.
- Bestaande live securityrun: 102 checks, inclusief twee gebruikers, rol-escalatie, metadata-misbruik, RLS, gelijktijdige writes, historie, refresh/logout en gedeelde publicatierechten. Geen databasewijzigingen na deze run. De uiteindelijke teamsave is aanvullend live getest op stale-version-afwijzing, prijzen, identiteit, nieuwe sessie en isolatie tegenover de tweede gebruiker.
- Echte Supabase-confirmationlink: onbevestigd inloggen geweigerd, callback opent het dashboard, daarna inloggen toegestaan en profielrol viewer. Link via beheer-API gegenereerd zonder e-mail te verzenden. Dit bewijst de linkverwerking, niet mailboxbezorging. De eerder uitgevoerde echte recovery-linktest blijft geldig; authcode is tijdens eindacceptatie niet veranderd.
- Alle hoofdschermen zijn eerder live gecontroleerd. De gewijzigde manager wordt aanvullend op de release gecontroleerd; ongewijzigde zware checks worden niet onnodig herhaald.
- Secretscan van bronbestanden en distributie: geen gevonden private key, service-role JWT, GitHub-token of databasewachtwoord. De publieke Supabase publishable key is verwacht in de frontend.
- Actuele npm-audit: productie 0 kwetsbaarheden. Inclusief development: 0 high/critical; 8 moderate meldingen in de transitive Electron-buildketen (sprintf-js en afhankelijke packages). Geen geforceerde downgrade van electron-builder toegepast.
- Supabase-project ACTIVE_HEALTHY. Geen RLS/security-ERROR; waarschuwing voor uitgeschakelde leaked-password protection. Performance-advisor meldt uitsluitend ongebruikte indexes; deze worden niet verwijderd op basis van een kleine acceptatiedataset.

## Optimizermeetpunten

Op de lokale Node 24-machine met 576 live spelersprofielen en de geïmporteerde 15-spelerselectie: één ronde circa 0,29 seconde; vijf rondes circa 1,80 seconde, beide geldig. Dit zijn coremetingen, geen gegarandeerde browserdoorlooptijden. Het JSON-resultaat daalt van circa 37,5 MB naar 5,6 MB (ongeveer 85%). De invoer bevat nog uitgebreide profielen (circa 49,5 MB als JSON); verdere verkleining vereist een afzonderlijk doorgemeten invoercontract. Lange zoekhorizonnen blijven zwaarder. Annuleren/workerterminatie blijven behouden.

## Grenzen en externe actie

Custom SMTP is niet ingericht. Configureer een eigen mailprovider en geverifieerde afzender in Supabase en test daarna echte ontvangst, bevestiging en reset in een beheerde mailbox. Laat e-mailbevestiging ingeschakeld. SMTP-wachtwoorden uitsluitend in Supabase/server-side invullen, nooit in chat of VITE-variabelen. De voorbereide templates staan onder `supabase/templates`; het configuratiefragment staat in `supabase/auth-email-templates.toml`.

De app bewaart private wijzigingen expliciet online. Bij netwerkverlies toont zij een fout en bewaakt zij vertrek van de pagina; een duurzame offline private write-queue is geen onderdeel van deze actuele implementatie. Vercel wordt via CLI gepubliceerd zolang de GitHub-appkoppeling ontbreekt. De code staat wel in de canonical repository; handmatige publicatie blijft uitvoerbaar. De bestaande Electron-bronnen zijn behouden; deze eindacceptatie brengt geen nieuwe portable EXE uit.

Bronnen: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [password security](https://supabase.com/docs/guides/auth/password-security).
