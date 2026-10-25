# PLAYER_AVAILABILITY — handmatige Google Apps Script-pilot

## Bestanden en bestaande code

Maak in het bestaande gebonden Apps Script-project drie nieuwe Script-bestanden aan:
1. PlayerAvailabilityCore.gs
2. PlayerAvailabilityAliases.gs
3. PlayerAvailabilitySync.gs

De volledige definitieve inhoud staat hieronder per bestand. Kopieer elk codeblok geheel naar het gelijknamige bestand. Apps Script voegt .gs zelf toe aan een Script-bestand. Als precies deze availability-bestanden al bestaan, vervang uitsluitend hun inhoud door onderstaande versie; maak geen dubbele bestanden/functies.

Laat Code.gs, EspnSync.gs, EliteManagerSync.gs, FantasyStudioStart.gs, TransferDeadlineSharedSync.gs en KNVBFixtures.gs ongemoeid. Geen bestaande trigger verwijderen of wijzigen. Ook appsscript.json blijft ongewijzigd; bij een expliciete scopes-fout eerst stoppen en de foutmelding delen.

## De ene testfunctie

Sla de drie bestanden op. Selecteer bovenin de functiekeuzelijst `testPlayerAvailabilityPilot` en klik eenmaal op Uitvoeren.

Geen andere functie uitvoeren. Geen Deploy/Implementeren gebruiken. Geen trigger toevoegen.

Deze functie controleert de bestaande tab PLAYER_AVAILABILITY (gid 847908298), maakt alleen de overeengekomen headers als de tab leeg is, stelt AVAILABILITY_SEASON in op 2026/2027 als deze nog ontbreekt, en voert één import uit. Een bestaande afwijkende seizoeninstelling of afwijkende headers leidt tot stoppen, niet tot stille conversie.

De functie haalt één keer de publieke ESPN-identiteitslijst en maximaal één keer de availability-bron op. Zij schrijft alleen availability-rijen in PLAYER_AVAILABILITY en eigen AVAILABILITY_* Script Properties. Spelers en ELITE_PLAYER_STATS worden alleen gelezen. Geen backend-/Supabase-aanroep, geen productie-deploy en geen permanente trigger.

## Google-autorisatie

Google kan vragen om spreadsheets te bekijken/bewerken en verbinding te maken met een externe service (UrlFetch). Het concrete scherm volgt de scopes van het HELE bestaande project; bestaande scripts kunnen al andere scopes hebben. Als deze rechten al verleend zijn, verschijnt mogelijk geen nieuwe vraag. Er zijn voor deze pilot geen Supabase-tokens, Vercel-tokens of wachtwoorden nodig.

Google bepaalt de benodigde scopes uit de projectcode: https://developers.google.com/apps-script/guides/services/authorization . Het externe verkeer gaat naar www.blessuresenschorsingen.nl en fantasy.espngoal.nl. Er worden geen Sheet-inhoud of credentials naar die bronnen gestuurd; het zijn publieke GET-requests.

## Verwacht resultaat in de Sheet

Bij ongewijzigde bron en lege tab: 1 kopregel + 88 gegevensrijen, 20 kolommen (A:T), 84 gekoppeld, 4 unmatched, 0 ambiguous. De 84 matches waren in de laatste lokale meting alias-matches. De vier unmatched hebben geen Fantasy_Player_ID:
- Caio Henrique — Ajax
- Mohammed Ihattaren — Fortuna Sittard
- Dele Thomas — NEC
- Thomas Didillon — Willem II

Clubspelling kan de letterlijke bronspelling volgen. Geen fuzzy ID invullen. De bron is live: aantallen kunnen inmiddels gewijzigd zijn. Een technisch PASS bevestigt import en read-back, niet automatisch dat gewijzigde aantallen inhoudelijk zijn goedgekeurd.

Verwacht Active=true, seizoen 2026/2027, bron-URL, SHA-256 Source_Hash en nieuwe First_Seen_At/Last_Seen_At/Last_Synced_At-tijden. Source_Updated_At blijft leeg omdat de bron geen betrouwbare tijd per kaart levert. Onbekende terugkeerdatum blijft leeg. OUT is percentage 0; onbekend wordt geen 100. Bij bestaande historie kan het totale aantal rijen groter zijn dan 88; inactieve historische rijen blijven behouden.

