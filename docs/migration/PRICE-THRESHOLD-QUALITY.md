# Prijsdruk: kwaliteitscontrole van historische drempels

## Scope

Deze aanvulling op de bestaande UX beoordeelt of een ruwe ratio als drempelsignaal mag worden gepresenteerd. `priceThresholdQuality.js` is een kleine, zuivere presentatiefunctie op bestaande cachevelden. Er zijn geen nieuwe queries, imports, migraties, collectors of backtests. `rise_probability`, `fall_probability`, modelconfidence, threshold-confidence en alle oorspronkelijke waarden blijven ongewijzigd. De ruwe verhouding blijft in `price_pressure_percentage` en wordt in de afgeleide uitkomst expliciet `raw_price_pressure_percentage` genoemd.

De onderstaande grenzen zijn conservatieve, gedocumenteerde productvoorwaarden. Ze zijn geen nieuw statistisch gekalibreerd voorspelmodel en bewijzen geen prijswijziging. Algemene modelconfidence of een hoge hitrate inclusief stabiele uitkomsten mag slechte drempeldata niet compenseren.

## Kwaliteitsregels

| Controle | Voor een bruikbaar (`valid`) percentage |
|---|---|
| Drempel en druk | Bekende richting/eenheid, eindige positieve drempel, eindige druk en niet-negatieve ruwe ratio |
| Absolute drempel in transfers | Minstens 20 netto transfers; 1–2 transfers is te ruisgevoelig |
| Drempel in relatief ownershipverlies | Referentie-ownership minstens 1%; `threshold × reference ownership` minstens 0,2 procentpunt |
| Ownershipresolutie | Bron rondt op 0,1 procentpunt; drempel en materiële daling moeten minstens twee stappen beslaan. Een referentie van 1% bevat tien stappen, zodat één afrondingsstap niet de hele referentie bepaalt |
| Drempelmetingen | Minstens 10; 5–9 is `weak`, minder dan 5 `unreliable`. Dit betreft echte drempelmetingen, niet vergelijkbare stabiele speler-vensters |
| Threshold-confidence | Minstens 60/100; 40–59 `weak`, daaronder of onbekend `unreliable` |
| Spreiding | Geldige 20e–80e-percentielrange rondom de puntschatting; `(hoog − laag) / drempel ≤ 0,75`. Tot 1,5 `weak`, boven 1,5 `unreliable`; ontbrekende/ongeldige range wordt niet goedgekeurd |
| Referentie | Bevestigd door een waargenomen prijswijziging; een voorlopige referentie is maximaal `weak` |
| Meetdekking | Grootste meetgat maximaal 45 minuten, aansluitend op de bestaande modelgrens; boven 45 `weak`, boven 180 minuten of onbekend `unreliable` |
| Resterende range | Breedte groter dan `max(100 transfers, absolute netto beweging)` is een zeer brede marge en maakt de drempel maximaal `weak` |

Ontbrekende basisgegevens leveren `unavailable`. Bij meerdere problemen wint de zwaarste classificatie. Iedere afkeuring heeft een leesbare reden in de detailkaart.

## Materiële beweging, signaalsterkte en filters

Naast een geldige drempel vereist procentuele presentatie een netto beweging van minstens 20 transfers in dezelfde richting. Bij dalingen op basis van ownership moet de ownershipafname bovendien minstens 0,2 procentpunt zijn. Anders staat er **Beperkte absolute druk**, zonder een sterke procentuele claim. Twintig transfers is een conservatieve absolute productgrens om enkele transacties niet als marktbreed signaal te presenteren; geen bekende ESPN-regel.

Voor gekwalificeerde beweging is de rangschikkingsscore:

```text
signaalsterkte = round(100
  × min(raw_ratio, 150) / 150
  × sqrt(min(abs(netto transfers) / 100, 1))
  × threshold_confidence / 100
  × (0.5 + 0.5 × modelconfidence / 100))
```

Ongekwalificeerde druk krijgt geen scorebijdrage (0/100, niet gekwalificeerd). De score is **geen probability**. De absolute bijdrage groeit tot 100 transfers; de wortel voorkomt dat middelgrote bewegingen volledig verdwijnen. De relatieve bijdrage stopt bij 150% zodat verder overschieten de rangschikking niet onbeperkt opblaast. Kwaliteit wordt vóór deze score getoetst, dus dit is nadrukkelijk niet uitsluitend een visuele cap.

- Standaardsortering: kwaliteitsklasse eerst, dan signaalsterkte, dan absolute netto beweging. Een onbetrouwbare 500% passeert nooit een bruikbare 95%.
- Nabijheidssortering: kwaliteitsklasse, dan afstand van een gekwalificeerde ratio tot 100%; ongekwalificeerde ratios tellen niet mee.
- KPI stijgings-/dalingssignalen: bruikbare drempel, materiële absolute beweging en minstens 40% drempeldruk. 40% sluit aan op de bestaande grens voor matige druk.
- Bijna op grens: dezelfde voorwaarden, maar minstens 80%; de bestaande bijna-op-grens-cards blijven behouden met een eerlijke lege staat indien nodig.
- Waarschijnlijk vannacht blijft de bestaande 80% modelkans + 50/100 modelconfidence gebruiken. Thresholdkwaliteit verandert deze onafhankelijke modelkans niet.

## Presentatie en resterende transfers

