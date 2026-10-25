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