## Verwachte uitvoeringslog

Open Uitvoeringslog onder de editor, of Uitvoeringen > de betreffende uitvoering. Bij dezelfde bronstand en een lege tab:

```text
AV_PILOT_START season=2026/2027 trigger=not-created backend=not-called
AV_PILOT_SOURCE players=88 observed_at=<tijdstip>
AV_PILOT_MATCH matched=84 unmatched=4 ambiguous=0
AV_PILOT_SHEET readback=88 total_rows=88 columns=20
AV_PILOT_REVIEW Caio Henrique | Ajax | unmatched
AV_PILOT_REVIEW Mohammed Ihattaren | Fortuna Sittard | unmatched
AV_PILOT_REVIEW Dele Thomas | <bronclubspelling> | unmatched
AV_PILOT_REVIEW Thomas Didillon | Willem II | unmatched
AV_PILOT_PASS sheet-only; no trigger; no backend; no deployment
```

De volgorde van REVIEW-regels volgt de bronvolgorde. PASS plus juiste aantallen/read-back en uitvoering Voltooid bevestigen de Sheet-pilot. Stuur alleen deze AV_PILOT-regels terug; geen credentials.

`AV_PILOT_WAIT hourly-limit` is GEEN geslaagde nieuwe import: er was minder dan 60 minuten geleden al een poging. Wacht minimaal 60 minuten na die poging en voer dezelfde ene functie opnieuw uit. Verwijder de rate-limit-property niet. Bij een fout: geen trigger/deploy starten; deel de foutmelding. Bron-/parsefouten laten de bestaande statusrijen staan. De eerste headeraanmaak kan al gebeurd zijn vóór een bronfout.

Na deze handmatige stap blijft de echte Sheet→backend→productie-keten nog uit en moet die afzonderlijk gecontroleerd worden. Releaseadvies blijft NO-GO zolang die live keten en de nog open optimizerresultaat-acceptatie niet zijn afgetekend.

## Volledige definitieve bestanden

### PlayerAvailabilityCore.gs

