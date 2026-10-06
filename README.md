# Fantasy Voetbal Studio

Browserapp voor Fantasy Voetbal Talk Eredivisie. De bestaande spelersmodellen, Europese wedstrijdcontext, Captain Radar, Intelligence, Dream Team en FVT Manager blijven behouden. Accounts en persoonlijke teams worden opgeslagen in Supabase.

- Productie: https://fantasy-studio-app.vercel.app
- Repository: https://github.com/larsarjan/fantasy-studio-app
- Supabase: `rzunbquzffdivlpuomjc` (uitsluitend Fantasy Studio)
- Vercel: `fantasy-studio-app`, team `larswoudenberg-6243`

## Lokaal starten

Gebruik Node 24 en npm. Op Windows kan `npm.cmd` nodig zijn vanwege de PowerShell execution policy.

```sh
npm ci
cp .env.example .env.local
# Vul de publieke URL en publishable key van Fantasy Studio in.
npm run dev
```

De browser krijgt uitsluitend de publishable key. Service-role keys, SMTP-wachtwoorden en beheertokens horen nooit in `VITE_*` of Git. De productiebuild weigert ontbrekende cloudconfiguratie en het AFTRAP Control-project.

## Controleren

```sh
npm run check
node scripts/test-live.mjs
```

`check` draait de domeintests, lokale PostgreSQL/RLS-tests, HTML-beveiligingscontroles en productiebuild. De live test vereist de lokaal gegenereerde, genegeerde `test-results/staging-accounts.json`; hij gebruikt uitsluitend het hierboven genoemde project. `prepare-staging-tests.mjs` maakt tijdelijke credentials en gecontroleerde fixture-SQL; hij past niets automatisch op Supabase toe. Deel deze bestanden niet. De lokale API-testdouble vereist een tijdelijke `STUDIO_TEST_PASSWORD` en is geen bewijs voor echte e-mailbezorging.

## Gebruik en opslag

Log in met e-mail en wachtwoord. Bevestiging en herstel verlopen via Supabase Auth. Kies **Team opslaan** om managerselectie, import, budget, aankoopprijzen, planning, chips en strategie te bewaren. Uitloggen bewaart een gewijzigd team eerst; mislukte opslag verhindert uitloggen. Een oudere browsersessie kan een nieuwere cloudversie niet stil overschrijven. Exporteer eigen cloudgegevens via Instellingen.

Voetbaldata komt uit de bestaande gepubliceerde Google Sheets. Admins/editors kunnen een volledige dataset atomair publiceren; viewers lezen gedeelde data en beheren hun eigen teams. IndexedDB blijft uitsluitend een cache van gedeelde voetbaldata. Afgeleide analyses worden opnieuw berekend. OCR verwerkt screenshots lokaal in de browser; er is geen publieke screenshotopslag.

## Meer informatie

- [Architectuur en rechten](docs/migration/ARCHITECTURE.md)
- [Deployment, auth, SMTP en herstel](docs/migration/OPERATIONS.md)
- [Bronaudit en regressiematrix](docs/migration/AUDIT.md)
- [Acceptatie en resterende beperkingen](docs/migration/ACCEPTANCE.md)

De Electron-wrapper en oorspronkelijke Apps Script-bronnen blijven aanwezig. Transfer Deadline Live blijft uitgeschakeld overeenkomstig de aangeleverde feature flag; de implementatie is behouden.
