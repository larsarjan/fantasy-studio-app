# PLAYER_AVAILABILITY: laatste handmatige acceptatie

Deze instructie vervangt de oude sheet-only pilot voor de laatste acceptatiefase.
De eigenaar van de volledige keten is uitsluitend het bestaande gebonden Apps Script-project.
Er wordt door deze code geen trigger aangemaakt.

## Bestanden en configuratie

1. Open de bestaande Sheet, **Extensies > Apps Script**.
2. Vervang uitsluitend de volledige inhoud van `PlayerAvailabilitySync.gs` door
   [de versie naast deze handleiding](PlayerAvailabilitySync.gs). Sla op.
3. `PlayerAvailabilityCore.gs` en `PlayerAvailabilityAliases.gs` blijven dezelfde
   goedgekeurde bestanden. Laat `Code.gs`, `EspnSync.gs`, `EliteManagerSync.gs`,
   `FantasyStudioStart.gs`, `TransferDeadlineSharedSync.gs`, `KNVBFixtures.gs`
   en hun bestaande triggers ongemoeid. Maak geen dubbele availability-functies.
4. Open **Projectinstellingen > Script properties / Scripteigenschappen**:
   - `AVAILABILITY_SEASON` = `2026/2027` (bestaande instelling behouden).
   - `AVAILABILITY_BACKEND_TOKEN` = de bestaande `reference_scheduler_token`
     uit Supabase Vault van Fantasy Studio (`rzunbquzffdivlpuomjc`).
     Gebruik niet de anon/public key of service-role key.
5. De backend moet op de nieuwe release staan met
   `AVAILABILITY_SHEET_ENABLED=true` in Vercel Production. Dit activeert het
   beveiligde endpoint, geen automatische taak.

De projecteigenaar kan de bestaande token in Supabase SQL Editor zelf ophalen:

```sql
select decrypted_secret
from vault.decrypted_secrets
where name = 'reference_scheduler_token';
```

Kopieer de waarde alleen rechtstreeks naar de genoemde Script Property. Deel hem
niet in chat, screenshots, broncode of logs. Deze bestaande token is ook voor de
reference-sync geldig; beperk toegang tot het gebonden script tot vertrouwde editors.
Geen token genereren, roteren of cron aanpassen voor deze stap.

## Eén handmatige test

Kies boven in de functielijst **`testPlayerAvailabilityFullChain`** en klik
**Uitvoeren**. Geen Apps Script-webappdeployment nodig.