```javascript
/* Pure functions shared by the bound importer and local regression tests. */
var AV_HEADERS = ['Source_Player_Name','Source_Club','Source_Status','Availability_Percentage','Reason','Expected_Return','Source_Updated_At','Source_URL','Fantasy_Player_ID','Fantasy_Player_Name','Fantasy_Club','Match_Status','Active','First_Seen_At','Last_Seen_At','Last_Synced_At','Source_Hash','Notes','Season','Status_Type'];
function avText(value) {
  return String(value || '').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi, function(_,n){return String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n));}).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,function(_,n){return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[n];}).replace(/\s+/g,' ').trim();
}
function avName(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function avClub(s) { var n=avName(s); return {necnijmegen:'nec',sccambuur:'cambuurleeuwarden'}[n]||n; }
function avDate(s) {
  var m=String(s).match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/); if(!m)return '';
  var iso=(m[3].length===2?'20':'')+m[3]+'-'+m[2]+'-'+m[1];
  if(new Date(iso).toISOString().slice(0,10)!==iso)throw Error('Ongeldige brondatum');return iso;
}
function avParse(html, expectedClubs) {
  if(typeof html!=='string'||!html.includes('id="club-list"')||!html.includes('</html>'))throw Error('Onvolledige bronpagina');
  var sections=html.slice(html.indexOf('id="club-list"')).match(/<section\b[^>]*>[\s\S]*?<\/section>/g)||[], clubs=[], records=[], seen={};
  sections.forEach(function(section){
    var heading=section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/);if(!heading)return;
    var club=avText(heading[1]); if(!(expectedClubs||[]).some(function(c){return avClub(c)===avClub(club);}))return;
    clubs.push(avClub(club));
    var cards=section.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)||[];
    cards.forEach(function(card){
      if(!/href="\/[a-z0-9-]+-\d+"/.test(card)||!card.includes('/uploads/spelers/')&&!/class="[^"]*\bgroup\b/.test(card))return;
      var name=card.match(/<strong[^>]*text-lg[^>]*>([\s\S]*?)<\/strong>/), href=card.match(/href="(\/[a-z0-9-]+-\d+)"/), pct=card.match(/<span[^>]*rounded-full px-2 py-0\.5 text-tiny[^>]*>([\s\S]*?)<\/span>/);
      if(!name||!href||!pct)throw Error('Spelerskaart gewijzigd');
      var label=avText(pct[1]), percentage=label==='OUT'?0:/^(25|50|75|100)%?$/.test(label)?parseInt(label,10):null;
      var icon=card.match(/src="\/staticimages\/icons\/(?:blessure|schorsing|twijfel|beschikbaar|niet-beschikbaar)[^"]*"[^>]*alt="([^"]+)"/i);
      var original=icon?avText(icon[1]):'', normalized=avName(original);
      var status=normalized.includes('schors')?'suspension':normalized.includes('blessure')?'injury':normalized.includes('twijfel')?'doubt':normalized.includes('nietbeschikbaar')?'unavailable':normalized.includes('beschikbaar')?'available':'unknown';
      if(percentage===100)status='available';
      var reason=card.match(/<span class="hidden text-sm md:block">([\s\S]*?)<\/span>/), back=card.match(/Verw\. terugkeer\s*:[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/);
      if(seen[href[1]])throw Error('Dubbele bronspeler');seen[href[1]]=true;
      records.push({Source_Player_Name:avText(name[1]),Source_Club:club,Source_Status:original+' / '+label,Availability_Percentage:percentage===null?'':percentage,Reason:reason?avText(reason[1]).replace(/^-\s*/,''):'',Expected_Return:back?avDate(avText(back[1])):'',Source_Updated_At:'',Source_URL:'https://www.blessuresenschorsingen.nl'+href[1],Status_Type:status});
    });
  });
  if(clubs.length!==18||new Set(clubs).size!==18||records.length<20||records.length>650)throw Error('Onvolledige clubdekking');
  return records;
}
function avMatch(row,players,season,manual) {
  var candidates=players.filter(function(p){return p.season===season&&avClub(p.club)===avClub(row.Source_Club);});
  if(manual){var chosen=candidates.filter(function(p){return String(p.id)===String(manual);});return chosen.length===1?{player:chosen[0],method:'manual'}:{player:null,method:'unmatched'};}
  var exact=candidates.filter(function(p){return avName(p.name)===avName(row.Source_Player_Name);});
  if(exact.length)return {player:exact.length===1?exact[0]:null,method:exact.length===1?'exact':'ambiguous'};
  var aliases=candidates.filter(function(p){return (p.aliases||[]).some(function(a){return avName(a)===avName(row.Source_Player_Name);});});
  return {player:aliases.length===1?aliases[0]:null,method:aliases.length===1?'alias':aliases.length>1?'ambiguous':'unmatched'};
}
function avAddAliases(players, mappings, bootstrap, season) {
  return players.map(function(p){
    var links=mappings.filter(function(m){return m.season===season&&String(m.playerId)===String(p.id);}), ids=Array.from(new Set(links.map(function(m){return String(m.espnPlayerId);}))), aliases=(p.aliases||[]).slice();
    ids.forEach(function(id){
      if(new Set(mappings.filter(function(m){return m.season===season&&String(m.espnPlayerId)===id;}).map(function(m){return String(m.playerId);})).size!==1)return;
      var e=bootstrap.elements.find(function(e){return String(e.id)===id;}), t=e&&bootstrap.teams.find(function(t){return t.id===e.team;});
      if(e&&t&&avClub(t.name)===avClub(p.club))aliases.push([e.first_name,e.second_name].filter(Boolean).join(' '));
    });
    return Object.assign({},p,{aliases:aliases});
  });
}
function avExplicitAliases(players, aliases) {
  return players.map(function(p){return Object.assign({},p,{aliases:(p.aliases||[]).concat(aliases.filter(function(a){return a.season===p.season&&a.playerId===String(p.id)&&avClub(a.sourceClub)===avClub(p.club)&&avName(a.playerName)===avName(p.name);}).map(function(a){return a.sourceName;}))});});
}
function avPlan(source, previous, players, season, now, hash) {
  if(!/^\d{4}\/\d{4}$/.test(season)||!source.length)throw Error('Seizoen of bron ontbreekt');
  var lastSeen=previous.filter(function(r){return r.Season===season;}).map(function(r){return r.Last_Seen_At||'';}).sort().pop();
  var active=previous.filter(function(r){return r.Season===season&&r.Last_Seen_At===lastSeen&&String(r.Active).toLowerCase()==='true';});
  if(active.length&&source.length<active.length*.8)throw Error('Bron verdacht gekrompen; bestaande status behouden');
  var rows=previous.map(function(r){return Object.assign({},r);}), counts={exact:0,alias:0,manual:0,unmatched:0,ambiguous:0}, changes=[];
  source.forEach(function(s){
    var indexes=[];rows.forEach(function(r,i){if(r.Season===season&&r.Source_URL===s.Source_URL&&String(r.Active).toLowerCase()==='true')indexes.push(i);});
    if(indexes.length>1)throw Error('Dubbele actuele Sheet-status');
    var index=indexes.length?indexes[0]:-1, old=index<0?{}:rows[index], match=avMatch(s,players,season,old.Match_Status==='manual'?old.Fantasy_Player_ID:null);
    counts[match.method]++;
    var next=Object.assign({},s,{Season:season,Fantasy_Player_ID:match.player?String(match.player.id):'',Fantasy_Player_Name:match.player?match.player.name:'',Fantasy_Club:match.player?match.player.club:'',Match_Status:match.method,Active:true,First_Seen_At:old.First_Seen_At||now,Last_Seen_At:now,Last_Synced_At:now,Notes:old.Notes||''});
    next.Source_Hash=hash(JSON.stringify(AV_HEADERS.filter(function(k){return !['First_Seen_At','Last_Seen_At','Last_Synced_At','Source_Hash','Notes','Active'].includes(k);}).map(function(k){return next[k];})));
    if(index<0){rows.push(next);changes.push(rows.length-1);}else if(old.Source_Hash!==next.Source_Hash){rows[index].Active=false;changes.push(index);rows.push(next);changes.push(rows.length-1);}else{rows[index]=next;}
  });
  // Missing cards remain active and retain their previous observation time; never infer fitness.
  return {rows:rows,changes:changes,counts:counts};
}

```

