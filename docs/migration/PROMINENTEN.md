# Ranglijsten / Prominenten

De bestaande publieke FVT-shell bedient `/ranglijsten` en `/prominenten/{espn_entry_id}` zonder account. Studio, Fantasy Profiel, spelersranglijsten en Dream Team blijven intact. Homepage en hoofdnavigatie verwijzen naar de module. Alle publieke queries lezen uitsluitend eigen Supabase-data. ESPN wordt alleen door de collector benaderd.

## Schema en veiligheid

- `prominents`: centrale identiteit, unieke `espn_entry_id`, bekende publieke naam, actuele Fantasy-naam/teamnaam.
- `prominent_groups`: meerdere tags per manager, bronleague, actieve status en beschermde handmatige overrides.
- `prominent_bootstrap`: per seizoen de actuele events, elements, teams, elementtypes, chips, game settings en configureerbare chiplabels.
- `prominent_round_snapshots`: één complete snapshot per manager/seizoen/ronde, met punten, ranks, waarde, bank, chip, transferaantal/kosten, bankpunten, teamnaam, groepslidmaatschap en automatische wissels.
- `prominent_round_picks`: 15 picks per snapshot; spelersidentiteit, selectiepositie, multiplier, captain/vice, positie en naam/club bij ophalen. `price_at_fetch` is expliciet geen gereconstrueerde historische aankoopprijs.
- `private.prominent_raw_snapshots`: originele picks-response, uitsluitend servertoegang.
- `prominent_sync_jobs` en `prominent_sync_runs`: hervatbare taken, retries, coverage, broncontroles en fouten; uitsluitend leesbaar voor bestaande `profiles.role='admin'`.
- `private.prominent_sync_lock`: exclusieve lease van drie minuten; een worker werkt maximaal ongeveer 85 seconden plus de laatste request/commit.

Publieke data heeft SELECT-policy voor anon/authenticated en geen clientwrites. Opslag-RPC en lease-RPC zijn uitsluitend voor service_role, gebruiken SECURITY INVOKER en een vaste search_path. Snapshot, pick en raw-response hebben database-triggers die UPDATE/DELETE afwijzen, ook voor de collector. `prominent_save_snapshot` valideert de selectie en commit alle 15 picks atomair; duplicate calls bewaren de eerste complete waarheid. Privéselecties, auth en bestaande RLS zijn niet gewijzigd.

Migrations: `20261007143233_prominents_history`, `20261007143248_prominents_scheduler`, `20261007144541_prominents_service_policies`, `20261007145149_prominents_explicit_grants`. Versies corresponderen met live Supabase migration history. De laatste migratie beperkt Supabase's standaard table-grants expliciet tot de bedoelde publieke/administratieve SELECT-rechten.

## Bronnen

FVT 369 en creators 1182 worden volledig gepagineerd via standings.has_next. Entry 260 krijgt bovendien een handmatige CONTENT_CREATOR-tag. De 18 exacte ESPN-identiteiten staan in `src/services/prominentModel.js`. League 7302 controleert die lijst; overige medewerkers worden nooit automatisch ESPN-prominent. Standings gebruiken het bronveld `entry`, dat naar `espn_entry_id` wordt genormaliseerd.

De picks-response `entry_history` is de bron voor rondepunten, totaalpunten, ranks, bank, waarde, transferaantal/kosten en bankpunten. `active_chip` is authoritative. Alleen wildcard en frush hebben bewezen labels Wildcard/Aanvalluh!. 2capt/rich blijven hun codes totdat een beheerder geverifieerde labels instelt in `prominent_bootstrap.chip_labels`.

Seizoen komt uit de eerste bootstrap-deadline, niet uit de computerklok. Collectie start alleen bij `finished=true AND data_checked=true`. ESPN stond bij acceptatie op SR7 van seizoen 2026–2027; SR8 was nog niet gespeeld. Entries die later gestart zijn, hebben geen eerdere picks; zulke jobs worden `unavailable` met de expliciete startronde, zonder lege snapshots te fabriceren.

