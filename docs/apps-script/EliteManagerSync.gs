/**
 * Fantasy Studio - Elite Manager Intelligence
 * Copy-paste dit bestand als EliteManagerSync.gs in hetzelfde Apps Script-project
 * als EspnSync.gs. Voer initializeEliteManagerIntelligence() eenmaal handmatig uit.
 */
const ELITE = Object.freeze({
  season: '2026/2027', leagueId: 292, maximumManagers: 1000,
  cohorts: [1, 5, 10, 25, 50, 100, 250, 500, 1000], pageSize: 50,
  batchSize: 75, attempts: 3, continuationDelayMs: 60000,
  baseUrl: 'https://fantasy.espngoal.nl/api',
  sheets: {
    managers: 'ELITE_MANAGERS', snapshots: 'ELITE_TEAM_SNAPSHOTS',
    stats: 'ELITE_PLAYER_STATS', transfers: 'ELITE_TRANSFERS',
    control: 'ELITE_SYNC_CONTROLE', meta: 'ELITE_META', chipUsage: 'CHIP_GEBRUIK', formations: 'ELITE_FORMATIONS', clubExposure: 'ELITE_CLUB_EXPOSURE'
  }
})

const ELITE_HEADERS = Object.freeze({
  ELITE_MANAGERS: ['Seizoen','Gameweek','SnapshotDatum','LeagueId','CohortMax','EntryId','StandingIndex','Rank','RankSort','LastRank','Teamnaam','Managernaam','ManagerDisplayName','TotalPoints','EventPoints','HasPlayed','ActiveChip','FetchStatus'],
  ELITE_TEAM_SNAPSHOTS: ['Seizoen','Gameweek','SnapshotDatum','EntryId','StandingIndex','Rank','ESPNPlayerId','FantasyStudioPlayerId','SquadPosition','IsStarter','IsBench','Multiplier','IsCaptain','IsViceCaptain'],
  ELITE_PLAYER_STATS: ['Seizoen','Gameweek','Cohort','SpelerID','ESPNPlayerId','RequestedTeams','ValidTeams','CoveragePct','SelectedCount','SelectedPct','StarterCount','StarterPct','StarterPctAmongOwners','BenchCount','BenchPct','BenchPctAmongOwners','CaptainCount','CaptainPct','CaptainPctAmongOwners','ViceCount','VicePct','VicePctAmongOwners','MarketSelectedPct','EliteGapPctPoints','EliteSelectionRank','CaptainRank','TemplateScore'],
  ELITE_TRANSFERS: ['Seizoen','Gameweek','Cohort','SpelerID','PreviousCohortManagers','CurrentCohortManagers','ComparisonManagers','BoughtCount','BoughtPct','SoldCount','SoldPct','HeldCount','OwnerRetentionPct','NetTransfers','OwnershipMovement'],
  ELITE_SYNC_CONTROLE: ['Timestamp','Seizoen','Gameweek','Status','Fase','RequestedManagers','FoundManagers','SuccessfulTeams','FailedTeams','CoveragePct','UnmatchedPlayers','ElapsedSeconds','Message'],
  ELITE_META: ['Sleutel','Waarde','BijgewerktOp'],
  CHIP_GEBRUIK: ['Seizoen','Speelronde','Status','ChipCode','Chip','Groep','Managers','ChipAantal','ChipPercentage','Bron','BijgewerktOp'],
  CHIP_DYNAMISCH_DUO: ['Speelronde','Status','#1 aantal','#1 %','Top 5 aantal','Top 5 %','Top 10 aantal','Top 10 %','Top 25 aantal','Top 25 %','Top 50 aantal','Top 50 %','Top 100 aantal','Top 100 %','Top 250 aantal','Top 250 %','Top 500 aantal','Top 500 %','Top 1000 aantal','Top 1000 %','Hele spel aantal','Hele spel %','Bijgewerkt op'],
  CHIP_AANVALLUH: ['Speelronde','Status','#1 aantal','#1 %','Top 5 aantal','Top 5 %','Top 10 aantal','Top 10 %','Top 25 aantal','Top 25 %','Top 50 aantal','Top 50 %','Top 100 aantal','Top 100 %','Top 250 aantal','Top 250 %','Top 500 aantal','Top 500 %','Top 1000 aantal','Top 1000 %','Hele spel aantal','Hele spel %','Bijgewerkt op'],
  CHIP_SUIKEROOM: ['Speelronde','Status','#1 aantal','#1 %','Top 5 aantal','Top 5 %','Top 10 aantal','Top 10 %','Top 25 aantal','Top 25 %','Top 50 aantal','Top 50 %','Top 100 aantal','Top 100 %','Top 250 aantal','Top 250 %','Top 500 aantal','Top 500 %','Top 1000 aantal','Top 1000 %','Hele spel aantal','Hele spel %','Bijgewerkt op'],
  CHIP_WILDCARD: ['Speelronde','Status','#1 aantal','#1 %','Top 5 aantal','Top 5 %','Top 10 aantal','Top 10 %','Top 25 aantal','Top 25 %','Top 50 aantal','Top 50 %','Top 100 aantal','Top 100 %','Top 250 aantal','Top 250 %','Top 500 aantal','Top 500 %','Top 1000 aantal','Top 1000 %','Hele spel aantal','Hele spel %','Bijgewerkt op']
  ,ELITE_FORMATIONS: ['Seizoen','Gameweek','Cohort','ValidTeams','Formation','FormationCount','FormationPct']
  ,ELITE_CLUB_EXPOSURE: ['Seizoen','Gameweek','Cohort','Club','ValidTeams','AverageSquadPlayers','TeamsWith1Count','TeamsWith1Pct','TeamsWith2Count','TeamsWith2Pct','TeamsWith3Count','TeamsWith3Pct','AverageStarters']
})

