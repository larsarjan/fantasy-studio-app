# Persoonlijke Studio — onderzoek en uitvoering

## Vastgesteld vóór implementatie (7 oktober 2026)

- Productie bevat 3.914 records in `player_match_stats`. Bijvoorbeeld Amofa,
  `fixtureId=er-2627-001`, seizoen `2026/2027`, 90 minuten tegen Excelsior.
  De bijbehorende fixture en historische uitslag bestaan. Import/opslag hebben
  deze data dus niet verloren.
- `history.js` leest `getPlayers()` (ruwe bronrecords), maar zoekt vervolgens
  `player.matchHistory`. Die afgeleide eigenschap staat niet op bronrecords.
  De bestaande detailcomponent en fantasy-puntenberekening bestaan nog.
  Herstel moet de detailrecords expliciet via fixture-ID en seizoen koppelen.
- `fantasy_teams` bewaart de Manager-status, importResult met echte speler-ID's,
  bank, aankoop/verkoopprijzen en instellingen. `save_fantasy_team` gebruikt een
  verwachte versie, transactielock en snapshots in `team_versions`.
  Dit blijft de enige selectieopslag; basis/bank/C/VC worden eraan toegevoegd.
- `profiles` bevat display_name, rol en tijdstempels; alleen eigen SELECT is
  toegestaan. De huidige instelling weergavenaam schrijft uitsluitend naar
  user_preferences. Een beperkte UPDATE-grant voor profielvelden is nodig;
  rollen blijven onwijzigbaar voor gewone gebruikers.
- De publieke homepage en reeds aanwezige Prominenten-wijzigingen vallen buiten
  deze productuitbreiding en blijven behouden.

## Herstel en productgedrag

`historicalMatchDetails.js` koppelt bronrecords op fixture-ID en genormaliseerd
seizoen. De bestaande fantasyberekening bepaalt punten; er worden geen scores
verzonnen. De live brondekking is 1.972 gespeelde spelerswedstrijden over 63
wedstrijden. Tien records betreffen spelers van wie de huidige club afwijkt;
hun prestaties verschijnen onder "Wedstrijdclub niet vastgelegd". Een historische
club wordt niet afgeleid uit een huidige transfer. Oudere uitslagen zonder
detailbron houden een duidelijke lege toestand.

`profiles` blijft volledig privé. Display_name en favorite_club zijn de enige
wijzigbare kolommen. Initialen vormen de avatar; e-mailadres komt uit Auth.
De oude weergavenaam uit user_preferences wordt eenmalig overgenomen. Profiel-
updates vergelijken updated_at om een verouderde schrijver te weigeren.

Mijn selectie gebruikt bestaande importResult.players met echte speler-ID's.
Basis, captain en vice-captain staan in importResult.lineupMetadata. Bank,
bekend/onbekend budget, aankoop/verkoopprijzen en transferplannen blijven in
dezelfde Manager-status. Geen tweede selectietabel. Incomplete conceptselecties
worden ook opgeslagen; bestaande fantasyregels valideren 15 spelers, posities,
clubmaximum, basis 11 en verschillende C/VC in de basis.

Automatisch opslaan serialiseert wijzigingen via save_fantasy_team en bestaande
team_versions. Bij een conflict stopt automatisch herhalen; de gebruiker krijgt
een expliciete herlaadmelding. Een netwerkfout krijgt een herprobeerknop.
Uitloggen en interne links wachten op opslag; beforeunload waarschuwt bij
onopgeslagen wijzigingen. Manager-imports en bestaande instellingen gebruiken
dezelfde opslag. De volledige selectie blijft bruikbaar in de bestaande optimizer.