## Sync, scheduler en backfill

De ene scheduler is Supabase pg_cron, job `fantasy-studio-prominents`, elke 30 minuten. pg_net roept `prominent-sync` aan met een aparte token uit Supabase Vault (`prominent_scheduler_token`). Geen token staat in repo/frontend/croncommand. JWT-gatewaycontrole is uit omdat de handler zelf elke request controleert: Vault-token voor de scheduler of `auth.getUser` + bestaande database-adminrol. User metadata geeft geen autorisatie. Verkeerde tokens en anonieme requests krijgen 401, viewers/editors 403. CORS accepteert uitsluitend de productieorigin en expliciete localhostorigins.

De worker ververst bootstrap, ontdekt/verzoent sourcegroepen elke zes uur, seedt de gecureerde lijst, plant ontbrekende rondes en verwerkt maximaal 45 jobs per batch. API-verkeer is sequentieel met 300 ms tussen requests, 15 s timeout en maximaal drie pogingen met backoff. Succesvolle paginatie is vereist voordat verdwenen leagueleden gedeactiveerd worden. Handmatige tags blijven bewaard. Leaguesync-tijd staat in `source_counts.synced_at`, los van de batchtijd.

Fouten krijgen een begrensde exponentiële retry (1 min tot 24 uur). Eén managerfout stopt de anderen niet. Een storing verandert geen goede snapshot. De UI toont opgeslagen data met de ophaaltijd; historische snapshots worden nooit bijgewerkt met latere correcties. Sourcewaarschuwingen en onvolledige jobs houden runstatus op partial. Een volledige run zonder fouten/warnings wordt complete.

Directe eerste backfill: `npm run backfill:prominents`. Gebruik een gecontroleerd adminaccount via PROMINENT_ADMIN_EMAIL/PROMINENT_ADMIN_PASSWORD; voor projectacceptatie gebruikt het script desgewenst het bestaande genegeerde test-results/staging-accounts.json. Secrets worden niet gelogd. Het script herhaalt batches tot complete en bewaart bewijs onder test-results/prominent-backfill.json. Dezelfde opdracht hervat een onderbroken backfill. De periodieke scheduler hervat eveneens ontbrekende jobs.

In `/ranglijsten`, ingelogd als admin, toont het compacte beheerpaneel bootstrapdatum, laatste complete sync, huidige ronde, groepen/coverage, pending, fouten, retries en niet-beschikbare rondes. `Nu synchroniseren` roept dezelfde beveiligde worker aan; geen aparte syncimplementatie. Bekijk raw syncfouten in de jobstatus en Edge Function logs. Schedulerrequests zijn tijdelijk te inspecteren in net._http_response, en uitvoering in cron.job_run_details.

## Handmatig toevoegen

Nieuwe ESPN/kenner: voeg de geverifieerde entry en publieke naam aan ESPN_SEEDS toe en deploy de Edge Function met dezelfde model-/collectorbestanden. Eerste broncontrole volgt uiterlijk binnen zes uur; zet voor een directe sourcecontrole de laatste source_counts.synced_at op een datum ouder dan zes uur via beheer-SQL. Of upsert de centrale manager via beheer-SQL en voeg de gewenste groep toe. Gebruik ON CONFLICT(espn_entry_id); maak nooit een tweede identiteit.

Handmatige tag: upsert prominent_groups op (prominent_id,group_type), `source_type='manual'`, `manual_override=true`, `active=true`. Hiermee kan automatische leagueverzoening de tag niet verwijderen. Groupcodes zijn CONTENT_CREATOR, ESPN, FVT_SUBLEAGUE. Voor een nieuwe seizoenstart moet een veranderde ESPN-entry-ID opnieuw geverifieerd worden; dezelfde entry-ID wordt niet op naam vervangen.

## Berekeningen en grenzen van de bron

