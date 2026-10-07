export const GROUPS = Object.freeze({ CONTENT_CREATOR: 'Content Creators', ESPN: 'ESPN / Kenners', FVT_SUBLEAGUE: 'FVT Subleague' });
export const LEAGUES = Object.freeze([{ id: 369, group: 'FVT_SUBLEAGUE' }, { id: 1182, group: 'CONTENT_CREATOR' }]);
export const ESPN_SEEDS = [
  [20124, 'Kees Kwakman', 'SC Oskar Buur 04', 'cjw kwakman'], [3810, 'Sam Planting', 'Moneyball FC'],
  [23430, 'Emile van de Sande', 'Emile’s XI'], [4280, 'Marciano Vink', 'Mistaken Identity'],
  [42488, 'Bram van Polen', 'Polen2'], [29569, 'Fresia Cousino Arias', 'FC ARIAS'],
  [4050, 'Wouter Bouwman', 'WB'], [39366, 'Martijn van Zijtveld', 'FC We Doen Maar Wat'],
  [36869, 'Sanne van Dongen', 'San Siro 93’'], [17887, 'Teun de Boer', 'Fong Shou Dragons'],
  [33068, 'Sinclair Bischop', 'Bischop united'], [7807, 'Anco Jansen', 'Fredjebenson'],
  [32900, 'Sjors Blaauw', 'Blue Brothers'], [29587, 'Milan van Dongen', 'Maldini FC'],
  [20956, 'Yordi Yamali', 'FC Fev'], [1926, 'Michiel Teeling', 'TeamTeeling'],
  [44263, 'Arnold Bruggink', 'Bruggigol'], [52592, 'Aletha Leidelmeijer', 'Aal van Gaal'],
].map(([espn_entry_id, public_name, fantasy_team_name, fantasy_manager_name = '']) => ({ espn_entry_id, public_name, fantasy_team_name, fantasy_manager_name, curated: true }));
// Canonical public labels; historical snapshots keep their original ESPN codes.
export const CHIP_LABELS = Object.freeze({ wildcard: 'Wildcard', frush: 'Aanvalluh!', rich: 'Suikeroom', '2capt': 'Dynamisch Duo' });
export const chipLabel = (code, labels = {}) => code ? (CHIP_LABELS[code] || labels[code] || code) : 'Geen chip';
export function seasonOf(bootstrap) {
  const deadlines = bootstrap.events.map(e => Date.parse(e.deadline_time)).filter(Number.isFinite);
  if (!deadlines.length) throw Error('Bootstrap mist seizoendatums');
  const year = new Date(Math.min(...deadlines)).getUTCFullYear();
  return `${year}-${year + 1}`;
}
export function completedEvents(bootstrap) {
  if (!Array.isArray(bootstrap.events) || !Array.isArray(bootstrap.elements) || !Array.isArray(bootstrap.teams) || !bootstrap.game_settings) throw Error('Ongeldige bootstrap');
  return bootstrap.events.filter(e => e.finished === true && e.data_checked === true).sort((a, b) => a.id - b.id);
}
export function mergeManagers(sources, seeds = ESPN_SEEDS) {
  const managers = new Map();
  const add = (entry, group, sourceLeague = null, manual = false) => {
    const id = Number(entry.espn_entry_id ?? entry.entry);
    if (!Number.isSafeInteger(id) || id <= 0) throw Error('Ongeldige entry-identiteit');
    const old = managers.get(id);
    const m = old || { espn_entry_id: id, public_name: entry.public_name || entry.player_manager_display_name || entry.player_name || `Manager ${id}`, fantasy_manager_name: entry.fantasy_manager_name || entry.player_manager_display_name || entry.player_name || '', fantasy_team_name: entry.fantasy_team_name || entry.entry_name || '', curated: false, groups: [] };
    if (entry.curated) Object.assign(m, entry);
    const membership=m.groups.find(g=>g.group_type===group);
    if (!membership) m.groups.push({ group_type: group, source_type: manual ? 'manual' : sourceLeague ? 'league' : 'curated', source_league_id: sourceLeague, manual_override: manual });
    else if(manual)Object.assign(membership,{source_type:'manual',source_league_id:null,manual_override:true});
    managers.set(id, m);
  };
  for (const s of sources) for (const row of s.rows) add(row, s.group, s.id);
  for (const seed of seeds) add(seed, 'ESPN', 7302);
  add({ espn_entry_id: 260, public_name: 'Lars' }, 'CONTENT_CREATOR', null, true);
  return [...managers.values()];
}
export function normalizeSnapshot(response, bootstrap, event, manager) {
  const h = response?.entry_history;
  if (!h || h.event !== event || !Array.isArray(response.picks) || response.picks.length !== 15) throw Error('Onvolledige ronde/picks');
  const required = ['points', 'total_points', 'bank', 'value', 'event_transfers', 'event_transfers_cost', 'points_on_bench'];
  for (const field of required) if (!Number.isSafeInteger(h[field]) || (field !== 'points' && field !== 'points_on_bench' && h[field] < 0)) throw Error(`Ongeldig veld ${field}`);
  const elements = new Map(bootstrap.elements.map(e => [e.id, e]));
  const teams = new Map(bootstrap.teams.map(t => [t.id, t]));
  const picks = response.picks.map(p => {
    const player = elements.get(p.element);
    if (!player || !Number.isInteger(p.position) || p.position < 1 || p.position > 15 || !Number.isInteger(p.multiplier) || p.multiplier < 0 || typeof p.is_captain !== 'boolean' || typeof p.is_vice_captain !== 'boolean' || ![1,2,3,4].includes(p.element_type ?? player.element_type)) throw Error('Ongeldige speler/pick');
    return { element_id: p.element, squad_position: p.position, multiplier: p.multiplier, is_captain: p.is_captain, is_vice_captain: p.is_vice_captain, element_type: p.element_type ?? player.element_type, player_name: `${player.first_name} ${player.second_name}`.trim(), web_name: player.web_name, club_name: teams.get(player.team)?.name || '', club_id: player.team, price_at_fetch: player.now_cost };
  }).sort((a,b) => a.squad_position - b.squad_position);
  if (new Set(picks.map(p => p.element_id)).size !== 15 || new Set(picks.map(p => p.squad_position)).size !== 15 || picks.filter(p => p.is_captain).length !== 1 || picks.filter(p => p.is_vice_captain).length !== 1 || picks.some(p => p.is_captain && p.is_vice_captain)) throw Error('Dubbele picks of ongeldige captain');
  for (const field of ['rank','overall_rank','percentile_rank','overall_rank_percentage']) if (h[field] != null && !Number.isFinite(Number(h[field]))) throw Error(`Ongeldig veld ${field}`);
  if (response.active_chip != null && (typeof response.active_chip !== 'string' || response.active_chip.length > 60)) throw Error('Ongeldige chip');
  return { season: seasonOf(bootstrap), event, active_chip: response.active_chip || null, event_points: h.points, total_points: h.total_points, event_rank: h.rank ?? null, overall_rank: h.overall_rank ?? null, percentile_rank: h.percentile_rank ?? null, overall_rank_percentage: h.overall_rank_percentage == null ? null : Number(h.overall_rank_percentage), bank: h.bank, team_value: h.value, event_transfers: h.event_transfers, event_transfers_cost: h.event_transfers_cost, points_on_bench: h.points_on_bench, fantasy_team_name: manager.fantasy_team_name, groups: manager.groups.map(g => typeof g === 'string' ? g : g.group_type), picks, automatic_subs: response.automatic_subs || [], raw_json: response, sync_status: 'complete', historical_metadata_source: 'bootstrap_at_fetch' };
}
export function deriveTransfers(current, previous) {
  if (!previous || previous.event !== current.event - 1 || previous.season !== current.season) return { available: false, incoming: [], outgoing: [], temporary: current.active_chip === 'rich' };
  const old = new Set(previous.picks.map(p => p.element_id));
  const now = new Set(current.picks.map(p => p.element_id));
  return { available: true, incoming: current.picks.filter(p => !old.has(p.element_id)), outgoing: previous.picks.filter(p => !now.has(p.element_id)), temporary: current.active_chip === 'rich' || previous.active_chip === 'rich' };
}
export function rankManagers(managers, snapshots, season, event, group = '') {
  const selected = snapshots.filter(s => s.season === season && s.event === event && s.groups.length > 0 && (!group || s.groups.includes(group)));
  const previous = snapshots.filter(s => s.season === season && s.event === event - 1 && s.groups.length > 0 && (!group || s.groups.includes(group))).sort((a,b) => b.total_points - a.total_points);
  const byId = new Map(managers.map(m => [m.id, m]));
  return selected.sort((a,b) => b.total_points - a.total_points || (a.overall_rank ?? Infinity) - (b.overall_rank ?? Infinity)).map((s,i,list) => {
    const position = list.findIndex(x => x.total_points === s.total_points) + 1;
    const p = previous.find(x => x.prominent_id === s.prominent_id);
    const previousPosition = p ? previous.findIndex(x => x.total_points === p.total_points) + 1 : null;
    return { ...byId.get(s.prominent_id), snapshot: s, position, previousPosition, movement: previousPosition == null ? null : previousPosition - position };
  });
}
export function roundAnalytics(rows, snapshots, season, event) {
  const history = snapshots.filter(s => s.season === season && s.event <= event && rows.some(r => r.id === s.prominent_id));
  const players = new Map();
  const transfers = new Map();
  const stats = rows.map(row => {
    const rounds = history.filter(s => s.prominent_id === row.id);
    const sum = key => rounds.reduce((n,s) => n + (s[key] || 0), 0);
    for (const p of row.snapshot.picks || []) {
      const v = players.get(p.element_id) || { ...p, owners: 0, captains: 0 };
      v.owners++; if (p.is_captain) v.captains++; players.set(p.element_id,v);
    }
    const t = deriveTransfers(row.snapshot, history.find(s => s.prominent_id === row.id && s.event === event - 1));
    for (const [list,field] of [[t.incoming,'bought'],[t.outgoing,'sold']]) for (const p of list) { const v = transfers.get(p.element_id) || {...p,bought:0,sold:0}; v[field]++; transfers.set(p.element_id,v); }
    return {...row, average: sum('event_points') / rounds.length, bench: sum('points_on_bench'), transfers: sum('event_transfers'), costs: sum('event_transfers_cost')};
  });
  for (const p of players.values()) p.ownership = rows.length ? p.owners / rows.length * 100 : 0;
  const leaders = key => [...stats].filter(r => r[key] != null).sort((a,b) => b[key] - a[key]);
  const differential = stats.map(r => ({...r, differential: (r.snapshot.picks || []).filter(p => p.squad_position <= 11 && (players.get(p.element_id)?.ownership || 0) <= 10).length}));
  return { count: rows.length, stats, managerOfRound: [...rows].sort((a,b) => b.snapshot.event_points - a.snapshot.event_points)[0], bestAverage: leaders('average')[0], riser: leaders('movement').find(r => r.movement > 0), faller: leaders('movement').reverse().find(r => r.movement < 0), transferKing: leaders('transfers')[0], benchKing: leaders('bench')[0], efficientBench: leaders('bench').reverse()[0], highestValue: [...rows].sort((a,b) => b.snapshot.team_value - a.snapshot.team_value)[0], differentialKing: differential.sort((a,b) => b.differential - a.differential)[0], players: [...players.values()].sort((a,b) => b.owners - a.owners), captains: [...players.values()].filter(p => p.captains).sort((a,b) => b.captains - a.captains), trends: [...transfers.values()].sort((a,b) => (b.bought - b.sold) - (a.bought - a.sold)), chips: history.filter(s => s.active_chip).sort((a,b) => b.event_points - a.event_points) };
}
