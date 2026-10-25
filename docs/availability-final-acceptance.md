# PLAYER_AVAILABILITY afronding — 25 oktober 2026

## Codeacceptatie: GO; automatische Google-keten: nog handmatig te bevestigen

De navy profielkaart toont status, reden en verwachte terugkeer. Broninformatie
staat in het detailvenster; onbekende terugkeer wordt niet verzonnen. Bestaande
historie wordt gebruikt, er is geen nieuwe historietabel. Alle badges komen uit
dezelfde component, inclusief persoonlijke transfer- en risicokaarten.

Lokale browseracceptatie gebruikt de echt teruggelezen 84 Supabase-statussen in
een geïsoleerde database met de productiecomponenten. Dit is geen ingelogde
productie-accounttest en verandert geen echte selectie of manual override.

- Unnerstall: OUT, rugklachten, vanaf SR11, 1 november 2026.
- Marquez: 25%, onbekende blessure, vanaf SR11, 31 oktober 2026.
- Profiel, spelerslijst en Mijn selectie: consistente badges en werkend detailvenster.
- Advies: badges zichtbaar; 84/84 statusbeslissingen consistent. De eerder mislukte
  equal-alternative gevallen doubt50 en shortOUT geven hold, zonder transfer.
- Optimizer: echte workerberekening voltooid met de volledige lokale referentiepool;
  geen OUT-aankoop in de uitkomst. Captain Radar koos Drommel binnen de testselectie,
  niet Unnerstall of Marquez. Worker/hoofdthread en override-regressies blijven groen.
- Responsive: kaart, selectie- en adviesbadges gemeten op 1366, 820 en 390;
  geen clipping of overflow in deze componenten. Profiel ook op 1920 gecontroleerd.
  Detailsactie minimaal 44px hoog. Dialog open/sluiten en bronlink gecontroleerd.
- Beperking: screenshot-capture gaf herhaald een browser-timeout; de visuele
  pixelbeoordeling is dus niet afgetekend. DOM, zichtbare tekst en geometrie wel.
  Geen nieuwe handmatige productiestatus aangemaakt.

## Sync

`syncPlayerAvailabilityFullChain` is de enige beoogde scheduleringang.
Bronvalidatie en seizoen/club-identiteit blijven leidend. Na Sheet read-back
stuurt de route alleen verwachte timestamp/aantal naar de beveiligde backend,
geen willekeurige spelerdata. Vertraagde CSV-publicatie wordt vóór de writer
geweigerd. Een onbevestigde snapshot wordt in de volgende uur-run eerst opnieuw
geprobeerd, maximaal twee uur oud, zonder nieuwe bronfetch. Geen snelle retrylus.

De limiet geldt ook na fouten. Identieke snapshot schrijft nul; een nieuwe
observatietijd vernieuwt bewust actuele records. De writer is transactioneel,
manual overrides blijven leidend. Google Sheet-writes zelf zijn niet transactioneel:
een gedeeltelijke write kan in de Sheet zichtbaar blijven tot herstel. De route
doet dan geen backendaanroep en wist geen bestaande Sheet-rijen. Een verloren
backendantwoord geeft geen onterechte rollbackclaim of PASS.

Live read-only databasecontrole: 84 records, 84 unieke speler/seizoen-combinaties,
73.728 bytes inclusief index. Alle observaties: 2026-10-24T16:32:14.049Z.
Deze afronding heeft geen bronfetch, runtime-write of schemawijziging uitgevoerd.
Bekende bronstand blijft 88 / 84 matched / 4 unmatched / 0 ambiguous;
geen nieuwe inhoudelijke bronmeting geclaimd.

## Tests

- 216 regressietests geslaagd (207 baseline + 9 full-chain-tests).
- 291 database/securitychecks geslaagd (39 + 97 + 155).
- 4 backendtests geslaagd, inclusief publicatielag en ongeldige verzoeken.
- Geïsoleerde parser/Sheet/handler/PostgreSQL/runtime/advies/worker-keten geslaagd.
- Bronfout, leeg/onvolledig, verdwenen kaart, Sheet/backendfout, herstel,
  idempotentie, unmatched/ambiguous, manual prioriteit: geslaagd.
- Productiebuild en `git diff --check`: geslaagd.

## Resourcebegroting

Maximaal 24 HTML-bronrequests, 24 ESPN-bulkrequests en 24 backendcalls per dag
vanuit de ene route. Eén gepubliceerde CSV-read per backendcall. Geen nieuwe Edge
Function. Maximaal circa 2.016 actuele heartbeat-updates/dag bij 84 spelers;
identieke observatietijd geeft nul writes. Geen Supabase-historygroei; normale
PostgreSQL dead tuples en nieuwe spelers kunnen fysieke groei geven. Maximaal
circa 120 compacte succeslogregels/dag plus platformmetadata. Sheet-historie
blijft alleen bij inhoudelijke verandering, heartbeatkolommen kunnen elk uur wijzigen.

## Handmatige laatste stap

Er is geen gekoppelde Google document/Apps Script-sessie. Er wordt geen halve of
dubbele scheduler aangemaakt. Volg
[de volledige instructie](apps-script/PLAYER_AVAILABILITY_FULL_CHAIN.md):
vervang het Sync-bestand, configureer de bestaande token veilig, voer
`testPlayerAvailabilityFullChain` uit en maak pas na `AV_FULL_PASS` één uurtrigger
voor `syncPlayerAvailabilityFullChain`. Controleer daarna de eerste automatische run.

De vier unmatched blijven Caio Henrique, Mohammed Ihattaren, Dele Thomas en
Thomas Didillon. Geen fuzzy mapping en geen betrouwbare schorsingsaftelling.
