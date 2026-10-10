import { supabase } from './client.js'
import { setAvailabilityRecords, setAvailabilityUnavailable } from '../services/availability.js'
let loadedAt=0
export async function availabilityRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
export async function refreshAvailability(admin_mode = false) {
  try {
    const rows = await availabilityRpc('availability_list', {admin_mode})
    setAvailabilityRecords(rows);loadedAt=Date.now()
    return rows
  } catch(error) { setAvailabilityUnavailable(); throw error }
}
export async function ensureAvailability() { if(Date.now()-loadedAt>60000) await refreshAvailability() }
export const availabilityHistory = (player,admin_mode=false) => availabilityRpc('availability_history',{player:String(player.player_id??player.id),player_season:player.season,admin_mode})
