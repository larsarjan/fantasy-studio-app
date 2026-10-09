import { supabase } from '../platform/client.js';
import { refreshAccess, hasPermission } from '../platform/access.js';
async function rows(factory) {
  const all=[];
  for(let offset=0;;offset+=250){const {data,error}=await factory().range(offset,offset+249);if(error)throw error;all.push(...data);if(data.length<250)return all;}
}
let cached;
export async function loadProminents({fresh=false}={}) {
  if(!supabase)throw Error('configuration');
  if(!fresh && cached && Date.now()-cached.at<300000)return cached.data;
  const [managers,snapshots,bootstrap]=await Promise.all([
    rows(()=>supabase.from('prominents').select('*,prominent_groups(*)').order('espn_entry_id')),
    rows(()=>supabase.from('prominent_round_snapshots').select('*').order('season').order('event').order('id')),
    rows(()=>supabase.from('prominent_bootstrap').select('season,events,chips,chip_labels,game_settings,fetched_at').order('season',{ascending:false})),
  ]);
  const data={managers,snapshots,bootstrap};cached={at:Date.now(),data};return data;
}
export async function loadRoundPicks(season,events) {
  return rows(()=>supabase.from('prominent_round_snapshots').select('id,picks:prominent_round_picks(*)').eq('season',season).in('event',events).order('id'));
}
export async function loadProfilePicks(id,season) {
  return rows(()=>supabase.from('prominent_round_snapshots').select('id,picks:prominent_round_picks(*)').eq('season',season).eq('prominent_id',id).order('event'));
}
export async function adminStatus() {
  if(!supabase)return null;
  const {data:{session}}=await supabase.auth.getSession();if(!session)return null;
  const access=await refreshAccess();if(!hasPermission(access,'sync.view'))return null;
  const [runs,jobs]=await Promise.all([supabase.from('prominent_sync_runs').select('*').order('started_at',{ascending:false}).limit(12),rows(()=>supabase.from('prominent_sync_jobs').select('*').order('season').order('event').order('prominent_id'))]);
  if(runs.error)throw runs.error;return {runs:runs.data,jobs};
}
export async function syncNow() {
  const {data,error}=await supabase.functions.invoke('prominent-sync',{body:{}});
  if(error)throw error;return data;
}
