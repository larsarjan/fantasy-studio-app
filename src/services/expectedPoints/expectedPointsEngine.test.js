import {
  calculateExpectedPoints,
  calculateExpectedPointsBatch,
} from './expectedPointsCalculation.js'

/*
|--------------------------------------------------------------------------
| Test helpers
|--------------------------------------------------------------------------
*/

function assertEqual(
  description,
  actual,
  expected,
) {
  if (
    actual === expected
  ) {
    console.log(
      `✅ ${description}`,
    )

    return
  }

  console.error(
    `❌ ${description}`,
  )

  console.log(
    'Verwacht:',
    expected,
  )

  console.log(
    'Ontvangen:',
    actual,
  )
}

function assertApprox(
  description,
  actual,
  expected,
  tolerance = 0.01,
) {
  if (
    Math.abs(
      actual -
      expected,
    ) <= tolerance
  ) {
    console.log(
      `✅ ${description}`,
    )

    return
  }

  console.error(
    `❌ ${description}`,
  )

  console.log(
    'Verwacht:',
    expected,
  )

  console.log(
    'Ontvangen:',
    actual,
  )
}

/*
|--------------------------------------------------------------------------
| Testdata
|--------------------------------------------------------------------------
*/

const PLAYER = {

  id: 'player-1',

  expectedMinutes: 90,

  playingChance: 100,
}

const HISTORY = {

  overall: {

    goalsPer90: 0.40,

    assistsPer90: 0.25,

    cleanSheetRate: 0.45,

    savesPer90: 0,

    penaltySavesPer90: 0,

    bonusPerMatch: 0.60,

    yellowCardsPer90: 0.20,

    redCardsPer90: 0.02,

    ownGoalsPer90: 0,

    penaltiesMissedPer90: 0,
  },
}

const FIXTURE = {

  baseMultiplier: 1,

  modifiers: {

    goals: 1,

    assists: 1,

    cleanSheet: 1,

    saves: 1,

    penaltySaves: 1,

    bonus: 1,

    cards: 1,

    ownGoals: 1,

    penaltiesMissed: 1,
  },
}

const OUTLOOK = {

  score: 7,
}

/*
|--------------------------------------------------------------------------
| Verwachte punten berekenen
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== EXPECTED POINTS =====',
)

const projection =
  calculateExpectedPoints({
    playerData:
      PLAYER,

    history:
      HISTORY,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  })

assertApprox(
  '90 minuten verwacht',
  projection.expectedMinutes,
  90,
)

assertApprox(
  'Appearance geeft volledige punten',
  projection.breakdown.appearance,
  2,
)

assertEqual(
  'Breakdown bevat goals',
  typeof projection.breakdown.goals,
  'number',
)

assertEqual(
  'Breakdown bevat assists',
  typeof projection.breakdown.assists,
  'number',
)

assertEqual(
  'Breakdown bevat cleanSheet',
  typeof projection.breakdown.cleanSheet,
  'number',
)

assertEqual(
  'Breakdown bevat bonus',
  typeof projection.breakdown.bonus,
  'number',
)

assertEqual(
  'Breakdown bevat cards',
  typeof projection.breakdown.cards,
  'number',
)

assertEqual(
  'Expected Points is een getal',
  typeof projection.expectedPoints,
  'number',
)

assertEqual(
  'Fixture modifier aanwezig',
  typeof projection.modifiers.fixture,
  'number',
)

assertEqual(
  'Outlook modifier aanwezig',
  typeof projection.modifiers.outlook,
  'number',
)

console.log(
  projection,
)

/*
|--------------------------------------------------------------------------
| Scenario's
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== SCENARIO TESTS =====',
)

/*
|--------------------------------------------------------------------------
| 0 minuten
|--------------------------------------------------------------------------
*/

const noMinutes =
  calculateExpectedPoints({
    playerData: {
      ...PLAYER,
      expectedMinutes: 0,
    },
    history: HISTORY,
    fixture: FIXTURE,
    outlook: OUTLOOK,
  })

assertApprox(
  '0 minuten geeft 0 appearance',
  noMinutes.breakdown.appearance,
  0,
)

assertApprox(
  '0 minuten verwacht',
  noMinutes.expectedMinutes,
  0,
)

assertApprox(
  '0 minuten geeft 0 expected points',
  noMinutes.expectedPoints,
  0,
)

/*
|--------------------------------------------------------------------------
| 50% speelkans
|--------------------------------------------------------------------------
*/

const halfChance =
  calculateExpectedPoints({
    playerData: {
      ...PLAYER,
      playingChance: 50,
    },
    history: HISTORY,
    fixture: FIXTURE,
    outlook: OUTLOOK,
  })

