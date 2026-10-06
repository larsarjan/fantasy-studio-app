/*
|--------------------------------------------------------------------------
| Expected Points Preseason Profile Tests
|--------------------------------------------------------------------------
*/

import {
  getPlayerProfiles,
  getDatabaseSummary,
} from './database.js'

import {
  getExpectedPointsPreseasonProfile,
} from './expectedPoints/expectedPointsPreseasonProfile.js'

console.clear()

console.log('')
console.log('==========================================')
console.log('EXPECTED POINTS PRESEASON PROFILE')
console.log('==========================================')
console.log('')

const activeSeason =
  getDatabaseSummary()
    .activeSeason

const players =
  getPlayerProfiles()

const seasonPlayers =
  players.filter(
    (player) =>
      player.season === activeSeason,
  )

console.log(
  'Actief seizoen:',
  activeSeason,
)

console.log(
  'Spelers:',
  seasonPlayers.length,
)

console.log('')

const barkas =
  seasonPlayers.find(
    (player) =>
      player.name === 'Barkas',
  )

console.log(
  'Testspeler:',
  barkas?.name,
)

const profile =
  getExpectedPointsPreseasonProfile(
    barkas,
  )

console.log('')
console.log('Resultaat:')
console.log(profile)

console.log('')
console.log('==========================================')