### PlayerAvailabilityAliases.gs

```javascript
/* Explicit identities reviewed 2026-10-24. Exact full-name / club ESPN evidence; no fuzzy runtime matching. */
var AV_EXPLICIT_ALIASES = [
  {
    "sourceName": "Donát Bárány",
    "sourceClub": "ADO Den Haag",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/donat-barany-4104",
    "season": "2026/2027",
    "playerId": "20260481",
    "playerName": "Barány",
    "espnId": 483,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Simon Adingra",
    "sourceClub": "Ajax",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/simon-adingra-4189",
    "season": "2026/2027",
    "playerId": "20260548",
    "playerName": "Adingra",
    "espnId": 571,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Oliver Edvardsen",
    "sourceClub": "Ajax",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/oliver-edvardsen-3735",
    "season": "2026/2027",
    "playerId": "20260319",
    "playerName": "Edvardsen",
    "espnId": 44,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Stije Resink",
    "sourceClub": "AZ",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/stije-resink-3240",
    "season": "2026/2027",
    "playerId": "20260248",
    "playerName": "Resink",
    "espnId": 118,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Tyrique Mercera",
    "sourceClub": "FC Groningen",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/tyrique-mercera-3843",
    "season": "2026/2027",
    "playerId": "20260125",
    "playerName": "Mercera",
    "espnId": 116,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Victor Jensen",
    "sourceClub": "FC Utrecht",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/victor-jensen-2665",
    "season": "2026/2027",
    "playerId": "20260293",
    "playerName": "Jensen",
    "espnId": 180,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Miliano Jonathans",
    "sourceClub": "FC Utrecht",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/miliano-jonathans-2908",
    "season": "2026/2027",
    "playerId": "20260309",
    "playerName": "Jonathans",
    "espnId": 195,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Marius Broholm",
    "sourceClub": "FC Utrecht",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/marius-broholm-4166",
    "season": "2026/2027",
    "playerId": "20260539",
    "playerName": "Broholm",
    "espnId": 545,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Gijs Smal",
    "sourceClub": "Feyenoord",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/gijs-smal-2528",
    "season": "2026/2027",
    "playerId": "20260121",
    "playerName": "Smal",
    "espnId": 209,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Reiss Nelson",
    "sourceClub": "Feyenoord",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/reiss-nelson-4186",
    "season": "2026/2027",
    "playerId": "20260558",
    "playerName": "Nelson",
    "espnId": 572,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Jakub Moder",
    "sourceClub": "Feyenoord",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/jakub-moder-3728",
    "season": "2026/2027",
    "playerId": "20260315",
    "playerName": "Moder",
    "espnId": 216,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Ivan Márquez",
    "sourceClub": "Fortuna Sittard",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/ivan-marquez-2802",
    "season": "2026/2027",
    "playerId": "20260104",
    "playerName": "Márquez",
    "espnId": 248,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Ramazan Bayram",
    "sourceClub": "Fortuna Sittard",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/ramazan-bayram-3495",
    "season": "2026/2027",
    "playerId": "20260038",
    "playerName": "Bayram",
    "espnId": 243,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Rodrigo Guth",
    "sourceClub": "Fortuna Sittard",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/rodrigo-guth-2801",
    "season": "2026/2027",
    "playerId": "20260537",
    "playerName": "Guth",
    "espnId": 543,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Pim Saathof",
    "sourceClub": "Go Ahead Eagles",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/pim-saathof-3086",
    "season": "2026/2027",
    "playerId": "20260178",
    "playerName": "Saathof",
    "espnId": 267,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Emre Mor",
    "sourceClub": "N.E.C. Nijmegen",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/emre-mor-4118",
    "season": "2026/2027",
    "playerId": "20260480",
    "playerName": "Mor",
    "espnId": 491,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Yassin Moslih",
    "sourceClub": "N.E.C. Nijmegen",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/yassin-moslih-3898",
    "season": "2026/2027",
    "playerId": "20260511",
    "playerName": "Moslih",
    "espnId": 512,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Filip Krastev",
    "sourceClub": "PEC Zwolle",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/filip-krastev-2835",
    "season": "2026/2027",
    "playerId": "20260564",
    "playerName": "Krastev",
    "espnId": 573,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Jerdy Schouten",
    "sourceClub": "PSV",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/jerdy-schouten-1733",
    "season": "2026/2027",
    "playerId": "20260269",
    "playerName": "Schouten",
    "espnId": 349,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Adamo Nagalo",
    "sourceClub": "PSV",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/adamo-nagalo-3685",
    "season": "2026/2027",
    "playerId": "20260183",
    "playerName": "Nagalo",
    "espnId": 343,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Jasper Meijster",
    "sourceClub": "SC Cambuur",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/jasper-meijster-4039",
    "season": "2026/2027",
    "playerId": "20260052",
    "playerName": "Meijster",
    "espnId": 365,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Devid Eugene Bouah",
    "sourceClub": "SC Cambuur",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/devid-eugene-bouah-4162",
    "season": "2026/2027",
    "playerId": "20260542",
    "playerName": "Bouah",
    "espnId": 542,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Wout Asselman",
    "sourceClub": "SC Cambuur",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/wout-asselman-4195",
    "season": "2026/2027",
    "playerId": "20260582",
    "playerName": "Asselman",
    "espnId": 581,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Daan Visser",
    "sourceClub": "SC Cambuur",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/daan-visser-4049",
    "season": "2026/2027",
    "playerId": "20260412",
    "playerName": "Visser",
    "espnId": 376,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Amine Lachkar",
    "sourceClub": "Willem II",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/amine-lachkar-3506",
    "season": "2026/2027",
    "playerId": "20260419",
    "playerName": "Lachkar",
    "espnId": 465,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Armin Culum",
    "sourceClub": "Willem II",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/armin-culum-4072",
    "season": "2026/2027",
    "playerId": "20260424",
    "playerName": "Culum",
    "espnId": 470,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  },
  {
    "sourceName": "Thijs Muller",
    "sourceClub": "Willem II",
    "sourceUrl": "https://www.blessuresenschorsingen.nl/thijs-muller-4181",
    "season": "2026/2027",
    "playerId": "20260585",
    "playerName": "Muller",
    "espnId": 560,
    "evidence": "Exact full name + club in ESPN; exact web/second name + club in Studio; unique in season"
  }
];

```

