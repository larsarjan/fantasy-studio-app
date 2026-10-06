/*
|--------------------------------------------------------------------------
| Expected Points Inspector
|--------------------------------------------------------------------------
|
| Developer tool voor het analyseren van de complete
| Expected Points Engine met echte Fantasy Studio-data.
|
*/

import {
  getPlayerProfiles,
  getFixtures,
  getDatabaseSummary,
} from './database.js'

import {
  calculateExpectedPointsEngine,
} from './expectedPoints/expectedPointsEngine.js'

console.clear()

console.log('')
console.log('==========================================')
console.log('EXPECTED POINTS INSPECTOR')
console.log('==========================================')
console.log('')

const activeSeason =
  getDatabaseSummary()
    .activeSeason

const players =
  getPlayerProfiles()

const fixtures =
  getFixtures()

console.log(
  'Actief seizoen:',
  activeSeason,
)

console.log(
  'Aantal spelers:',
  players.length,
)

console.log(
  'Aantal wedstrijden:',
  fixtures.length,
)

const seasonPlayers =
  players.filter(
    (player) =>
      player.season ===
      activeSeason,
  )

console.log(
  'Spelers actief seizoen:',
  seasonPlayers.length,
)

const player =
  seasonPlayers.find(
    (
      candidate,
    ) =>
      Number(
        candidate.expectedMinutes,
      ) > 0 ||
      Number(
        candidate.scoutProfile
          ?.expectedMinutes,
      ) > 0,
  ) ??
  seasonPlayers[0]

console.log('')
console.log('Eerste speler:')
console.log(player)

console.log('')
console.log(
  '==========================================',
)
console.log(
  'EERSTE ECHTE EXPECTED POINTS-PROJECTIE',
)
console.log(
  '==========================================',
)
console.log('')

const projection =
  calculateExpectedPointsEngine(
    player,
    fixtures,
    {
  startRound: 1,
  roundCount: 5,
  useCache: false,
},
  )

console.log(
  'Projectie:',
  projection,
)
console.log('')
console.log(
  '================ DEBUG ================',
)

const firstFixtureProjection =
  projection?.fixtures?.[0] ??
  null

console.log(
  'Expected Minutes speler:',
  player?.expectedMinutes,
)

console.log(
  'Scout Expected Minutes:',
  player
    ?.scoutProfile
    ?.expectedMinutes,
)

console.log(
  'Chance of Playing:',
  player?.chanceOfPlaying,
)

console.log(
  'Scout Profile:',
  player?.scoutProfile,
)

console.log(
  'History:',
  firstFixtureProjection
    ?.intelligence
    ?.history,
)

console.log(
  'History sample:',
  firstFixtureProjection
    ?.intelligence
    ?.history
    ?.sample,
)

console.log(
  'History overall:',
  firstFixtureProjection
    ?.intelligence
    ?.history
    ?.overall,
)

console.log(
  'Outlook:',
  firstFixtureProjection
    ?.intelligence
    ?.outlook,
)

console.log(
  'Fixture Intelligence:',
  firstFixtureProjection
    ?.intelligence
    ?.fixture,
)

console.log(
  'Playing Profile:',
  {
    expectedMinutes:
      firstFixtureProjection
        ?.expectedMinutes,

    conditionalMinutes:
      firstFixtureProjection
        ?.conditionalMinutes,

    appearanceProbability:
      firstFixtureProjection
        ?.appearanceProbability,

    sixtyMinuteProbability:
      firstFixtureProjection
        ?.sixtyMinuteProbability,
  },
)

console.log(
  'Season Transition:',
  firstFixtureProjection
    ?.intelligence
    ?.playerData
    ?.seasonTransition,
)

console.log(
  'Preseason Profile:',
  firstFixtureProjection
    ?.intelligence
    ?.preseasonProfile,
)

console.log(
  'Blended Production:',
  firstFixtureProjection
    ?.intelligence
    ?.productionHistory
    ?.overall,
)

console.log(
  'Production Source:',
  firstFixtureProjection
    ?.intelligence
    ?.productionHistory
    ?.productionSource,
)

console.log(
  'Eerste wedstrijd Expected Points:',
  firstFixtureProjection
    ?.expectedPoints,
)

console.log(
  'Eerste wedstrijd Breakdown:',
  firstFixtureProjection
    ?.breakdown,
)

console.log(
  'Totaal Expected Points:',
  projection
    ?.totalExpectedPoints,
)

console.log(
  'Gemiddeld per speelronde:',
  projection
    ?.averageExpectedPointsPerRound,
)

console.log(
  'Fixtures:',
  projection?.fixtures,
)