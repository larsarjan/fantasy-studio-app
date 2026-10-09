# Centrale spelersfoto's

## Identiteit en dekking — audit 9 oktober 2026

| Systeem | Betekenis | Gebruik |
|---|---|---|
| Studio `players.payload.id` | Bijvoorbeeld `20260001` | Canonieke Studio-identiteit; lokale bestandsnamen |
| Database `players.id` | Import-/rijnummer, bijvoorbeeld `1` | **Geen** voetbalspeler-ID; nooit gebruiken voor foto's |
| ESPN `elements.id` | Kleine numerieke ID | Price Predictor `player_id`, prominententeams `element_id` |
| ESPN `code` / `opta_code` / `photo` | Andere provideridentiteit, bijvoorbeeld `229595`, `p229595`, `229595.jpg` | Niet verwisselbaar met ESPN-element-ID of Studio-ID |
| Historische Studio-ID | Soms een naamachtige slug | Zonder expliciete seizoenskoppeling uitsluitend initialen |

Alle sleutels bevatten namespace én seizoen. `2026-2027` wordt genormaliseerd naar `2026/2027`. Alleen de bekende seizoen-gecodeerde Studio-catalogus kan zijn seizoen uit een `2026xxxx`-ID afleiden; ESPN moet het seizoen expliciet meekrijgen.

De audit bevat 576 Studio-spelers, 602 ESPN-spelers en 424 bestaande opgeslagen `elite_player_stats.payload.playerId`/`espnPlayerId`-paren. Dit zijn bestaande importkoppelingen, geen officiële ESPN-crosswalk: de oorspronkelijke import gebruikte unieke naam/club/positie-matches. De fotoservice maakt **geen nieuwe naamkoppelingen**. Ze accepteert alleen bestaande expliciete paren waarvan beide IDs bestaan en de relatie in beide richtingen uniek is. Conflicten worden volledig uitgesloten, ook als een conflict naar een inmiddels ontbrekende ID verwijst. Een clubtransfer of gewijzigde schermnaam verandert geen ID-koppeling.

- 423 geldige paren; één opgeslagen paar valt af omdat een ID ontbreekt.
- 153 Studio-spelers en 179 ESPN-spelers hebben geen geaccepteerde onderlinge koppeling.
- 287 oorspronkelijke bestanden blijven ongewijzigd bewaard: 285 decodeerbare spelersfoto's, één generieke placeholder en één HTML-bestand met een `.webp`-naam. Bestandsvalidatie sluit die laatste twee generiek uit, zonder speleruitzonderingen.
- 277 van de 576 actuele Studio-spelers hebben een lokale foto; 299 gebruiken initialen.
- Via de veilige crosswalk hebben 248 van de 602 ESPN-spelers een foto; 354 gebruiken initialen.
- Acht geldige lokale foto's horen niet bij de huidige Studio-catalogus. Ze worden niet aan iemand anders gekoppeld.

Deze aantallen zijn een gecontroleerde momentopname. Nieuwe spelers zonder expliciete ID-koppeling blijven veilig op initialen staan.

## Bronkeuze

