import {createEspnClient} from '../src/services/prominentCollector.js';
import {normalizeSnapshot,seasonOf} from '../src/services/prominentModel.js';

export const officialFields=['team_value','bank','points_on_bench','event_transfers','event_transfers_cost'];
export function verifiedOfficialDetails(snapshot,response,bootstrap,manager){
  if(snapshot.season!==seasonOf(bootstrap))throw Error('Different API season');
  const normalized=normalizeSnapshot(response,bootstrap,snapshot.event,{fantasy_team_name:snapshot.fantasy_team_name,groups:snapshot.groups});
  const identity=p=>[p.element_id,p.squad_position,p.is_captain,p.is_vice_captain].join(':');
  const stored=snapshot.picks.map(identity).sort(),official=normalized.picks.map(identity).sort();
  if(stored.length!==15||stored.some((v,i)=>v!==official[i]))throw Error('Different stored squad');
  return {...Object.fromEntries(officialFields.map(key=>[key,normalized[key]])),automatic_subs:normalized.automatic_subs,details_source:`ESPN entry ${manager.espn_entry_id} / SR${snapshot.event}`};
}

export function createOfficialDetailsLoader({get=createEspnClient({delay:50,fetcher:(url,init)=>fetch(url,{...init,signal:AbortSignal.any([init.signal,AbortSignal.timeout(4000)])})}),now=Date.now}={}){
  const cache=new Map();let bootstrap;
  const loadBootstrap=()=>{if(!bootstrap||now()-bootstrap.at>3600000){const promise=get('bootstrap-static/');bootstrap={at:now(),promise};promise.catch(()=>{bootstrap=null;});}return bootstrap.promise;};
  const load=async(snapshot,manager)=>{
    const squadKey=snapshot.picks.map(p=>[p.element_id,p.squad_position,p.is_captain,p.is_vice_captain].join(':')).sort().join('|');
    const key=`${snapshot.season}:${manager.espn_entry_id}:${snapshot.event}:${squadKey}`,cached=cache.get(key);
    if(cached&&now()-cached.at<86400000)return cached.promise;
    if(cache.size>5000)cache.clear();
    const promise=(async()=>{const config=await loadBootstrap();if(seasonOf(config)!==snapshot.season)throw Error('Archived season');const response=await get(`entry/${manager.espn_entry_id}/event/${snapshot.event}/picks/`);return verifiedOfficialDetails(snapshot,response,config,manager);})();
    cache.set(key,{at:now(),promise});promise.catch(()=>cache.delete(key));return promise;
  };
  return async(snapshots,managers)=>{
    const identities=new Map(managers.map(m=>[m.id,m]));
    const pending=snapshots.filter(s=>s.source==='ELITE_MANAGERS'&&s.picks.length===15&&officialFields.some(k=>s[k]==null));
    let offset=0,verified=0,unavailable=0;const started=now();
    // Bounded concurrency, shared per-entry cache. No writes, scheduler or bulk
    // browser payload; only the selected round or one manager's history.
    await Promise.all(Array.from({length:Math.min(6,pending.length)},async()=>{
      while(offset<pending.length){if(now()-started>45000){unavailable+=pending.length-offset;offset=pending.length;break;}const s=pending[offset++],manager=identities.get(s.prominent_id);try{const details=await load(s,manager);for(const key of officialFields)if(s[key]==null)s[key]=details[key];s.automatic_subs=details.automatic_subs;s.details_source=details.details_source;verified++;}catch{unavailable++;}}
    }));
    return {requested:pending.length,verified,unavailable};
  };
}
export const loadOfficialRankingDetails=createOfficialDetailsLoader();
