// The source supplies the player's on-field count, including stoppage time.
// Never infer it from minutes, clean sheets, score, or point deductions.
export function playerGoalsConceded(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const count = Number(value)
  return Number.isInteger(count) && count >= 0 ? count : null
}