Primair in deze release: de bestaande, door het project aangeleverde lokale collectie. Er zijn geen ESPN-afbeeldingen gekopieerd en geen onbewezen CDN-URLs geconstrueerd. De officiële bootstrap levert een `photo`-bestandskey en Opta-code, maar daarmee is geen stabiele, voor deze app goedgekeurde headshot-URL of hergebruiksovereenkomst vastgesteld. Daarom activeert deze release ESPN niet als externe beeldbron. Referenties: [officiële ESPN Fantasy](https://fantasy.espngoal.nl/) en de daar gekoppelde [gebruiksvoorwaarden](https://disneytermsofuse.com/dutch-netherlands/). De oorspronkelijke lokale collectie is niet onafhankelijk op fotografische/licentierechten geaudit.

De centrale resolver ondersteunt de laatst gevraagde volgorde:

1. Expliciet goedgekeurde, ingeschakelde centrale bronfoto.
2. Ingeschakelde handmatige override.
3. Lokale gecodeerde foto voor de canonieke Studio-identiteit.
4. Initialen zonder netwerkverzoek.

Om bewust een goedgekeurde bronfoto te vervangen, zet een beheerder `source_enabled=false` en vult de override in. Een ongeldige URL of niet-decodeerbare afbeelding schuift door naar de volgende kandidaat.

## Beheer zonder codewijziging

`public.player_photos` bevat alleen openbare fotometadata, geen accounts of sleutels. Lezen mag publiek; schrijven vereist `profiles.role='admin'` (of de bestaande vertrouwde serverrol). Gewone leden én editors kunnen geen foto wijzigen. RLS en expliciete grants staan in de bijbehorende migratie.

Gebruik in de Supabase Table Editor de exacte `player_key` uit de manifest/service, bijvoorbeeld namespace:seizoen:ID. Bij een gemapte ESPN-speler beheer je de canonieke Studio-sleutel; bij een ongemapte ESPN-speler kan een expliciete ESPN-sleutel worden beheerd zonder een naamkoppeling te verzinnen.

- Handmatig: `override_url`, bij voorkeur ook een kleine `override_thumbnail_url`, `override_enabled`.
- Goedgekeurde bron: `source_url`, `source_thumbnail_url`, `source_name`, `source_status='approved'`, `source_enabled=true`.
- Bronverversing werkt uitsluitend bronkolommen bij. Gebruik geen volledige rijvervanging die overridevelden wist. De huidige importjobs raken deze nieuwe tabel niet aan. De test controleert behoud van de override bij een bronupdate.
- Bij dezelfde URL kan de externe CDN-cache oud beeld tonen. Gebruik voor een nieuw beeld een nieuwe versie-URL/bestandsnaam. `updated_at` verandert alleen wanneer metadata echt wijzigt. De app haalt het kleine register eenmaal per paginalaad op; herladen haalt beheerwijzigingen op.
- Gebruik compacte HTTPS-afbeeldingen op een goedgekeurde CDN. Geen openbare uploadroute of generieke image-proxy toegevoegd. URL-validatie weigert onder meer HTTP, credentials, lokale/private numerieke hosts, data-/javascript-URLs en SVG-bestandsURLs. Het browserbeeld wordt pas zichtbaar na succesvol decoderen.

## Opslag, performance en foutafhandeling

`src/assets/Players` blijft het archief. `scripts/build-player-photos.mjs` valideert met Sharp, bouwt 96px thumbnails en maximaal 240px detailvarianten zonder opschalen, en schrijft `public/player-photos` plus `src/data/playerPhotos.generated.json`. Contenthashes in bestandsnamen en Vercel immutable cacheheaders voorkomen onnodige downloads. Het oorspronkelijke archief wordt niet meer in de frontendbundel of Vercel-upload opgenomen.

Totaal geldige originelen: 27.524.387 bytes. Alle 285 thumbnails samen: 1.238.336 bytes (95,5% kleiner). Alle detailvarianten samen: 3.211.210 bytes. Deze collecties worden **niet** als geheel opgehaald: één IntersectionObserver laadt alleen zichtbare/nabije avatars; vaste afmetingen voorkomen verspringen. Kleine kaarten/tabellen gebruiken thumbnails. Detailkaarten gebruiken de grotere variant. URLs zijn niet gedupliceerd in spelers-, selectie- of prijs-API-payloads.

Een gedeelde foutcache onderdrukt dezelfde mislukte URL gedurende 15 minuten, ook na opnieuw renderen. Gelijktijdige verzoeken worden samengevoegd. Na maximaal 10 seconden volgt fallback; de oorspronkelijke afbeelding blijft verborgen totdat deze decodeert. Bij ontbrekende mapping of volledige uitval blijven nette initialen zichtbaar. Geen kapot-afbeeldingicoon.

## Schermen

Spelerstabel en profiel, Vergelijken (seizoensstatistieken en Fantasy Outlook), Captain Radar, Differentials, Analyse via de gedeelde intelligence-renderer, Dashboard-spelerskaarten, FVT Manager-opstelling, Mijn selectie en zoekresultaten, Dream Team, Price Predictor (tabel/detail/Bijna op grens), prominententeams en voetbalspelers in publieke ownership-/transferlijsten. Historische gedeelde profielen gebruiken dezelfde resolver en krijgen zonder betrouwbare mapping initialen. Manager-/gebruikersavatars zijn geen voetbalspelers en blijven afzonderlijk.

Twee kleine responsive correcties laten de bestaande spelerskop en vergelijkingsfilterbalk afbreken; geen redesign of modelwijziging.

## Verificatie en onderhoud

Acceptatie: 89 regressietests, 104 HTML/platformchecks, 11 gerichte databasechecks, 59 responsive foto-UI-checks, 13 fotoflowchecks en 69 Price Predictor-regressiechecks geslaagd. De foto-UI-checks bestrijken 1920/1366/820/390px; Vergelijken is daarnaast met twee werkelijk geselecteerde spelers op die vier breedtes gecontroleerd. De bestaande horizontale vergelijkingstabel blijft horizontaal schuifbaar.

Gemeten eerste zichtbare Price Predictor-lijst op 1366px: 603 avatarplaatsen (602 spelers plus detail), slechts twee zichtbare fotodownloads, 9.080 bytes beeldinhoud / 9.680 bytes transfer. Dit is een momentopname met de actuele sorteervolgorde; na scrollen worden passende thumbnails bijgeladen. Geen volledige originele beelden opgehaald.

Live Supabase-advisor: geen bevinding voor het nieuwe fotoregister. Bestaande projectmeldingen blijven buiten deze foto-opdracht: [pg_net in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) en [uitgeschakelde gelekte-wachtwoordcontrole](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). De drie private prijsmodeltabellen hebben bewust RLS zonder publiek beleid. Productie-afhankelijkheden: `npm audit --omit=dev` meldt nul kwetsbaarheden.

- `node --test src/services/playerPhotos.test.js src/services/playerPhotoRuntime.test.js`: identiteiten, dubbele namen, transfers, ontbrekende/ambigue/wrong-season koppelingen, echte manifest-crosswalk, bronvolgorde, URL-validatie, lazy loading, foutfallback en verzoekdeduplicatie.
- `node scripts/test-player-photo-database.mjs`: geïsoleerde PostgreSQL/RLS-tests; geen productie-testinhoud.
- `node scripts/test-player-photos-ui.mjs`: native browser, bestaande testaccount, vier viewportbreedtes; `PHOTO_SESSION`, `PHOTO_ORIGIN`, optioneel `PHOTO_SCREENS`.
- `node scripts/test-player-photo-flows.mjs`: echte vergelijking, profielfoto, lokale tijdelijke beeldfout, prominententeam. Alleen de lokale browser gebruikt een tijdelijke in-memory foutfixture; geen databasewijzigingen.
- `npm test`, `node scripts/test-platform.mjs`, `npm run build`.

Voor nieuwe fotocatalogi: maak eerst een nieuwe expliciete namespace/seizoenscrosswalk. Gebruik nooit alleen naam, club of de toevallig gelijk genummerde database-rij-ID. De generator verwacht een auditbestand met `studio:[{id,season}]`, `espn:{season,players:[{id}]}`, `links:[{studio_id,espn_id,season}]`; haal die uit de bestaande Studio-, bootstrap- en opgeslagen elite-IDvelden. Voer de generator en identity-tests uit, beoordeel de dekking en commit manifest/varianten samen. Geen automatische brede imports of naam-gebaseerde verrijking.