function initializeEliteManagerIntelligence() {
  elitePrepare_()
  eliteSetMeta_('config', JSON.stringify(ELITE))
  SpreadsheetApp.getUi().alert('Elite-tabbladen zijn aangemaakt. Start nu “Topmanagers: nieuwste locked ronde”.')
}

function onOpenEliteManagerMenu() {
  SpreadsheetApp.getUi().createMenu('Topmanagers')
    .addItem('Initialiseren', 'initializeEliteManagerIntelligence')
    .addItem('Nieuwste locked ronde synchroniseren', 'syncLatestAvailableEliteRound')
    .addItem('Huidige ronde hervatten', 'continueEliteManagerSync')
    .addToUi()
}

function installEliteManagerAutomaticTrigger() {
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'syncLatestAvailableEliteRound').forEach(trigger => ScriptApp.deleteTrigger(trigger))
  ScriptApp.newTrigger('syncLatestAvailableEliteRound').timeBased().everyHours(6).create()
  eliteSetMeta_('automaticTrigger', 'Iedere 6 uur; reeds voltooide locked ronde wordt overgeslagen')
}

function syncLatestAvailableEliteRound() {
  elitePrepare_()
  const gameweek = findLatestPublicEliteRound_()
  if (!gameweek) return eliteLog_('', 'GEEN_LOCKED_RONDE', 'detectie', 0, 0, 0, 0, 0, 'Geen publiek beschikbare picks-ronde gevonden.')
  const completed = Number(eliteGetMeta_('completedGameweek') || 0)
  if (completed === gameweek && eliteGetMeta_('completedSeason') === ELITE.season) {
    return eliteLog_(gameweek, 'OVERGESLAGEN', 'gereed', ELITE.maximumManagers, ELITE.maximumManagers, ELITE.maximumManagers, 0, 0, 'Deze locked ronde is al volledig verwerkt.')
  }
  return syncEliteManagerRound(gameweek)
}

function findLatestPublicEliteRound_() {
  const bootstrap = eliteFetchJson_(`${ELITE.baseUrl}/bootstrap-static/`)
  const events = (bootstrap && bootstrap.events || []).filter(event => Number(event.id) > 0 && (event.is_current || event.finished || event.deadline_time && new Date(event.deadline_time).getTime() <= Date.now())).sort((a,b) => Number(b.id)-Number(a.id))
  const probeEntry = eliteFetchStandings_()[0]
  if (!probeEntry) return null
  for (let i = 0; i < events.length; i += 1) {
    const response = UrlFetchApp.fetch(`${ELITE.baseUrl}/entry/${probeEntry.entry}/event/${events[i].id}/picks/`, { muteHttpExceptions: true })
    if (response.getResponseCode() === 200) {
      const payload = JSON.parse(response.getContentText() || '{}')
      if (Array.isArray(payload.picks) && payload.picks.length) return Number(events[i].id)
    }
  }
  return null
}

function syncEliteManagerRound(gameweek) {
  const round = Number(gameweek)
  if (!round) throw new Error('Een geldige gameweek is verplicht.')
  elitePrepare_()
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) throw new Error('Er draait al een elite-sync.')
  try {
    const standings = eliteFetchStandings_()
    const state = { season: ELITE.season, gameweek: round, offset: 0, startedAt: Date.now(), standings: standings }
    PropertiesService.getScriptProperties().setProperty('ELITE_PROGRESS', JSON.stringify(state))
    eliteReplaceRoundRows_(ELITE.sheets.managers, round, standings.map(manager => eliteManagerRow_(manager, round, 'PENDING')))
    eliteReplaceRoundRows_(ELITE.sheets.snapshots, round, [])
    return eliteContinue_(state)
  } finally { lock.releaseLock() }
}

function continueEliteManagerSync() {
  const raw = PropertiesService.getScriptProperties().getProperty('ELITE_PROGRESS')
  if (!raw) return syncLatestAvailableEliteRound()
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) return
  try { return eliteContinue_(JSON.parse(raw)) } finally { lock.releaseLock() }
}

function eliteContinue_(state) {
  const start = state.offset || 0
  const managers = state.standings.slice(start, start + ELITE.batchSize)
  if (!managers.length) return eliteFinalize_(state)
  const responses = eliteFetchPicksBatch_(managers, state.gameweek)
  const snapshotRows = []; const managerResults = []; const unmatchedIds = new Set(); let successful = 0; let failed = 0; let unmatched = 0
  responses.forEach((result, index) => {
    const manager = managers[index]
    if (!result || !Array.isArray(result.picks) || !result.picks.length) { failed += 1; managerResults.push({ manager: manager, chip: '', status: 'FAILED' }); return }
    successful += 1
    managerResults.push({ manager: manager, chip: String(result.active_chip || 'none'), status: 'SUCCESS' })
    result.picks.forEach(pick => {
      const studioId = eliteMapPlayerId_(pick.element)
      if (!studioId) { unmatched += 1; unmatchedIds.add(String(pick.element)) }
      snapshotRows.push([ELITE.season,state.gameweek,new Date(),String(manager.entry),manager.standingIndex,manager.rank,String(pick.element),studioId || '',Number(pick.position)||'',Number(pick.multiplier)>0,Number(pick.multiplier)===0,Number(pick.multiplier)||0,Boolean(pick.is_captain),Boolean(pick.is_vice_captain)])
    })
  })
  eliteAppendRows_(ELITE.sheets.snapshots, snapshotRows)
  eliteUpdateManagerResults_(state.gameweek, managerResults)
  state.offset = start + managers.length
  state.successful = (state.successful || 0) + successful
  state.failed = (state.failed || 0) + failed
  state.unmatched = (state.unmatched || 0) + unmatched
  state.unmatchedIds = [...new Set((state.unmatchedIds || []).concat([...unmatchedIds]))]
  PropertiesService.getScriptProperties().setProperty('ELITE_PROGRESS', JSON.stringify(state))
  eliteLog_(state.gameweek, 'BEZIG', 'picks', ELITE.maximumManagers, state.standings.length, state.successful, state.failed, state.unmatched, `Managers ${start + 1}-${state.offset} verwerkt.`)
  if (state.offset >= state.standings.length) return eliteFinalize_(state)
  eliteScheduleContinuation_()
}