Groepsrank wordt uit gespeelde snapshots gerangschikt op total_points, met gedeelde posities bij gelijke punten. Beweging vergelijkt de vorige ronde in dezelfde groep. Een snapshot bewaart groepslidmaatschap, zodat toekomstige tagwijzigingen oude standen niet veranderen. Bij de eerste backfill wordt de nu ontdekte groepsindeling op oude rondes toegepast: deze API levert geen historisch league-lidmaatschap. Namen, clubs en Fantasy-teamnamen bij historische eerste backfill zijn die bij ophalen; de picks zelf, captain, vice, selectievolgorde en alle entry_history-waarden zijn wel exact uit de betreffende historische ronde. Oude teamnaam-/clubwijzigingen of prijswijzigingen zijn met deze endpoints niet bewezen te reconstrueren. De opgeslagen metadata blijft daarna onveranderd.

Transfers zijn IN/OUT-setverschillen tussen N en N−1, zonder pairwise suggestie. Ontbrekende vorige rondes geven geen afleiding. rich en de ronde erna zijn expliciet als tijdelijke selectie/terugkeer gemarkeerd. Aantallen kunnen dus afwijken van de authoritative ESPN-transfers. Nettotransfertrends tellen selectieverschillen, geen bewezen permanente transfers.

Manager van de Ronde gebruikt event_points; beste gemiddelde gebruikt daadwerkelijk beschikbare rondes. Hoogste waarde gebruikt team_value/10. Transfer King telt ESPN-event_transfers t/m de gekozen ronde. Differential King telt starters met maximaal 10% selectieownership binnen de geselecteerde groep; dit is geen onbewezen rendement. Captain ownership gebruikt de captainflags. Beste score na transfers is event_points minus kosten onder managers met transfers en bewijst geen causale transferprestatie. Bankstatistieken tellen bankpunten; minder bankpunten alleen bewijst geen optimale bank. Chipstatistieken tonen werkelijk gebruikte chips en rondepunten; beschikbaarheid volgt de bootstrap-chipvensters. Bij incomplete historie worden geen rondes als nul ingevuld. Gelijke uitgelichte scores kunnen meerdere winnaars hebben, de spotlight toont één.

Geen zware chartdependency: toegankelijke SVG-grafieken met opvraagbare waarden. Ranglijst laadt pagineerbare samenvattingen en alleen picks voor de geselecteerde/vorige ronde. Profiel laadt zijn eigen historie in één gebatchte query. Geen N+1-query per manager en geen browserfetch naar ESPN. Samenvattingen worden vijf minuten binnen de huidige pagina gecachet; alle analyses zijn afgeleid uit de immutable snapshots en houden geen tweede mutable waarheid bij.

## Verificatie

`npm run test:prominents`: model/collector met echte fout-, retry- en backfillsituaties plus PostgreSQL/PGlite voor atomaire writes, 15 picks, immutable history, leases en RLS.

`npm run test:prominents-live`: echte leaguepaginatie, seeds, dedupe, Lars, en vergelijking van Kees, Sam, Emile, Marciano, Bram en een FVT-entry in SR1/SR4/SR7 op alle authoritative velden en alle 15 picks. Test ook anonieme writes, sync en forged scheduler-token.

`node scripts/test-prominent-ui.mjs`: aparte lokale browser, echte Supabase-data, desktop/mobiel, vier groepen, zoekveld/empty, profile navigation, captain/vice/bank, vijf tabs, historie-naar-team, charts, menu, overflow en hometeaser. Screenshots en resultaten staan in genegeerde test-results. PROMINENT_TEST_ORIGIN kan op de productie-URL ingesteld worden.

Bestaande controles: npm test, npm run test:public, npm run test:security, node scripts/test-live.mjs en npm run build. `test:ui-api` start een lokale Supabase HTTP-testdouble en vereist een afzonderlijke STUDIO_TEST_PASSWORD; het is een testserver, geen zelfstandig pass/fail-testsuite. De nieuwe module is ook tegen echte Supabase-auth getest.