assertApprox(
  '50% speelkans geeft 45 minuten',
  halfChance.expectedMinutes,
  45,
)

/*
|--------------------------------------------------------------------------
| Gunstige fixture
|--------------------------------------------------------------------------
*/

const easyFixture =
  calculateExpectedPoints({
    playerData: PLAYER,
    history: HISTORY,
    fixture: {
      ...FIXTURE,

      baseMultiplier: 1.20,

      modifiers: {
        ...FIXTURE.modifiers,

        goals: 1.20,

        assists: 1.15,

        cleanSheet: 1.18,

        bonus: 1.10,
      },
    },
    outlook: OUTLOOK,
  })

assertEqual(
  'Gunstige fixture verhoogt doelpunten',
  easyFixture.breakdown.goals >
    projection.breakdown.goals,
  true,
)

assertEqual(
  'Gunstige fixture verhoogt assists',
  easyFixture.breakdown.assists >
    projection.breakdown.assists,
  true,
)

/*
|--------------------------------------------------------------------------
| Moeilijke fixture
|--------------------------------------------------------------------------
*/

const hardFixture =
  calculateExpectedPoints({
    playerData: PLAYER,
    history: HISTORY,
    fixture: {
      ...FIXTURE,

      baseMultiplier: 0.80,

      modifiers: {
        ...FIXTURE.modifiers,

        goals: 0.80,

        assists: 0.85,

        cleanSheet: 0.75,

      },
    },
    outlook: OUTLOOK,
  })

assertEqual(
  'Moeilijke fixture verlaagt doelpunten',
  hardFixture.breakdown.goals <
    projection.breakdown.goals,
  true,
)

assertEqual(
  'Moeilijke fixture verlaagt clean sheets',
  hardFixture.breakdown.cleanSheet <
    projection.breakdown.cleanSheet,
  true,
)

/*
|--------------------------------------------------------------------------
| Outlook
|--------------------------------------------------------------------------
*/

const highOutlook =
  calculateExpectedPoints({
    playerData: PLAYER,
    history: HISTORY,
    fixture: FIXTURE,
    outlook: {
      score: 9,
    },
  })

assertEqual(
  'Hoge outlook verhoogt expected points',
  highOutlook.expectedPoints >
    projection.expectedPoints,
  true,
)

const lowOutlook =
  calculateExpectedPoints({
    playerData: PLAYER,
    history: HISTORY,
    fixture: FIXTURE,
    outlook: {
      score: 5,
    },
  })

assertEqual(
  'Lage outlook verlaagt expected points',
  lowOutlook.expectedPoints <
    projection.expectedPoints,
  true,
)

/*
|--------------------------------------------------------------------------
| Positie-afhankelijke puntentelling
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== POSITIE TESTS =====',
)

const POSITION_HISTORY = {
  overall: {
    goalsPer90: 1,
    assistsPer90: 0,
    cleanSheetRate: 1,
    savesPer90: 6,
    penaltySavesPer90: 0,
    bonusPerMatch: 0,
    yellowCardsPer90: 0,
    redCardsPer90: 0,
    ownGoalsPer90: 0,
    penaltiesMissedPer90: 0,
    goalsConcededPer90: 2,
  },
}

const GOALKEEPER =
  calculateExpectedPoints({
    playerData: {
      ...PLAYER,
      id: 'goalkeeper',
      position: 'Doelman',
    },

    history:
      POSITION_HISTORY,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  })

const DEFENDER =
  calculateExpectedPoints({
    playerData: {
      ...PLAYER,
      id: 'defender',
      position: 'Verdediger',
    },

    history:
      POSITION_HISTORY,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  })

const MIDFIELDER =
  calculateExpectedPoints({
    playerData: {
      ...PLAYER,
      id: 'midfielder',
      position: 'Middenvelder',
    },

    history:
      POSITION_HISTORY,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  })

const FORWARD =
  calculateExpectedPoints({
    playerData: {
      ...PLAYER,
      id: 'forward',
      position: 'Spits',
    },

    history:
      POSITION_HISTORY,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  })

/*
|--------------------------------------------------------------------------
| Positieherkenning
|--------------------------------------------------------------------------
*/

assertEqual(
  'Doelman wordt herkend als goalkeeper',
  GOALKEEPER.position,
  'goalkeeper',
)

assertEqual(
  'Verdediger wordt herkend als defender',
  DEFENDER.position,
  'defender',
)

assertEqual(
  'Middenvelder wordt herkend als midfielder',
  MIDFIELDER.position,
  'midfielder',
)