function eliteFinalize_(state) {
  aggregateElitePlayerStats(state.gameweek)
  calculateEliteTransfers(state.gameweek)
  aggregateEliteTeamStructure(state.gameweek)
  syncChipUsage(state.gameweek)
  const coverage = state.standings.length ? (state.successful || 0) / state.standings.length * 100 : 0
  const acceptable = coverage >= 90
  eliteLog_(state.gameweek, acceptable ? 'VOLTOOID' : 'ONVOLLEDIG', 'gereed', ELITE.maximumManagers, state.standings.length, state.successful || 0, state.failed || 0, state.unmatched || 0, `Dekking ${coverage.toFixed(1)}%. Unmatched: ${(state.unmatchedIds||[]).length} unieke ESPN-spelers in ${state.unmatched||0} snapshotregels; deze regels blijven raw bewaard maar tellen niet mee in speler-, formatie- en clubaggregaties.`)
  if (acceptable) { eliteSetMeta_('completedSeason', ELITE.season); eliteSetMeta_('completedGameweek', state.gameweek) }
  PropertiesService.getScriptProperties().deleteProperty('ELITE_PROGRESS')
  eliteDeleteContinuationTriggers_()
}

function aggregateElitePlayerStats(gameweek) {
  const managers = eliteReadRoundObjects_(ELITE.sheets.managers, gameweek)
  const snapshots = eliteReadRoundObjects_(ELITE.sheets.snapshots, gameweek)
  const market = eliteMarketByPlayerId_(); const rows = []
  ELITE.cohorts.forEach(cohort => {
    const selectedManagers = eliteExactCohort_(managers, cohort); const allowed = new Set(selectedManagers.map(x => String(x.EntryId)))
    const validEntries = new Set(snapshots.filter(x => allowed.has(String(x.EntryId))).map(x => String(x.EntryId)))
    const counters = {}
    snapshots.forEach(pick => {
      if (!allowed.has(String(pick.EntryId)) || !pick.FantasyStudioPlayerId) return
      const id = String(pick.FantasyStudioPlayerId); const item = counters[id] || (counters[id] = {selected:0,starter:0,bench:0,captain:0,vice:0,espn:pick.ESPNPlayerId})
      item.selected += 1; item.starter += eliteBool_(pick.IsStarter)?1:0; item.bench += eliteBool_(pick.IsBench)?1:0; item.captain += eliteBool_(pick.IsCaptain)?1:0; item.vice += eliteBool_(pick.IsViceCaptain)?1:0
    })
    const valid = validEntries.size; const ranked = Object.keys(counters).sort((a,b)=>counters[b].selected-counters[a].selected||a.localeCompare(b)); const captainRanked = Object.keys(counters).sort((a,b)=>counters[b].captain-counters[a].captain||a.localeCompare(b))
    ranked.forEach((id,index) => { const c=counters[id], pct=n=>valid?n/valid*100:'', owners=n=>c.selected?n/c.selected*100:'', marketPct=market[id]; const selectedPct=pct(c.selected); const template=valid?Math.min(100,selectedPct*.55+pct(c.starter)*.3+pct(c.captain)*.15):''; rows.push([ELITE.season,gameweek,cohort,id,c.espn,cohort,valid,cohort?valid/cohort*100:'',c.selected,selectedPct,c.starter,pct(c.starter),owners(c.starter),c.bench,pct(c.bench),owners(c.bench),c.captain,pct(c.captain),owners(c.captain),c.vice,pct(c.vice),owners(c.vice),marketPct===undefined?'':marketPct,marketPct===undefined?'':selectedPct-marketPct,index+1,captainRanked.indexOf(id)+1,template]) })
  })
  eliteReplaceRoundRows_(ELITE.sheets.stats, gameweek, rows)
}

function calculateEliteTransfers(gameweek) {
  const currentRound=Number(gameweek), previousRound=currentRound-1
  if (previousRound < 1) return eliteReplaceRoundRows_(ELITE.sheets.transfers,currentRound,[])
  const prevManagers=eliteReadRoundObjects_(ELITE.sheets.managers,previousRound), currManagers=eliteReadRoundObjects_(ELITE.sheets.managers,currentRound), prevPicks=eliteReadRoundObjects_(ELITE.sheets.snapshots,previousRound), currPicks=eliteReadRoundObjects_(ELITE.sheets.snapshots,currentRound), rows=[]
  const squads = picks => { const result={}; picks.forEach(p=>{if(!p.FantasyStudioPlayerId)return;(result[p.EntryId]||(result[p.EntryId]=new Set())).add(String(p.FantasyStudioPlayerId))});return result }, before=squads(prevPicks),after=squads(currPicks)
  ELITE.cohorts.forEach(cohort=>{const previous=eliteExactCohort_(prevManagers,cohort),current=eliteExactCohort_(currManagers,cohort),oldIds=new Set(previous.map(x=>String(x.EntryId))),newIds=new Set(current.map(x=>String(x.EntryId))),common=[...oldIds].filter(id=>newIds.has(id)),counts={};common.forEach(entry=>{const old=before[entry]||new Set(),now=after[entry]||new Set();new Set([...old,...now]).forEach(id=>{const c=counts[id]||(counts[id]={bought:0,sold:0,held:0});if(!old.has(id)&&now.has(id))c.bought++;if(old.has(id)&&!now.has(id))c.sold++;if(old.has(id)&&now.has(id))c.held++})});Object.keys(counts).forEach(id=>{const c=counts[id],den=common.length;const previousOwners=prevPicks.filter(p=>oldIds.has(String(p.EntryId))&&String(p.FantasyStudioPlayerId)===id).length,currentOwners=currPicks.filter(p=>newIds.has(String(p.EntryId))&&String(p.FantasyStudioPlayerId)===id).length;rows.push([ELITE.season,currentRound,cohort,id,oldIds.size,newIds.size,den,c.bought,den?c.bought/den*100:'',c.sold,den?c.sold/den*100:'',c.held,c.held+c.sold?c.held/(c.held+c.sold)*100:'',c.bought-c.sold,currentOwners-previousOwners])})})
  eliteReplaceRoundRows_(ELITE.sheets.transfers,currentRound,rows)
}