Google kan toestemming vragen voor Sheets lezen/bewerken en externe verbindingen.
De scopes volgen het gehele bestaande project; dit voegt geen Google-dienst toe
naast de reeds gebruikte SpreadsheetApp en UrlFetchApp. Zie
[Google-autorisatie](https://developers.google.com/apps-script/guides/services/authorization).

Bij de eerder gemeten bronstand verwacht je:

```text
AV_FULL_SOURCE rows=88
AV_FULL_MATCH matched=84 unmatched=4 ambiguous=0
AV_FULL_SHEET changed=<N> readback=88
AV_FULL_BACKEND written=<W> unchanged=<U> skipped=4 errors=0
AV_FULL_PASS
```

- `N` is het aantal inhoudelijk gewijzigde Sheet-rijen; bij gelijke inhoud 0.
- Bij exact dezelfde observatietijd: `written=0 unchanged=84`.
- Bij een nieuwe uurlijkse observatietijd: doorgaans `written=84 unchanged=0`.
  Dit vernieuwt bewust de actuele heartbeat; geen nieuwe runtime-historyrijen.
- `written + unchanged = read`, voor de oorspronkelijke snapshot 84.
- De bron kan inmiddels veranderen. Afwijkende aantallen eerst beoordelen;
  vier bestaande unmatched spelers nooit zelf raden of fuzzy koppelen.
- Totale Sheet-rijen kunnen door bestaande inhoudelijke historie toenemen;
  `readback` telt uitsluitend de zojuist waargenomen actieve bronkaarten.

Een onmiddellijke tweede uitvoering geeft **`AV_FULL_WAIT hourly-limit`**:
geen nieuwe bron- of backendaanroep en 0 writes. Dit is een correcte throttle,
geen tweede uitgevoerde ketentest. De echte identieke backendbatch is apart
getest op 0 writes. Voor een nieuwe volledige ketenrun minstens 60 minuten wachten;
geen guard-properties wissen om de limiet te omzeilen.

**Geen PASS:** `AV_FULL_FAIL no-reset; completion-not-confirmed`, een exception,
ontbrekende BACKEND/PASS-regel of onlogische tellingen. Maak dan geen trigger.
Bij vertraagde CSV-publicatie weigert de backend met 409 vóór de databasewrite.
De volgende uur-run probeert eerst dezelfde onbevestigde snapshot opnieuw,
zonder nieuwe bronfetch. Zo blijft de route niet steeds achter een nieuwe
publicatietijd aanlopen. Na maximaal twee uur wordt weer een verse bronimport
vereist. Langdurige publicatieproblemen blijven een fout, nooit een stil PASS.
Bij ongeldige bron/Sheet wordt de backend niet aangeroepen. Een Sheet-writefout
kan gedeeltelijke Sheet-updates achterlaten, maar wist geen bestaande rijen;
de volgende geslaagde import herstelt de snapshot. Bij verloren backendrespons
kan de write al voltooid zijn: de keten claimt dan bewust geen PASS of rollback.

## Pas na AV_FULL_PASS: één uurtrigger

1. Open links **Triggers** (klokicoon). Controleer dat er geen bestaande
   availability-trigger is. Gebruik één Google-account als eigenaar; triggers
   van andere eigenaren zijn niet altijd zichtbaar.
2. Kies **Trigger toevoegen**:
   - Functie: **`syncPlayerAvailabilityFullChain`**.
   - Deployment: **Head / Hoofd**.
   - Gebeurtenisbron: **Tijdgestuurd**.
   - Type: **Uurtimer**.
   - Interval: **Elk uur**.
3. Sla op. Maak geen trigger voor `syncPlayerAvailability`, de pilotfunctie,
   of een tweede backendroute. Voeg geen Supabase/Vercel availability-cron toe.
4. Controleer na de eerste automatische uitvoering onder **Uitvoeringen** dezelfde
   vijf PASS-regels en de tellingen. Een run binnen 60 minuten na de handmatige
   test mag WAIT geven; de volgende geschikte uur-run moet PASS geven.

Google voert tijdtriggers niet gegarandeerd op een exact klokminuut uit; de code
bewaakt minstens 60 minuten tussen pogingen. Zie
[Google installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).

## Resources en grenzen

- Maximaal 24 HTML-bronpogingen en 24 ESPN-bulkrequests per 24 uur.
- Maximaal 24 backendaanroepen vanuit deze route, één CSV-read per aanroep.
- Geen per-speler HTTP-requests, geen extra Supabase Edge Function.
- Bij 84 actuele spelers maximaal circa 2.016 heartbeat-rowupdates/dag;
  inhoudelijk gelijke snapshot met gelijke tijd schrijft 0 rijen.
- Geen nieuwe Supabase-history. Huidige opslag gemeten: 84 rijen, 72 KiB incl. index.
  PostgreSQL dead tuples en toekomstige spelers/seizoenen kunnen fysieke groei geven.
- Maximaal vijf compacte applicatielogregels per geslaagde ketenrun (~120/dag),
  plus Google's uitvoeringsmetadata. Geen tokens of responses in logs.
- Schorsingen krijgen geen verzonnen aftelling; onbekende terugkeer blijft onbekend.

## Korte Studio-check

Open Studio > Spelers en zoek Unnerstall: OUT, rugklachten, verwachte terugkeer
volgens de actuele bron. Open de speler: navy statuskaart; bron pas onder
**Status en historie bekijken**. Zoek Márquez: 25% volgens de bekende snapshot.
Controleer dezelfde badges in Mijn selectie, advies en optimizer. OUT/25%/
schorsing mogen niet als normale aankoop/captain worden aanbevolen. Twijfel of
kortdurig OUT alleen mag geen verkoop opleveren. Test een handmatige override
alleen met bestaande bevoegde rechten, leg de eerdere waarde vast en herstel die.
Deze laatste live accountcontrole is niet vervangen door de lokale snapshot-test.
