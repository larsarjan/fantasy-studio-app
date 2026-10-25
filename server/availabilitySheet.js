import { fetchSheet } from '../src/services/googleSheets.js'

export async function collectAvailabilitySheet({ fetchRows = () => fetchSheet('PLAYER_AVAILABILITY', {maximumAttempts:1}), now = Date.now() } = {}) {
  const rows = await fetchRows()
  if (!Array.isArray(rows) || !rows.length || rows.length > 50000) throw Error('Availability-sheet leeg of ongeldig; bestaande status behouden.')
  const current = rows.filter(r => String(r.Active).toLowerCase() === 'true')
  const seen = new Set(), result=[]
  for (const r of current) {
    if (!['exact','alias','manual'].includes(r.Match_Status)) continue
    const key = `${r.Season}|${r.Fantasy_Player_ID}`
    if(seen.has(key))throw Error('Dubbele actuele speler in availability-sheet.')
    seen.add(key)
    const observed = Date.parse(r.Last_Seen_At)
    // Missing cards may stay in the human cache, but never refresh their timestamp.
    if (Number.isFinite(observed) && now-observed>7*86400000) continue
    if(!Number.isFinite(observed)||observed>now+300000||!/^\d{4}\/\d{4}$/.test(r.Season)||!r.Fantasy_Player_ID||!r.Fantasy_Club||!/^https:\/\/www\.blessuresenschorsingen\.nl\/[a-z0-9-]+-\d+$/.test(r.Source_URL)||!/^[a-f0-9]{64}$/.test(r.Source_Hash))throw Error('Ongeldig availability-record.')
    const pct=r.Availability_Percentage===''?null:Number(r.Availability_Percentage)
    if(pct!==null&&![0,25,50,75,100].includes(pct))throw Error('Ongeldige speelkans.')
    if(!['available','injury','suspension','doubt','unavailable','unknown'].includes(r.Status_Type))throw Error('Ongeldige status.')
    if(r.Expected_Return && (!/^\d{4}-\d{2}-\d{2}$/.test(r.Expected_Return)||!Number.isFinite(Date.parse(r.Expected_Return))))throw Error('Ongeldige terugkeerdatum.')
    result.push({player_id:r.Fantasy_Player_ID,season:r.Season,club:r.Fantasy_Club,status_type:r.Status_Type,availability_percentage:pct,reason:r.Reason||'',expected_return_date:r.Expected_Return||null,source_url:r.Source_URL,source_updated_at:r.Source_Updated_At||null,observed_at:r.Last_Seen_At,source_hash:r.Source_Hash,match_method:r.Match_Status})
  }
  if(!result.length)throw Error('Geen gevalideerde actuele matches; niets gepubliceerd.')
  return result
}