function aggregateEliteTeamStructure(gameweek){const managers=eliteReadRoundObjects_(ELITE.sheets.managers,gameweek),snapshots=eliteReadRoundObjects_(ELITE.sheets.snapshots,gameweek),meta=eliteStudioPlayerMeta_(),formationRows=[],clubRows=[];ELITE.cohorts.forEach(cohort=>{const selected=eliteExactCohort_(managers,cohort),entries=new Set(selected.map(manager=>String(manager.EntryId))),byEntry={};snapshots.forEach(pick=>{const entry=String(pick.EntryId);if(!entries.has(entry)||!pick.FantasyStudioPlayerId)return;(byEntry[entry]||(byEntry[entry]=[])).push(pick)});const validEntries=Object.keys(byEntry).filter(entry=>byEntry[entry].length>=15),formations={},clubs={};validEntries.forEach(entry=>{const picks=byEntry[entry],starters=picks.filter(pick=>eliteBool_(pick.IsStarter)),counts={keeper:0,verdediger:0,middenvelder:0,aanvaller:0};starters.forEach(pick=>{const player=meta[String(pick.FantasyStudioPlayerId)];if(player)counts[player.position]=(counts[player.position]||0)+1});if(starters.length===11&&counts.keeper===1&&counts.verdediger>=3&&counts.verdediger<=5&&counts.middenvelder>=2&&counts.middenvelder<=5&&counts.aanvaller>=1&&counts.aanvaller<=3){const formation=`${counts.verdediger}-${counts.middenvelder}-${counts.aanvaller}`;formations[formation]=(formations[formation]||0)+1}const squadClub={},starterClub={};picks.forEach(pick=>{const player=meta[String(pick.FantasyStudioPlayerId)];if(!player||!player.club)return;squadClub[player.club]=(squadClub[player.club]||0)+1;if(eliteBool_(pick.IsStarter))starterClub[player.club]=(starterClub[player.club]||0)+1});Object.keys(squadClub).forEach(club=>{const item=clubs[club]||(clubs[club]={squad:0,starters:0,one:0,two:0,three:0});item.squad+=squadClub[club];item.starters+=starterClub[club]||0;item.one+=squadClub[club]>=1?1:0;item.two+=squadClub[club]>=2?1:0;item.three+=squadClub[club]>=3?1:0})});const valid=validEntries.length;Object.keys(formations).forEach(formation=>formationRows.push([ELITE.season,gameweek,cohort,valid,formation,formations[formation],valid?formations[formation]/valid*100:'']));Object.keys(clubs).forEach(club=>{const item=clubs[club];clubRows.push([ELITE.season,gameweek,cohort,club,valid,valid?item.squad/valid:'',item.one,valid?item.one/valid*100:'',item.two,valid?item.two/valid*100:'',item.three,valid?item.three/valid*100:'',valid?item.starters/valid:''])})});eliteReplaceRoundRows_(ELITE.sheets.formations,gameweek,formationRows);eliteReplaceRoundRows_(ELITE.sheets.clubExposure,gameweek,clubRows)}
function eliteStudioPlayerMeta_(){const sheet=SpreadsheetApp.getActive().getSheetByName('Spelers');if(!sheet)return{};const values=sheet.getDataRange().getValues(),headers=values.shift().map(String),id=eliteHeaderIndex_(headers,['PlayerID','Speler ID','Speler_ID','ID']),club=eliteHeaderIndex_(headers,['Club','Team']),position=eliteHeaderIndex_(headers,['Positie','Position']),result={};values.forEach(row=>{if(row[id]!=='')result[String(row[id])]={club:String(row[club]||''),position:eliteNormalizePosition_(row[position])}});return result}

const ELITE_CHIP_NAMES = Object.freeze({'2capt':'Dynamisch Duo',frush:'Aanvalluh!!',rich:'Suikeroom',wildcard:'Wildcard'})
const ELITE_CHIP_SHEETS = Object.freeze({'2capt':'CHIP_DYNAMISCH_DUO',frush:'CHIP_AANVALLUH',rich:'CHIP_SUIKEROOM',wildcard:'CHIP_WILDCARD'})
const ELITE_CHIP_GROUPS = Object.freeze([{label:'#1',size:1},{label:'Top 5',size:5},{label:'Top 10',size:10},{label:'Top 25',size:25},{label:'Top 50',size:50},{label:'Top 100',size:100},{label:'Top 250',size:250},{label:'Top 500',size:500},{label:'Top 1000',size:1000}])

