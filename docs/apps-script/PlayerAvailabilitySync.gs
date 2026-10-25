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