assertEqual(
  'Spits wordt herkend als forward',
  FORWARD.position,
  'forward',
)

assertEqual(
  'Bekende posities gebruiken geen fallback',
  [
    GOALKEEPER,
    DEFENDER,
    MIDFIELDER,
    FORWARD,
  ].every(
    (
      result,
    ) =>
      result.positionFallbackUsed ===
      false,
  ),
  true,
)

/*
|--------------------------------------------------------------------------
| Doelpunten
|--------------------------------------------------------------------------
|
| POSITION_HISTORY gebruikt exact:
|
| 1 goal per 90 minuten
| 90 verwachte minuten
| neutrale fixture
| neutrale vorm
|
| Daardoor moet de goalbreakdown exact gelijk
| zijn aan de officiële puntenwaarde.
|
*/

assertApprox(
  'Keepergoal levert 10 punten op',
  GOALKEEPER.breakdown.goals,
  10,
)

assertApprox(
  'Verdedigersgoal levert 6 punten op',
  DEFENDER.breakdown.goals,
  6,
)

assertApprox(
  'Middenveldersgoal levert 5 punten op',
  MIDFIELDER.breakdown.goals,
  5,
)

assertApprox(
  'Spitsengoal levert 4 punten op',
  FORWARD.breakdown.goals,
  4,
)

/*
|--------------------------------------------------------------------------
| Clean sheets
|--------------------------------------------------------------------------
*/

assertApprox(
  'Keeper krijgt 4 clean-sheetpunten',
  GOALKEEPER.breakdown.cleanSheet,
  4,
)

assertApprox(
  'Verdediger krijgt 4 clean-sheetpunten',
  DEFENDER.breakdown.cleanSheet,
  4,
)

assertApprox(
  'Middenvelder krijgt 1 clean-sheetpunt',
  MIDFIELDER.breakdown.cleanSheet,
  1,
)

assertApprox(
  'Spits krijgt geen clean-sheetpunten',
  FORWARD.breakdown.cleanSheet,
  0,
)

/*
|--------------------------------------------------------------------------
| Reddingen
|--------------------------------------------------------------------------
|
| 6 reddingen per 90 minuten:
|
| 6 / 3 = 2 punten
|
*/

assertApprox(
  'Keeper krijgt reddingspunten',
  GOALKEEPER.breakdown.saves,
  2,
)

assertApprox(
  'Verdediger krijgt geen reddingspunten',
  DEFENDER.breakdown.saves,
  0,
)

assertApprox(
  'Middenvelder krijgt geen reddingspunten',
  MIDFIELDER.breakdown.saves,
  0,
)

assertApprox(
  'Spits krijgt geen reddingspunten',
  FORWARD.breakdown.saves,
  0,
)

/*
|--------------------------------------------------------------------------
| Tegendoelpunten
|--------------------------------------------------------------------------
|
| 2 tegendoelpunten per 90 minuten:
|
| 2 / 2 × -1 = -1 punt
|
*/

assertApprox(
  'Keeper krijgt aftrek voor tegendoelpunten',
  GOALKEEPER.breakdown.goalsConceded,
  -1,
)

assertApprox(
  'Verdediger krijgt aftrek voor tegendoelpunten',
  DEFENDER.breakdown.goalsConceded,
  -1,
)

assertApprox(
  'Middenvelder krijgt geen aftrek voor tegendoelpunten',
  MIDFIELDER.breakdown.goalsConceded,
  0,
)

assertApprox(
  'Spits krijgt geen aftrek voor tegendoelpunten',
  FORWARD.breakdown.goalsConceded,
  0,
)

/*
|--------------------------------------------------------------------------
| Onderlinge controles
|--------------------------------------------------------------------------
*/

assertEqual(
  'Keepergoal is meer waard dan verdedigersgoal',
  GOALKEEPER.breakdown.goals >
    DEFENDER.breakdown.goals,
  true,
)

assertEqual(
  'Verdedigersgoal is meer waard dan middenveldersgoal',
  DEFENDER.breakdown.goals >
    MIDFIELDER.breakdown.goals,
  true,
)

assertEqual(
  'Middenveldersgoal is meer waard dan spitsengoal',
  MIDFIELDER.breakdown.goals >
    FORWARD.breakdown.goals,
  true,
)

console.log({
  GOALKEEPER,
  DEFENDER,
  MIDFIELDER,
  FORWARD,
})

/*
|--------------------------------------------------------------------------
| Batch en foutafhandeling
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== BATCH EN API TESTS =====',
)

/*
|--------------------------------------------------------------------------
| Batch
|--------------------------------------------------------------------------
*/