function syncChipUsage(gameweek) {
  const bootstrap=eliteFetchJson_(`${ELITE.baseUrl}/bootstrap-static/`),events=bootstrap.events||[],rows=[],existing=eliteReadSeasonObjects_(ELITE.sheets.chipUsage),currentManagers=eliteGeneralRankingSize_()
  events.forEach(event=>{const round=Number(event.id);if(!round)return;const status=eliteEventStatus_(event),stored=existing.find(row=>Number(row.Speelronde)===round&&row.Groep==='Hele spel'&&Number(row.Managers)>0),denominator=status==='Definitief'?(stored?Number(stored.Managers):null):(currentManagers||stored&&Number(stored.Managers)||null),totals={};if(status==='Definitief'&&!denominator)console.warn(`CHIP_GEBRUIK SR${round}: geen betrouwbare historische algemene-rankingdenominator; percentage blijft leeg.`);if(status!=='Definitief'&&!denominator)console.warn(`CHIP_GEBRUIK SR${round}: actuele algemene-rankingdenominator kon niet betrouwbaar worden vastgesteld.`);(event.chip_plays||[]).forEach(play=>{const code=String(play.chip_name||'').toLowerCase();if(!code)return;totals[code]=(totals[code]||0)+(Number(play.num_played)||0)});Object.keys(totals).forEach(code=>rows.push(eliteChipRow_(round,status,code,'Hele spel',denominator,totals[code],'bootstrap+league-292')))} )
  const round=Number(gameweek),event=events.find(item=>Number(item.id)===round),status=eliteEventStatus_(event||{}),managers=eliteReadRoundObjects_(ELITE.sheets.managers,round)
  ELITE_CHIP_GROUPS.forEach(group=>{const cohort=eliteExactCohort_(managers,group.size);Object.keys(ELITE_CHIP_NAMES).concat(['none']).forEach(code=>{const count=cohort.filter(manager=>(String(manager.ActiveChip||'').toLowerCase()||'none')===code).length;rows.push(eliteChipRow_(round,status==='Definitief'?'Definitief':'Locked',code,group.label,cohort.length,count,'manager-picks'))})})
  eliteUpsertChipRows_(rows)
  writeChipPresentationSheets()
}

function syncGlobalChipUsage(){elitePrepare_();const latest=findLatestPublicEliteRound_();syncChipUsage(latest||1)}
function aggregateEliteChipUsage(gameweek){syncChipUsage(gameweek)}

function backfillEliteChipUsageForRound(gameweek){elitePrepare_();const managers=eliteReadRoundObjects_(ELITE.sheets.managers,gameweek);if(!managers.length)throw new Error(`Geen opgeslagen historische cohortset voor SR${gameweek}.`);const pending=managers.filter(manager=>String(manager.FetchStatus||'').toUpperCase()!=='SUCCESS'||!String(manager.ActiveChip||'').trim());for(let offset=0;offset<pending.length;offset+=ELITE.batchSize){const batch=pending.slice(offset,offset+ELITE.batchSize).map(manager=>({entry:manager.EntryId,standingIndex:manager.StandingIndex,rank:manager.Rank})),responses=eliteFetchPicksBatch_(batch,gameweek),results=batch.map((manager,index)=>({manager:manager,chip:responses[index]?String(responses[index].active_chip||'none'):'',status:responses[index]?'SUCCESS':'FAILED'}));eliteUpdateManagerResults_(gameweek,results)}syncChipUsage(gameweek);aggregateEliteTeamStructure(gameweek);if(Number(gameweek)>1)calculateEliteTransfers(gameweek)}
function backfillEliteChipUsageForStoredRounds(){elitePrepare_();const sheet=SpreadsheetApp.getActive().getSheetByName(ELITE.sheets.managers),values=sheet.getDataRange().getValues(),headers=values.shift().map(String),season=headers.indexOf('Seizoen'),round=headers.indexOf('Gameweek'),rounds=[...new Set(values.filter(row=>String(row[season])===ELITE.season).map(row=>Number(row[round])).filter(Boolean))].sort((a,b)=>a-b);rounds.forEach(gameweek=>backfillEliteChipUsageForRound(gameweek));rebuildEliteAggregatesForStoredRounds()}
function rebuildEliteAggregatesForStoredRounds(){elitePrepare_();const sheet=SpreadsheetApp.getActive().getSheetByName(ELITE.sheets.managers),values=sheet.getDataRange().getValues(),headers=values.shift().map(String),season=headers.indexOf('Seizoen'),round=headers.indexOf('Gameweek'),rounds=[...new Set(values.filter(row=>String(row[season])===ELITE.season).map(row=>Number(row[round])).filter(Boolean))].sort((a,b)=>a-b);rounds.forEach(gameweek=>{aggregateElitePlayerStats(gameweek);aggregateEliteTeamStructure(gameweek);if(gameweek>rounds[0])calculateEliteTransfers(gameweek)});writeChipPresentationSheets()}

function writeChipPresentationSheets(){const source=eliteReadSeasonObjects_(ELITE.sheets.chipUsage),rounds=[...new Set(source.map(row=>Number(row.Speelronde)).filter(Boolean))].sort((a,b)=>a-b);Object.keys(ELITE_CHIP_SHEETS).forEach(code=>{const sheetName=ELITE_CHIP_SHEETS[code],rows=rounds.map(round=>{const matches=source.filter(row=>Number(row.Speelronde)===round&&String(row.ChipCode)===code),status=matches.find(row=>row.Groep==='Hele spel')?.Status||matches[0]?.Status||'',row=[round,status];ELITE_CHIP_GROUPS.forEach(group=>{const item=matches.find(value=>value.Groep===group.label);row.push(item?Number(item.ChipAantal)||0:'',item&&item.ChipPercentage!==''?Number(item.ChipPercentage):'')});const global=matches.find(value=>value.Groep==='Hele spel');row.push(global?Number(global.ChipAantal)||0:'',global&&global.ChipPercentage!==''?Number(global.ChipPercentage):'',new Date());return row});eliteReplaceAllPresentationRows_(sheetName,rows)})}
function eliteChipRow_(round,status,code,group,managers,count,source){const denominator=Number(managers);return[ELITE.season,round,status,code,code==='none'?'Geen chip':ELITE_CHIP_NAMES[code]||`Onbekende chip (${code})`,group,denominator>0?denominator:'',Number(count)||0,denominator>0?(Number(count)||0)/denominator*100:'',source,new Date()]}
function eliteEventStatus_(event){if(event.finished)return'Definitief';if(event.is_current)return'Lopend';const deadline=event.deadline_time?new Date(event.deadline_time).getTime():NaN;return Number.isFinite(deadline)&&deadline<=Date.now()?'Locked':'Lopend'}