### PlayerAvailabilitySync.gs

```javascript
/* Bound to Database 2025/2026. Install alongside PlayerAvailabilityCore.gs.
 * Also install PlayerAvailabilityAliases.gs. No trigger is created automatically.
 * AVAILABILITY_SEASON must be explicitly set.
 * The existing Spelers and ELITE_PLAYER_STATS tabs are read-only here.
 */
function avReadSheet_(sheet) {
  if(!sheet)throw Error('Vereist tabblad ontbreekt');
  var grid=sheet.getDataRange().getDisplayValues(), headers=grid.shift();
  return grid.filter(function(r){return r.some(Boolean);}).map(function(r){var o={};headers.forEach(function(h,i){o[h]=r[i]||'';});return o;});
}
function setupPlayerAvailability() {
  var sheet=SpreadsheetApp.getActive().getSheets().find(function(s){return s.getSheetId()===847908298;});
  if(!sheet||sheet.getName()!=='PLAYER_AVAILABILITY')throw Error('Controleer PLAYER_AVAILABILITY gid 847908298');
  if(sheet.getLastRow()>0&&JSON.stringify(sheet.getRange(1,1,1,AV_HEADERS.length).getDisplayValues()[0])!==JSON.stringify(AV_HEADERS))throw Error('Bestaande headers wijken af; geen automatische conversie');
  sheet.getRange(1,1,1,AV_HEADERS.length).setValues([AV_HEADERS]).setFontWeight('bold');sheet.setFrozenRows(1);
}
function syncPlayerAvailability() {
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    var props=PropertiesService.getScriptProperties(), season=props.getProperty('AVAILABILITY_SEASON');
    var lastAttempt=Number(props.getProperty('AVAILABILITY_LAST_ATTEMPT')||0);
    if(Date.now()-lastAttempt<3600000)return {skipped:'hourly-limit'};
    if(!/^\d{4}\/\d{4}$/.test(season||''))throw Error('Stel AVAILABILITY_SEASON expliciet in');
    var ss=SpreadsheetApp.getActive(), sheet=ss.getSheetByName('PLAYER_AVAILABILITY');
    if(!sheet||sheet.getSheetId()!==847908298||JSON.stringify(sheet.getRange(1,1,1,AV_HEADERS.length).getDisplayValues()[0])!==JSON.stringify(AV_HEADERS))throw Error('Controleer availability-tab en headers');
    var players=avReadSheet_(ss.getSheetByName('Spelers')).map(function(r){return {id:r.PlayerID||r['Speler ID']||r.Speler_ID||r.ID,name:r.Speler||r.Naam,club:r.Club,season:String(r.Seizoen).replace('-','/')};}).filter(function(p){return p.season===season;});
    if(!players.length)throw Error('Geen spelers voor dit seizoen');
    var mappings=avReadSheet_(ss.getSheetByName('ELITE_PLAYER_STATS')).map(function(r){return {season:String(r.Seizoen).replace('-','/'),playerId:r.SpelerID,espnPlayerId:r.ESPNPlayerId};});
    // One existing structured identity endpoint; no per-player requests.
    props.setProperty('AVAILABILITY_LAST_ATTEMPT',String(Date.now()));
    var espn=UrlFetchApp.fetch('https://fantasy.espngoal.nl/api/bootstrap-static/',{muteHttpExceptions:true,followRedirects:false});
    if(espn.getResponseCode()!==200)throw Error('Aliasbron onbereikbaar; vorige status behouden');
    players=avExplicitAliases(avAddAliases(players,mappings,JSON.parse(espn.getContentText()),season),AV_EXPLICIT_ALIASES);
    var response=UrlFetchApp.fetch('https://www.blessuresenschorsingen.nl/',{muteHttpExceptions:true,followRedirects:false});
    if(response.getResponseCode()!==200)throw Error('Availability-bron onbereikbaar; vorige status behouden');
    var source=avParse(response.getContentText(),Array.from(new Set(players.map(function(p){return p.club;})))), previous=avReadSheet_(sheet), now=new Date().toISOString();
    var hash=function(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');};
    var plan=avPlan(source,previous,players,season,now,hash);
    // History stays in this Sheet. Persist only changed rows + observation columns.
    plan.rows.forEach(function(row,i){
      if(i>=previous.length||plan.changes.indexOf(i)>=0){sheet.getRange(i+2,1,1,AV_HEADERS.length).setNumberFormat('@').setValues([AV_HEADERS.map(function(k){var v=row[k]===undefined?'':String(row[k]);return /^[=+@-]/.test(v)?"'"+v:v;})]);}
      else if(row.Last_Seen_At!==previous[i].Last_Seen_At){sheet.getRange(i+2,15,1,2).setValues([[row.Last_Seen_At,row.Last_Synced_At]]);}
    });
    SpreadsheetApp.flush();
    props.setProperty('AVAILABILITY_LAST_SUCCESS',JSON.stringify({at:now,count:source.length,matches:plan.counts}));
    return plan.counts;
  } finally {lock.releaseLock();}
}
// One manual entry point. No trigger, backend request or Supabase write.
function testPlayerAvailabilityPilot() {
  var props=PropertiesService.getScriptProperties(), season=props.getProperty('AVAILABILITY_SEASON');
  if(season&&season!=='2026/2027')throw Error('Pilot verwacht seizoen 2026/2027; bestaande instelling blijft behouden');
  if(!season)props.setProperty('AVAILABILITY_SEASON','2026/2027');
  setupPlayerAvailability();
  console.log('AV_PILOT_START season=2026/2027 trigger=not-created backend=not-called');
  var result=syncPlayerAvailability();
  if(!result||result.skipped){
    console.log('AV_PILOT_WAIT '+(result&&result.skipped||'script-lock')+'; wacht tot minstens 60 minuten na de vorige poging');
    return {status:'WAIT',reason:result&&result.skipped||'script-lock'};
  }
  var success=JSON.parse(props.getProperty('AVAILABILITY_LAST_SUCCESS'));
  var rows=avReadSheet_(SpreadsheetApp.getActive().getSheetByName('PLAYER_AVAILABILITY'));
  var observed=rows.filter(function(r){return String(r.Active).toLowerCase()==='true'&&r.Last_Seen_At===success.at;});
  if(observed.length!==success.count)throw Error('Pilot read-back wijkt af van de bron; controleer tabblad, niet opnieuw binnen het uur ophalen');
  var matched=(result.exact||0)+(result.alias||0)+(result.manual||0);
  console.log('AV_PILOT_SOURCE players='+success.count+' observed_at='+success.at);
  console.log('AV_PILOT_MATCH matched='+matched+' unmatched='+(result.unmatched||0)+' ambiguous='+(result.ambiguous||0));
  console.log('AV_PILOT_SHEET readback='+observed.length+' total_rows='+rows.length+' columns='+AV_HEADERS.length);
  observed.filter(function(r){return ['unmatched','ambiguous'].indexOf(r.Match_Status)>=0;}).forEach(function(r){console.log('AV_PILOT_REVIEW '+r.Source_Player_Name+' | '+r.Source_Club+' | '+r.Match_Status);});
  console.log('AV_PILOT_PASS sheet-only; no trigger; no backend; no deployment');
  return {status:'PASS',source:success.count,matched:matched,unmatched:result.unmatched||0,ambiguous:result.ambiguous||0,rows:rows.length};
}

```