Dashboard, Captain Radar, Analyse, Differentials en Speelschema tonen persoonlijke
context. Captain/sales gebruiken uitsluitend eigen spelers. Aankopen sluiten
eigen en reeds geplande spelers uit; positie, clubmaximum, beschikbare bank,
verkoopwaarde en bestaande transferstrafpunten begrenzen adviezen. Indien volledige
prognoses beschikbaar zijn worden drie komende rondes gebruikt; anders wordt de
enkele ronde expliciet vermeld. Onbekend budget/verkoopwaarde wordt zichtbaar
onderscheiden van een bevestigde waarde. Plannen reserveren budget en spelers,
maar voeren geen transfer uit. Algemene marktsignalen blijven herkenbaar apart.

## Migraties en beveiliging

- 20261007155632_personal_profile: optionele favoriete club, eigen updatebeleid,
  bijgewerkt-tijdstip en migratie van eerdere namen.
- 20261007160239_profile_column_privileges: trekt brede standaardrechten expliciet
  in en kent uitsluitend SELECT en UPDATE(display_name,favorite_club) toe.

De live test ontdekte dat Supabase standaard brede tabelrechten had toegekend.
Die zijn ingetrokken; het uitsluitend voor acceptatie gebruikte account is
teruggezet op viewer. De PostgreSQL-test bootst die standaardrechten nu na.
Live verificatie bevestigt dat alleen de twee profielkolommen wijzigbaar zijn.
RLS voorkomt lezen/schrijven van andermans profiel en selectie; rolverhoging
wordt geweigerd. Geen secret/service-role key is toegevoegd aan frontend of Git.

Security-advisor: geen ERROR; twee WARNs: bestaande leaked-password protection
is uit en pg_net staat in public. pg_net is niet relocateable en ondersteunt de
bestaande Prominenten-scheduler; geen destructieve extension-herinstallatie in
deze productacceptatie. Zie [pg_net advies](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
en [wachtwoordbeveiliging](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Gerichte verificatie

- 6 gerichte selectie-/historische regressietests; bestaande compact-persistence
  test bevestigt dezelfde Manager-resolutie.
- 25 echte PostgreSQL-controles voor profielopslag, kolomrechten, isolatie,
  selectie-roundtrip en versieconflicten, inclusief brede standaardgrants.
- 30 live checks voor twee accounts en de volledige historische brondekking.
- 97 platform-/HTML-beveiligingscontroles; productiebuild geslaagd.
- scripts/test-personal-ui.mjs: echte formulierinvoer van 15 database-spelers,
  basis/bank/C/VC, profiel opslaan/herladen, logout/login, bank en selectie,
  persoonlijke captain, responsive 1920/1366/820/390.
- scripts/test-personal-details-ui.mjs: eigen koop/verkoopfilters, budget, hits,
  toekomstige rondes, plannen, historische spelers/minuten/punten en responsive.

Browserbewijzen en testresultaten staan lokaal onder het genegeerde test-results.
De scripts gebruiken uitsluitend afgescheiden acceptatieaccounts; productiedata
wordt niet vervangen en er zijn geen fictieve wedstrijdscores toegevoegd.
PERSONAL_TEST_ORIGIN en PERSONAL_TEST_SESSION kiezen de testomgeving. De
PERSONAL_TEST_RESUME=1 optie hervat alleen de checks na een reeds uitgevoerde
logout/login als de zware bestaande dashboardberekening een browserread vertraagt.

## ESPN-sync

Er bestaat al een openbare broncollector voor Prominenten, maar daarmee is geen
gedocumenteerde en toegestane koppeling met de eigen actuele selectie bewezen.
In de officiële [ESPN Fantasy-site](https://fantasy.espngoal.nl/) en de gekoppelde
voorwaarden is geen ondersteund OAuth/importcontract voor deze toepassing
gevonden. Daarom geen eigen-account scraping, ESPN-credentials of misleidende
syncknop. Handmatig beheren en de bestaande tekst/screenshotimport werken via
hetzelfde model. Een toekomstige integratie vereist een geautoriseerde API,
betrouwbare ID-mapping, server-side credentials en expliciete importpreview.