function eliteUpdateManagerResults_(gameweek,results){if(!results.length)return;const sheet=SpreadsheetApp.getActive().getSheetByName(ELITE.sheets.managers),values=sheet.getDataRange().getValues(),headers=values[0].map(String),roundIndex=headers.indexOf('Gameweek'),entryIndex=headers.indexOf('EntryId'),chipIndex=headers.indexOf('ActiveChip'),statusIndex=headers.indexOf('FetchStatus'),byEntry={};results.forEach(result=>byEntry[String(result.manager.entry)]=result);const updates=[];for(let i=1;i<values.length;i++){if(Number(values[i][roundIndex])!==Number(gameweek))continue;const result=byEntry[String(values[i][entryIndex])];if(result)updates.push({row:i+1,chip:result.chip,status:result.status})}if(!updates.length)return;const first=updates[0].row,last=updates[updates.length-1].row,block=sheet.getRange(first,chipIndex+1,last-first+1,2).getValues();updates.forEach(update=>{const index=update.row-first;block[index][0]=update.chip;block[index][1]=update.status});sheet.getRange(first,chipIndex+1,block.length,2).setValues(block)}

function eliteFetchStandings_(){const found=[],seen={};for(let page=1;found.length<ELITE.maximumManagers&&page<=Math.ceil(ELITE.maximumManagers/ELITE.pageSize)+2;page++){const data=eliteFetchJson_(`${ELITE.baseUrl}/leagues-classic/${ELITE.leagueId}/standings/?page_standings=${page}&page_new_entries=1&phase=1`);const rows=data&&data.standings&&data.standings.results||[];if(!rows.length)break;rows.forEach(row=>{const id=String(row.entry||'');if(id&&!seen[id]&&found.length<ELITE.maximumManagers){seen[id]=true;found.push(Object.assign({},row,{standingIndex:found.length+1}))}})}return found}
let ELITE_GENERAL_RANKING_SIZE_CACHE = null
function eliteStandingsPage_(page){const data=eliteFetchJson_(`${ELITE.baseUrl}/leagues-classic/${ELITE.leagueId}/standings/?page_standings=${page}&page_new_entries=1&phase=1`);return data&&data.standings||{has_next:false,page:page,results:[]}}
function eliteGeneralRankingSize_(){if(ELITE_GENERAL_RANKING_SIZE_CACHE)return ELITE_GENERAL_RANKING_SIZE_CACHE;try{let low=1,high=2,last=eliteStandingsPage_(1);if(!last.results.length)return null;while(true){const candidate=eliteStandingsPage_(high);if(candidate.results.length){low=high;last=candidate;if(!candidate.has_next)break;high*=2}else break}if(last.has_next||high>low){while(low+1<high){const middle=Math.floor((low+high)/2),candidate=eliteStandingsPage_(middle);if(candidate.results.length){low=middle;last=candidate}else high=middle}if(last.has_next){const candidate=eliteStandingsPage_(low+1);if(candidate.results.length)last=candidate}}const rows=last.results||[],tail=rows[rows.length-1],rankSort=Number(tail&&tail.rank_sort),calculated=(Number(last.page)||low-1)*ELITE.pageSize+rows.length,total=rankSort>0?rankSort:calculated>0?calculated:null;if(total)ELITE_GENERAL_RANKING_SIZE_CACHE=total;return total}catch(error){console.warn(`League ${ELITE.leagueId}: totale algemene ranking kon niet worden bepaald: ${error.message}`);return null}}
function eliteFetchPicksBatch_(managers,gameweek){let pending=managers.map((manager,index)=>({manager,index})),results=new Array(managers.length);for(let attempt=0;attempt<ELITE.attempts&&pending.length;attempt++){if(attempt)Utilities.sleep(attempt*1000);const responses=UrlFetchApp.fetchAll(pending.map(x=>({url:`${ELITE.baseUrl}/entry/${x.manager.entry}/event/${gameweek}/picks/`,muteHttpExceptions:true}))),retry=[];responses.forEach((response,i)=>{const target=pending[i],code=response.getResponseCode();if(code===200){try{results[target.index]=JSON.parse(response.getContentText())}catch(e){}}else if(code===429||code>=500)retry.push(target)});pending=retry}return results}
function eliteFetchJson_(url){const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true});if(response.getResponseCode()!==200)throw new Error(`ESPN ${response.getResponseCode()}: ${url}`);return JSON.parse(response.getContentText())}
let ELITE_PLAYER_ID_CACHE = null
function eliteMapPlayerId_(espnId){if(!ELITE_PLAYER_ID_CACHE)eliteBuildPlayerMatchCache_();return ELITE_PLAYER_ID_CACHE[String(espnId)]||''}
function eliteBuildPlayerMatchCache_(){ELITE_PLAYER_ID_CACHE={};const sheet=SpreadsheetApp.getActive().getSheetByName('Spelers');if(!sheet)throw new Error('Tabblad Spelers ontbreekt.');const values=sheet.getDataRange().getValues(),headers=values.shift().map(String),nameIndex=eliteHeaderIndex_(headers,['Speler','Naam','Player']),clubIndex=eliteHeaderIndex_(headers,['Club','Team']),positionIndex=eliteHeaderIndex_(headers,['Positie','Position']),idIndex=eliteHeaderIndex_(headers,['PlayerID','Speler ID','Speler_ID','ID']);if([nameIndex,clubIndex,positionIndex,idIndex].some(index=>index<0))throw new Error('Spelers mist Speler/Club/Positie/PlayerID voor betrouwbare elite-matching.');const byKey={};values.forEach(row=>{const key=elitePlayerMatchKey_(row[nameIndex],row[clubIndex],row[positionIndex]);if(!key||!row[idIndex])return;(byKey[key]||(byKey[key]=[])).push(String(row[idIndex]))});const bootstrap=eliteFetchJson_(`${ELITE.baseUrl}/bootstrap-static/`),clubs={},positions={1:'keeper',2:'verdediger',3:'middenvelder',4:'aanvaller'};(bootstrap.teams||[]).forEach(team=>clubs[String(team.id)]=[team.name,team.short_name].filter(Boolean));(bootstrap.elements||[]).forEach(player=>{const names=[player.web_name,[player.first_name,player.second_name].filter(Boolean).join(' '),player.second_name].filter(Boolean),clubNames=clubs[String(player.team)]||[''],position=positions[Number(player.element_type)]||'';const matches=new Set();names.forEach(name=>clubNames.forEach(club=>(byKey[elitePlayerMatchKey_(name,club,position)]||[]).forEach(id=>matches.add(id))));if(matches.size===1)ELITE_PLAYER_ID_CACHE[String(player.id)]=[...matches][0]})}
function elitePlayerMatchKey_(name,club,position){return[eliteNormalize_(name),eliteNormalizeClub_(club),eliteNormalizePosition_(position)].join('|')}
function eliteNormalize_(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}
function eliteNormalizeClub_(value){const normalized=eliteNormalize_(value),groups={ajax:['ajax'],az:['az'],psv:['psv'],feyenoord:['feyenoord','fey'],utrecht:['fcutrecht','utrecht','utr'],twente:['fctwente','twente','twe'],groningen:['fcgroningen','groningen','gro'],nec:['nec'],heerenveen:['scheerenveen','heerenveen','hee'],sparta:['spartarotterdam','sparta','spa'],volendam:['fcvolendam','volendam','vol'],fortuna:['fortunasittard','fortuna','for'],ado:['adodenhaag','ado'],telstar:['telstar','tel'],pec:['peczwolle','pec'],goahead:['goaheadeagles','goahead','gae'],nac:['nacbreda','nac'],excelsior:['excelsior','exc'],heracles:['heraclesalmelo','heracles','her']};for(const canonical in groups)if(groups[canonical].indexOf(normalized)>=0)return canonical;return normalized}
function eliteNormalizePosition_(value){const normalized=eliteNormalize_(value);if(/keeper|doelman|kee/.test(normalized))return'keeper';if(/verdediger|defender|ver/.test(normalized))return'verdediger';if(/middenvelder|midfielder|mid/.test(normalized))return'middenvelder';if(/aanvaller|forward|spits|spi/.test(normalized))return'aanvaller';return normalized}
function eliteHeaderIndex_(headers,names){for(let i=0;i<names.length;i++){const index=headers.findIndex(header=>eliteNormalize_(header)===eliteNormalize_(names[i]));if(index>=0)return index}return-1}
function eliteMarketByPlayerId_(){const sheet=SpreadsheetApp.getActive().getSheetByName('Spelers');if(!sheet)return{};const values=sheet.getDataRange().getValues(),headers=values.shift().map(String),id=eliteHeaderIndex_(headers,['PlayerID','Speler ID','Speler_ID','ID']),market=headers.findIndex(h=>/selected_by_percent|gespeeld door|gekozen/i.test(h)),result={};if(id<0||market<0)return result;values.forEach(row=>{const n=Number(String(row[market]).replace('%','').replace(',','.'));if(row[id]!==''&&isFinite(n))result[String(row[id])]=n});return result}
function eliteManagerRow_(m,gw,status){return[ELITE.season,gw,new Date(),ELITE.leagueId,ELITE.maximumManagers,String(m.entry),m.standingIndex,m.rank,m.rank_sort||'',m.last_rank||'',m.entry_name||'',m.player_name||'',m.player_manager_display_name||'',m.total||0,m.event_total||0,Boolean(m.has_played),'',status]}
function eliteExactCohort_(rows,size){const seen={},result=[];rows.slice().sort((a,b)=>Number(a.StandingIndex)-Number(b.StandingIndex)||String(a.EntryId).localeCompare(String(b.EntryId))).forEach(row=>{const id=String(row.EntryId||'');if(id&&!seen[id]&&result.length<size){seen[id]=true;result.push(row)}});return result}
function eliteEnsureSheet_(ss,name,headers){const sheet=ss.getSheetByName(name)||ss.insertSheet(name);if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');sheet.setFrozenRows(1)}return sheet}
function eliteEnsureAllSheets_(){const spreadsheet=SpreadsheetApp.getActive();Object.keys(ELITE_HEADERS).forEach(name=>eliteEnsureSheet_(spreadsheet,name,ELITE_HEADERS[name]))}
function elitePrepare_(){eliteEnsureAllSheets_();eliteEnsureManagerActiveChipColumn_();eliteValidateChipHeaders_()}
function eliteEnsureManagerActiveChipColumn_(){const sheet=SpreadsheetApp.getActive().getSheetByName(ELITE.sheets.managers),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);if(headers.indexOf('ActiveChip')>=0)return;const statusIndex=headers.indexOf('FetchStatus');sheet.insertColumnBefore(statusIndex>=0?statusIndex+1:sheet.getLastColumn()+1);sheet.getRange(1,statusIndex>=0?statusIndex+1:sheet.getLastColumn()).setValue('ActiveChip')}
function eliteValidateChipHeaders_(){['CHIP_GEBRUIK','CHIP_DYNAMISCH_DUO','CHIP_AANVALLUH','CHIP_SUIKEROOM','CHIP_WILDCARD'].forEach(name=>{const sheet=SpreadsheetApp.getActive().getSheetByName(name),expected=ELITE_HEADERS[name],actual=sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),expected.length)).getValues()[0].slice(0,expected.length).map(String),valid=expected.every((header,index)=>actual[index]===header);if(valid)return;if(sheet.getLastRow()<=1){sheet.clearContents();sheet.getRange(1,1,1,expected.length).setValues([expected]).setFontWeight('bold');sheet.setFrozenRows(1);return}throw new Error(`${name} heeft bestaande data met afwijkende headers; migratie is bewust gestopt om historie te bewaren.`)})}
function eliteAppendRows_(name,rows){if(!rows.length)return;const sheet=eliteEnsureSheet_(SpreadsheetApp.getActive(),name,ELITE_HEADERS[name]);sheet.getRange(sheet.getLastRow()+1,1,rows.length,ELITE_HEADERS[name].length).setValues(rows)}
function eliteReplaceRoundRows_(name,gw,newRows){const sheet=eliteEnsureSheet_(SpreadsheetApp.getActive(),name,ELITE_HEADERS[name]),values=sheet.getDataRange().getValues(),headers=values[0].map(String),gwIndex=headers.indexOf('Gameweek'),seasonIndex=headers.indexOf('Seizoen'),matches=[];for(let i=1;i<values.length;i++)if(String(values[i][seasonIndex])===ELITE.season&&Number(values[i][gwIndex])===Number(gw))matches.push(i+1);const groups=[];matches.forEach(row=>{const last=groups[groups.length-1];if(last&&last.start+last.count===row)last.count++;else groups.push({start:row,count:1})});groups.reverse().forEach(group=>sheet.deleteRows(group.start,group.count));eliteAppendRows_(name,newRows)}
function eliteReadRoundObjects_(name,gw){const sheet=SpreadsheetApp.getActive().getSheetByName(name);if(!sheet||sheet.getLastRow()<2)return[];const values=sheet.getDataRange().getValues(),headers=values.shift().map(String);return values.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]]))).filter(row=>String(row.Seizoen)===ELITE.season&&Number(row.Gameweek)===Number(gw))}
function eliteReadSeasonObjects_(name){const sheet=SpreadsheetApp.getActive().getSheetByName(name);if(!sheet||sheet.getLastRow()<2)return[];const values=sheet.getDataRange().getValues(),headers=values.shift().map(String);return values.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]]))).filter(row=>String(row.Seizoen)===ELITE.season)}
function eliteReplaceSeasonRows_(name,newRows){const sheet=eliteEnsureSheet_(SpreadsheetApp.getActive(),name,ELITE_HEADERS[name]),values=sheet.getDataRange().getValues(),headers=values[0].map(String),seasonIndex=headers.indexOf('Seizoen'),matches=[];for(let i=1;i<values.length;i++)if(String(values[i][seasonIndex])===ELITE.season)matches.push(i+1);const groups=[];matches.forEach(row=>{const last=groups[groups.length-1];if(last&&last.start+last.count===row)last.count++;else groups.push({start:row,count:1})});groups.reverse().forEach(group=>sheet.deleteRows(group.start,group.count));eliteAppendRows_(name,newRows)}
function eliteUpsertChipRows_(newRows){const name=ELITE.sheets.chipUsage,sheet=eliteEnsureSheet_(SpreadsheetApp.getActive(),name,ELITE_HEADERS[name]),values=sheet.getDataRange().getValues(),headers=values[0].map(String),seasonIndex=headers.indexOf('Seizoen'),roundIndex=headers.indexOf('Speelronde'),codeIndex=headers.indexOf('ChipCode'),groupIndex=headers.indexOf('Groep'),replacement=new Map(newRows.map(row=>[[row[0],row[1],row[3],row[5]].join('|'),row])),kept=[];for(let i=1;i<values.length;i++){const row=values[i],key=[row[seasonIndex],row[roundIndex],row[codeIndex],row[groupIndex]].join('|');if(!replacement.has(key))kept.push(row)}const all=kept.concat([...replacement.values()]);if(sheet.getLastRow()>1)sheet.deleteRows(2,sheet.getLastRow()-1);if(all.length)sheet.getRange(2,1,all.length,headers.length).setValues(all)}
function eliteReplaceAllPresentationRows_(name,newRows){const sheet=eliteEnsureSheet_(SpreadsheetApp.getActive(),name,ELITE_HEADERS[name]);if(sheet.getLastRow()>1)sheet.deleteRows(2,sheet.getLastRow()-1);if(newRows.length)sheet.getRange(2,1,newRows.length,ELITE_HEADERS[name].length).setValues(newRows)}
function eliteSetMeta_(key,value){const sheet=eliteEnsureSheet_(SpreadsheetApp.getActive(),ELITE.sheets.meta,ELITE_HEADERS.ELITE_META),values=sheet.getDataRange().getValues();for(let i=1;i<values.length;i++)if(values[i][0]===key){sheet.getRange(i+1,2,1,2).setValues([[String(value),new Date()]]);return}sheet.appendRow([key,String(value),new Date()])}
function eliteGetMeta_(key){const sheet=SpreadsheetApp.getActive().getSheetByName(ELITE.sheets.meta);if(!sheet)return'';const row=sheet.getDataRange().getValues().find((x,i)=>i&&x[0]===key);return row?String(row[1]):''}
function eliteLog_(gw,status,phase,requested,found,success,failed,unmatched,message){eliteAppendRows_(ELITE.sheets.control,[[new Date(),ELITE.season,gw,status,phase,requested,found,success,failed,requested?success/requested*100:'',unmatched,(Date.now()-Number(JSON.parse(PropertiesService.getScriptProperties().getProperty('ELITE_PROGRESS')||'{}').startedAt||Date.now()))/1000,message]])}
function eliteScheduleContinuation_(){eliteDeleteContinuationTriggers_();ScriptApp.newTrigger('continueEliteManagerSync').timeBased().after(ELITE.continuationDelayMs).create()}
function eliteDeleteContinuationTriggers_(){ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='continueEliteManagerSync').forEach(t=>ScriptApp.deleteTrigger(t))}
function eliteBool_(value){return value===true||value===1||String(value).toLowerCase()==='true'}
