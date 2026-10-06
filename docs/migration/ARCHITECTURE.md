# Architectuur

Vite bouwt een statische ES-module-app voor Vercel. Geen SSR of server met beheersleutels. `platform/bootstrap.js` voltooit authenticatie en laadt daarna profiel, voorkeuren, primaire teamversie en notities. Pas dan worden de domeinmodules geladen. Navigatie heeft echte browserpaden, SPA-rewrites, back/forward en directe-routeondersteuning.

## Gegevensmodel

| Entiteit | Eigenaarschap en contract |
|---|---|
| profiles | FK naar auth.users; rol viewer/editor/admin; gebruiker leest alleen eigen profiel; rol uitsluitend door beheer gewijzigd |
| user_preferences | Eén rij per gebruiker; settings-object, timestamps, versie |
| fantasy_teams | UUID, eigenaar, unieke slug per eigenaar, naam, state/settings, versie; primaire teamwerkruimte |
| team_versions | Onveranderlijke app-snapshots bij save; samengestelde team/eigenaar-FK; unieke versie; gebruiker ziet alleen eigen historie |
| transfer_editorial | Eigenaar + kind + sleutel, payload en timestamps; transfer/club/lokale notities afzonderlijk adresseerbaar |
| editorial_revisions | Versie per gebruiker voor atomische notitievervanging |
| reference_imports | Herkomst, importerende editor, aantallen en tijdstip |
| 16 referentietabellen | Eén rij per bronentiteit; FK naar import, bronpayload, geïndexeerd seizoen, timestamps |

De uitgebreide bronvelden en managerstrategieën zijn bewust JSON-objecten: bestaande modellen bevatten veel geneste, veranderlijke kenmerken. Identiteit, eigenaar, relaties, imports en versies zijn relationeel afgedwongen. Er is geen allesomvattende gebruikersblob. Favorieten of opgeslagen analyses waren geen bestaande persistente functies en zijn niet als lege productfuncties toegevoegd.

## Autorisatie

Alle blootgestelde tabellen hebben RLS en expliciete grants. Private SELECT/DELETE beperken tot `auth.uid()`, INSERT controleert eigenaar, UPDATE heeft zowel USING als WITH CHECK. Een admin krijgt geen toegang tot andere privéteams. Rollen komen uit profiles, nooit uit user_metadata. De kleine interne SECURITY DEFINER-functies bevinden zich in een niet-blootgesteld schema, hebben een vaste lege search_path en beperkte EXECUTE-grants. Publieke save/import-RPCs zijn SECURITY INVOKER.

Save-RPCs nemen een transactielock en controleren de verwachte versie. Team, versiehistorie en versienummer veranderen atomair. Voorkeuren en notities hebben dezelfde conflictbeveiliging. De client toont een herstelmelding bij een verouderde versie. Rechtstreekse toegestane eigen-row API-writes zijn geen publieke appworkflow en moeten bij nieuwe clients eveneens via de save-RPCs lopen.

Referentiepublicatie valideert de datasets, serialiseert publicaties met een transactielock en vervangt rijen binnen één transactie. De RPC heeft een eigen 30s statementbudget; gewone gebruikersquery's behouden hun oorspronkelijke budget. Dat is nodig voor de volledige openbare bronset op de kleine database-instance. Een mislukte publicatie laat de vorige snapshot intact. Lezers controleren import-ID én rijaantallen; onvolledige snapshots vallen terug op cache/bron.

## Browserbeveiliging

DOMPurify beveiligt alle innerHTML/insertAdjacentHTML-sinks. Tests omvatten scripts, handlers, SVG, ongeldige URL's, tabel-fragmenten en lokale blob-previews. CSP beperkt scripts tot de app en OCR-CDN, verbiedt frames/objecten en inline JavaScript. Vercel stuurt nosniff, frame-deny en een beperkte Permissions-Policy. Accountdata en beheersleutels worden niet gelogd. Gevoelige testbestanden en browserprofielen zijn uitgesloten van Git en deployment.

## Performance

Alleen het actieve scherm wordt opgebouwd. Onafhankelijke CSV-bronnen laden parallel. Voorberekende scores worden bij de ruwe spelers opgeslagen, niet bij de uitgebreide profielen met herhaalde wedstrijdhistorie (44 MB werd circa 1 MB). De complete referentiepublicatie is circa 10.75 MB. In-memory DOM/data en IndexedDB worden hergebruikt; initialisatie leest eerst de actuele cloudsnapshot. Grote berekeningen blijven bestaande domeinlogica; optimizerzoekwerk draait in de bestaande worker.