- `weak`/`unreliable`: **Drempel onzeker**, absolute netto transferdruk, threshold-confidence en uitklapbare redenen. Geen drukpercentage, drukbalk, sterk label of stellige overschrijdingsclaim.
- Bruikbare ratios tot 150% blijven exact zichtbaar; daarboven **>150% van geschatte grens**. De oorspronkelijke ratio blijft intact.
- Nul resterende transfers bij een gekwalificeerde, niet-overlappende overschrijding: **Geschatte grens bereikt**, niet ±0.
- Een resterende range die nul omvat maar ook positieve waarden bevat: **Geschatte grens mogelijk bereikt**, plus range en uitleg over overlap. Geen sterk statuslabel.
- Zeer brede ranges onderdrukken precieze drukclaims. Bij afkeuring is de primaire resterende waarde **Niet betrouwbaar te schatten**. De oorspronkelijke modelrange blijft in de technische uitleg als ongevalideerd zichtbaar.
- Groen/rood, tabel, kaarten, detailpaneel en responsive indeling blijven behouden. Modelkans, modelconfidence, threshold-confidence en signaalsterkte worden afzonderlijk benoemd.

## Onderzoek van echte productievoorbeelden

Vastgelegde cache: **8 oktober 2026, 21:30:04 UTC**, 601 spelers. Geen synthetische of handmatig aangepaste productiedata.

| Speler | Drempel / huidige druk (eenheid) | Netto beweging | Metingen | Threshold-confidence | Reset / grootste gat | Ruwe ratio vóór | Presentatie na |
|---|---|---:|---:|---:|---|---:|---|
| Berkhout, Cambuur | 0,20 / 1,00 relatief ownershipverlies | −1 | 19 | 44/100 | Voorlopig / 3.870 min | 500% | Drempel onzeker; netto −1 |
| Oyen, Heerenveen | 0,20 / 1,00 relatief ownershipverlies | −3 | 19 | 44/100 | Voorlopig / 3.870 min | 500% | Drempel onzeker; netto −3 |
| Binder, Cambuur | 0,20 / 0,50 relatief ownershipverlies | −8 | 19 | 44/100 | Voorlopig / 3.870 min | 250% | Drempel onzeker; netto −8 |
| Bossin, Feyenoord | 0,20 / 0,50 relatief ownershipverlies | −1 | 19 | 44/100 | Voorlopig / 3.870 min | 250% | Drempel onzeker; netto −1 |
| Flataker, Go Ahead Eagles | 0,20 / 0,50 relatief ownershipverlies | −4 | 19 | 44/100 | Voorlopig / 3.870 min | 250% | Drempel onzeker; netto −4 |
| Read, Feyenoord | 126 / 143 netto aankopen | +143 | 11 | 26/100 | Voorlopig / 15,55 min | 113,49% | Drempel onzeker; netto +143 |
| Tengstedt, Go Ahead Eagles | 126 / 137 netto aankopen | +137 | 11 | 26/100 | Voorlopig / 15,55 min | 108,73% | Drempel onzeker; netto +137 |

Bij Berkhout/Oyen gaat afgerond ownership van 0,1% naar 0,0%: schijnbaar 100% relatief verlies / 20% drempel = 500%. Bij Binder/Bossin/Flataker is 0,2% naar 0,1% schijnbaar 50% relatief verlies / 20% = 250%. Hun drempels zijn slechts 0,02 respectievelijk 0,04 procentpunt, kleiner dan één afrondingsstap. Hun relatieve drempelrange is 0,1111–0,2857; spreiding circa 87% van de puntschatting. De fout was deze ruwe verhouding als sterke, betrouwbare druk presenteren.

Read/Tengstedt hebben een historische drempelrange **5–663 transfers** rond 126: breedte 658 / 126 ≈ 522%. Hun resterende ranges zijn 0–520 en 0–526. De mediane ratio suggereerde een bereikte grens terwijl de gegevens nauwelijks een precieze grens ondersteunen.

Er staat ook een **Tengstedt bij Feyenoord** in de bron (ID 239, tegenover ID 275 bij Go Ahead Eagles). Die is afzonderlijk gecontroleerd: drempel 0,20, huidige druk 0,00, netto −1, 19 metingen, confidence 44, voorlopige reset met gat 3.870 minuten. Geen 108,73%-voorbeeld; eveneens geen gekwalificeerd signaal.

Op exact deze snapshot: oude richting-KPI's **125 stijgers / 316 dalers / 15 grensgevallen**; nieuwe materiële, gekwalificeerde KPI's **0 / 0 / 0**. Kwaliteit: 0 valid, 9 weak, 404 unreliable, 188 unavailable. Dit is een beperking van de huidige onderbouwing, geen reden om voorwaarden te versoepelen. Alle spelers, absolute transferbewegingen en oorspronkelijke modelkansen blijven beschikbaar. Aantallen veranderen met echte nieuwe metingen.

## Validatie

Geïsoleerde tests dekken A–H uit de opdracht, ownershipafronding, kleine steekproeven, meetgaten, voorlopige resets, brede/ongeldige ranges, absolute significantie, kwaliteitsrangschikking en onveranderde modelkansen/confidences. Synthetische grensgevallen bestaan uitsluitend in lokale tests.

Browseracceptatie: de zeven genoemde spelers plus beide Tengstedt-records, kwaliteitsmeldingen, geen ongekwalificeerde drukbalken/sterke claims, materiële KPI's, grensfilter en de bestaande vier responsive formaten. Geen herimport of zware backtest nodig voor deze presentatielaag.

Uitgevoerde lokale controles: **84 regressietests**, **104 platform-/HTML-securitychecks**, **69 gerichte UI-checks** op 1920/1366/820/390 pixels en de aparte controle van alle acht echte spelerrecords. Productiebuild geslaagd. Geen database- of modelservicewijzigingen.