const batchResults =
  calculateExpectedPointsBatch([
    {
      playerData:
        PLAYER,

      history:
        HISTORY,

      fixture:
        FIXTURE,

      outlook:
        OUTLOOK,
    },

    {
      playerData: {
        ...PLAYER,

        id:
          'player-2',

        expectedMinutes:
          60,
      },

      history:
        HISTORY,

      fixture:
        FIXTURE,

      outlook:
        OUTLOOK,
    },
  ])

assertEqual(
  'Batch geeft twee projecties terug',
  batchResults.length,
  2,
)

assertEqual(
  'Eerste batchresultaat bevat expectedPoints',
  typeof batchResults[0]
    ?.expectedPoints,
  'number',
)

assertEqual(
  'Tweede batchresultaat bevat expectedPoints',
  typeof batchResults[1]
    ?.expectedPoints,
  'number',
)

assertEqual(
  'Lege batch geeft lege array',
  calculateExpectedPointsBatch(
    [],
  ).length,
  0,
)

assertEqual(
  'Ongeldige batch geeft lege array',
  calculateExpectedPointsBatch(
    null,
  ).length,
  0,
)

/*
|--------------------------------------------------------------------------
| Ongeldige invoer
|--------------------------------------------------------------------------
*/

assertEqual(
  'Ontbrekende playerData geeft null',
  calculateExpectedPoints({
    playerData:
      null,

    history:
      HISTORY,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  }),
  null,
)

assertEqual(
  'Ontbrekende history geeft null',
  calculateExpectedPoints({
    playerData:
      PLAYER,

    history:
      null,

    fixture:
      FIXTURE,

    outlook:
      OUTLOOK,
  }),
  null,
)

assertEqual(
  'Ontbrekende fixture geeft null',
  calculateExpectedPoints({
    playerData:
      PLAYER,

    history:
      HISTORY,

    fixture:
      null,

    outlook:
      OUTLOOK,
  }),
  null,
)

const noOutlook =
  calculateExpectedPoints({
    playerData:
      PLAYER,

    history:
      HISTORY,

    fixture:
      FIXTURE,

    outlook:
      null,
  })

assertEqual(
  'Ontbrekende outlook gebruikt neutrale correctie',
  typeof noOutlook
    ?.expectedPoints,
  'number',
)

assertApprox(
  'Ontbrekende outlook gebruikt modifier 1',
  noOutlook
    ?.modifiers
    ?.outlook,
  1,
)

/*
|--------------------------------------------------------------------------
| Interne consistentie
|--------------------------------------------------------------------------
*/

const breakdownTotal =
  Object.values(
    projection.breakdown,
  ).reduce(
    (
      total,
      value,
    ) =>
      total +
      Number(
        value,
      ),
    0,
  )

assertApprox(
  'Expected Points is gelijk aan de som van de breakdown',
  projection.expectedPoints,
  breakdownTotal,
  0.05,
)

assertEqual(
  'Alle breakdownwaarden zijn getallen',
  Object.values(
    projection.breakdown,
  ).every(
    (
      value,
    ) =>
      Number.isFinite(
        value,
      ),
  ),
  true,
)

assertEqual(
  'Expected Points is een eindig getal',
  Number.isFinite(
    projection.expectedPoints,
  ),
  true,
)

assertEqual(
  'Verwachte minuten blijven minimaal 0',
  projection.expectedMinutes >=
    0,
  true,
)

assertEqual(
  'Verwachte minuten blijven maximaal 90',
  projection.expectedMinutes <=
    90,
  true,
)

/*
|--------------------------------------------------------------------------
| Vergelijking scenario's
|--------------------------------------------------------------------------
*/

assertEqual(
  'Gunstige fixture scoort hoger dan moeilijke fixture',
  easyFixture.expectedPoints >
    hardFixture.expectedPoints,
  true,
)

assertEqual(
  'Hoge outlook scoort hoger dan lage outlook',
  highOutlook.expectedPoints >
    lowOutlook.expectedPoints,
  true,
)

assertEqual(
  'Halve speelkans levert minder punten dan volledige speelkans',
  halfChance.expectedPoints <
    projection.expectedPoints,
  true,
)

/*
|--------------------------------------------------------------------------
| Afronding
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== EXPECTED POINTS TESTS AFGEROND =====',
)

console.log({
  neutral:
    projection,

  noMinutes,

  halfChance,

  easyFixture,

  hardFixture,

  highOutlook,

  lowOutlook,

  batchResults,
})