Supabase advisors meldt pg_net als niet-verplaatsbare extensie met public-metadata; zijn netwerkfuncties/net-schema zijn expliciet ontoegankelijk gemaakt voor PUBLIC/anon/authenticated. Bestaande leaked-password-protection waarschuwing is accountconfiguratie en wordt niet door deze module gewijzigd.

## Uitgevoerde acceptatie en oplevering

Live Supabase rzunbquzffdivlpuomjc bevat 104 unieke managers. Groepen: 86 FVT, 6 creators inclusief de handmatige Lars-tag, 18 ESPN; groepen overlappen. Alle beschikbare SR1–SR7-snapshots zijn opgeslagen: 724 snapshots en 10.860 picks. Coverage per ronde: 102/103/103/104/104/104/104. Vier ontbrekende eerdere rondes zijn aantoonbaar niet gespeeld: entry 58117 startte in SR2, entry 64509 in SR4. Geen pending jobs, geen error jobs, laatste status complete. De schedulerroute is daadwerkelijk aangeroepen via pg_net met Vault-auth en gaf HTTP 200, complete, 0 processed, 0 pending. Handmatige adminsync gaf dezelfde idempotente uitkomst.

Uitgevoerd: npm run check (40 tests, 38 bestaande PostgreSQL checks, 94 HTML/platform-security checks, build), test:public (3), test:prominents (8 model/collector tests en 21 extra PostgreSQL checks), bestaande test-live (102 live auth/RLS/role/persistence/concurrency checks), test-prominent-live (862 echte data/security-checks, inclusief 18 manager/ronde-vergelijkingen), test-prominent-ui (24 browserchecks), test-prominent-ui-states (2 fout/herstelchecks, search-empty zit in de 24), test-prominent-admin-ui (4 beheerchecks), capture-prominent-pages (15 profiel/viewportcombinaties, plus ranglijstweergaven). Screenshots van Team, Historie, Transfers, Prestaties, Analyse en ranking zijn bekeken op desktop, 390px mobiel en 320px. Tabellen scrollen binnen hun container, ranking verandert op mobiel in volledige cards.

Staged productiebuild READY: https://fantasy-studio-fwnywj8qx-larswoudenberg-6243.vercel.app/ranglijsten — deployment dpl_AYS8z55D46UTDDBi4otWnQqSwLkn, bestaande Vercel-project fantasy-studio-app / team larswoudenberg-6243. Beveiligde staged route is met de bestaande Vercel-auth gelezen en gaf HTTP 200. De productie-domeinpromotie is niet uitgevoerd: automatische approval review wees vercel promote af en verlangt expliciete toestemming voor de live release. Database, Edge Function en scheduler zijn wel al toegepast zoals de opdracht expliciet vroeg. De bestaande publieke production-origin is daardoor nog niet naar dit staged build gepromoveerd.

Toegevoegd/aangepast:

| Onderdeel | Bestanden |
| --- | --- |
| Publieke module | src/public/prominents.js, prominents.css, prominentRepository.js |
| Collector en modellen | src/services/prominentCollector.js, prominentModel.js |
| Integratie | src/platform/bootstrap.js, routes.js, src/public/homepage.js, package.json |
| Server | supabase/functions/prominent-sync/index.ts |
| Schema/scheduler | Vier hierboven genoemde migrations onder supabase/migrations |
| Backfill | scripts/prominent-backfill.mjs |
| Tests | src/services/prominentModel.test.js, prominentCollector.test.js; scripts/test-prominent-database.mjs, test-prominent-live.mjs, test-prominent-ui.mjs, test-prominent-ui-states.mjs, test-prominent-admin-ui.mjs |
| Visuele controle | scripts/capture-prominent-pages.mjs |
| Documentatie | docs/migration/PROMINENTEN.md |
