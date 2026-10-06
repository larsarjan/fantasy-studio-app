import {
  getDatabaseSummary,
  getPlayerProfiles,
} from '../database.js'

import {
  optimizeLineupForPeriod,
  optimizeLineupForRound,
} from './optimizerLineup.js'

import {
  optimizeSquadForPeriod,
  optimizeSquadForRound,
} from './optimizerSquad.js'

import {
  planSingleTransfers,
} from './optimizerTransferPlanner.js'

import {
  runSeasonSimulation,
} from './optimizerSeasonEngine.js'

import {
  planSeason,
} from './optimizerSeasonPlanner.js'

import {
  createSeasonPlanTimeline,
} from './optimizerSeasonTimeline.js'

/*
|--------------------------------------------------------------------------
| Optimizer Sandbox
|--------------------------------------------------------------------------
|
| Development/test sandbox — niet gebruiken als productie-orchestrator.
|
| De sandbox:
|
| - haalt alle spelers uit het actieve seizoen op;
| - laat optimizerSquad de beste geldige selectie samenstellen;
| - laat optimizerLineup de beste basisopstelling bepalen;
| - kiest captain en vice-captain;
| - toont de resultaten in de console;
| - geeft het volledige resultaat terug aan de Optimizer-pagina.
|
| De sandbox bevat zelf geen selectielogica en geen spelregels.
|
*/

/*
|--------------------------------------------------------------------------
| Status
|--------------------------------------------------------------------------
*/

let hasRunAutomatically =
  false

/*
|--------------------------------------------------------------------------
| Algemene helpers
|--------------------------------------------------------------------------
*/

function toNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

function normalizeStartRound(
  value,
) {
  return Math.max(
    1,
    Math.min(
      34,
      Math.round(
        Number(value) || 1,
      ),
    ),
  )
}

function normalizeRoundCount({
  startRound,
  roundCount,
}) {
  const maximumRoundCount =
    Math.max(
      1,
      Math.min(
        10,
        35 - startRound,
      ),
    )

  return Math.max(
    1,
    Math.min(
      maximumRoundCount,
      Math.round(
        Number(roundCount) || 1,
      ),
    ),
  )
}

function getPlayerName(
  player,
) {
  return (
    player?.name ||
    'Onbekende speler'
  )
}

function getPlayerClub(
  player,
) {
  return (
    player?.club ||
    'Onbekende club'
  )
}

/*
|--------------------------------------------------------------------------
| Actieve spelers ophalen
|--------------------------------------------------------------------------
*/

function getActiveSeasonPlayers() {
  const summary =
    getDatabaseSummary()

  const activeSeason =
    summary.activeSeason

  const profiles =
    getPlayerProfiles()

  const activePlayers =
    profiles.filter(
      (player) =>
        !activeSeason ||
        player.season ===
          activeSeason,
    )

  return {
    activeSeason,

    players:
      activePlayers,
  }
}

/*
|--------------------------------------------------------------------------
| Consolerij voor spelers
|--------------------------------------------------------------------------
*/

function createPlayerConsoleRow(
  candidate,
) {
  const player =
    candidate?.player ??
    candidate

  return {
    Naam:
      getPlayerName(
        player,
      ),

    Club:
      getPlayerClub(
        player,
      ),

    Positie:
      candidate?.position ??
      player?.fantasyPosition ??
      player?.position ??
      'Onbekend',

    Prijs:
      candidate?.price ??
      player?.currentPrice ??
      player?.endPrice ??
      player?.price ??
      0,

    xP:
      candidate?.expectedPoints ??
      0,

    xMin:
      candidate?.expectedMinutes ??
      0,

    FVT:
      candidate?.fvtFantasyScore ??
      player?.fvtFantasyScore ??
      0,
  }
}

/*
|--------------------------------------------------------------------------
| Consolepresentatie squad
|--------------------------------------------------------------------------
*/

function logSquadResult(
  squadResult,
) {
  if (
    !squadResult?.valid
  ) {
    console.error(
      'De Squad Optimizer is mislukt.',
    )

    squadResult
      ?.errors
      ?.forEach(
        (error) =>
          console.error(
            error,
          ),
      )

    squadResult
      ?.warnings
      ?.forEach(
        (warning) =>
          console.warn(
            warning,
          ),
      )

    return
  }

  const result =
    squadResult.result

  console.log(
    '✅ De Squad Optimizer werkt.',
  )

  console.log(
    'Squad geldig:',
    squadResult.validation
      ?.valid,
  )

  console.log(
    'Totale selectieprijs:',
    `€${toNumber(
      result.totalPrice,
    ).toFixed(1)} miljoen`,
  )

  console.log(
    'Resterend budget:',
    result.remainingBudget ===
      null
      ? 'Onbeperkt'
      : `€${toNumber(
          result.remainingBudget,
        ).toFixed(1)} miljoen`,
  )

  console.log(
    'Verwachte squad-xP:',
    result.expectedPoints,
  )

  console.log(
    'Verwachte squad-xP per speelronde:',
    result.expectedPointsPerRound,
  )

  console.log(
    'Clubverdeling:',
  )

  console.table(
    Object.entries(
      result.clubCounts ??
      {},
    )
      .sort(
        (
          left,
          right,
        ) =>
          right[1] -
            left[1] ||
          left[0].localeCompare(
            right[0],
            'nl-NL',
          ),
      )
      .map(
        (
          [
            club,
            amount,
          ],
        ) => ({
          Club:
            club,

          Spelers:
            amount,
        }),
      ),
  )

  console.log(
    'Gekozen selectie:',
  )

  console.table(
    result
      .candidates
      .map(
        createPlayerConsoleRow,
      ),
  )

  squadResult
    .warnings
    ?.forEach(
      (warning) =>
        console.warn(
          warning,
        ),
    )
}

/*
|--------------------------------------------------------------------------
| Consolepresentatie lineup
|--------------------------------------------------------------------------
*/

function logOptimizerResult(
  optimizerResult,
) {
  if (
    !optimizerResult?.valid
  ) {
    console.error(
      'De Lineup Optimizer is mislukt.',
    )

    optimizerResult
      ?.errors
      ?.forEach(
        (error) =>
          console.error(
            error,
          ),
      )

    return
  }

  const result =
    optimizerResult.result

  console.log(
    '✅ De Lineup Optimizer werkt.',
  )

  console.log(
    'Beste formatie:',
    result.formation,
  )

  console.log(
    'Verwachte basispunten:',
    result.baseExpectedPoints,
  )

  console.log(
    'Captainbonus:',
    result.captainBonus,
  )

  console.log(
    'Totale Expected Points:',
    result.expectedPoints,
  )

  if (
    result.expectedPointsPerRound !==
      null &&
    result.expectedPointsPerRound !==
      undefined
  ) {
    console.log(
      'Expected Points per speelronde:',
      result.expectedPointsPerRound,
    )
  }

  console.log(
    'Captain:',
    result
      .captain
      ?.player
      ?.name ??
      '—',
  )

  console.log(
    'Vice-captain:',
    result
      .viceCaptain
      ?.player
      ?.name ??
      '—',
  )

  console.log(
    'Basiself:',
  )

  console.table(
    result
      .starters
      .map(
        createPlayerConsoleRow,
      ),
  )

  console.log(
    'Bank:',
  )

  console.table(
    result
      .bench
      .ordered
      .map(
        createPlayerConsoleRow,
      ),
  )

  if (
    optimizerResult
      .alternatives
      ?.length
  ) {
    console.log(
      'Alternatieve formaties:',
    )

    console.table(
      optimizerResult
        .alternatives
        .map(
          (
            alternative,
          ) => ({
            Formatie:
              alternative
                .formation,

            xP:
              alternative
                .expectedPoints,

            Basispunten:
              alternative
                .baseExpectedPoints,

            Captain:
              alternative
                .captain
                ?.player
                ?.name ??
              '—',
          }),
        ),
    )
  }

  optimizerResult
    .warnings
    ?.forEach(
      (warning) =>
        console.warn(
          warning,
        ),
    )
}

/*
|--------------------------------------------------------------------------
| Publieke sandboxfunctie
|--------------------------------------------------------------------------
*/

export function runOptimizerSandbox({
  round,

  startRound =
    round ?? 1,

  roundCount = 1,

  request = null,

  injectBounidaRegressionScenario = false,
} = {}) {

  const normalizedStartRound =
    normalizeStartRound(
      startRound,
    )

  const normalizedRoundCount =
    normalizeRoundCount({
      startRound:
        normalizedStartRound,

      roundCount,
    })

  const {
    activeSeason,
    players,
  } =
    getActiveSeasonPlayers()

const managerPhilosophy = {
  ...request
    ?.philosophy,
}

const managerRules = {
  ...request
    ?.rules,
}

const minimumMoneyInBank =
  managerRules
    ?.minMoneyInBank
    ?.enabled
    ? Math.max(
        0,
        toNumber(
          managerRules
            .minMoneyInBank
            .value,
          0,
        ),
      )
    : 0

const squadBudget =
  Math.max(
    0,
    100 -
      minimumMoneyInBank,
  )

const maximumPlayersPerClub =
  managerRules
    ?.maxPlayersPerClub
    ?.enabled
    ? Math.max(
        1,
        Math.min(
          3,
          Math.round(
            toNumber(
              managerRules
                .maxPlayersPerClub
                .value,
              3,
            ),
          ),
        ),
      )
    : 3

const minimumPlayingChance =
  managerRules
    ?.minPlayingChance
    ?.enabled
    ? Math.max(
        0,
        Math.min(
          100,
          toNumber(
            managerRules
              .minPlayingChance
              .value,
            0,
          ),
        ),
      )
    : 0

  /*
   * Stap 1:
   *
   * Stel de beste geldige selectie
   * van vijftien spelers samen.
   */

  const squadResult =
  normalizedRoundCount === 1
    ? optimizeSquadForRound({
        players,

        round:
          normalizedStartRound,

        budget:
          squadBudget,

        philosophy:
          managerPhilosophy,

        maxPlayersPerClub:
          maximumPlayersPerClub,

        minPlayingChance:
          minimumPlayingChance,
      })
    : optimizeSquadForPeriod({
        players,

        startRound:
          normalizedStartRound,

        roundCount:
          normalizedRoundCount,

        budget:
          squadBudget,

        philosophy:
          managerPhilosophy,

        maxPlayersPerClub:
          maximumPlayersPerClub,

        minPlayingChance:
          minimumPlayingChance,
      })

console.log(
  '=== MANAGER → SQUAD OPTIMIZER ===',
)

console.log(
  'Managementfilosofie:',
  managerPhilosophy,
)

console.log(
  'Selectiebudget:',
  squadBudget,
)

console.log(
  'Minimaal geld op de bank:',
  minimumMoneyInBank,
)

console.log(
  'Maximaal spelers per club:',
  maximumPlayersPerClub,
)

console.log(
  'Minimale speelkans:',
  minimumPlayingChance,
)

  if (
    !squadResult.valid
  ) {
    console.group(
      [
        'Fantasy Studio Optimizer',
        activeSeason,
        'Squad Optimizer mislukt',
      ]
        .filter(Boolean)
        .join(' — '),
    )

    logSquadResult(
      squadResult,
    )

    console.groupEnd()

    return {
      valid: false,

      errors:
        squadResult.errors ??
        [
          'De Squad Optimizer kon geen geldige selectie samenstellen.',
        ],

      warnings:
        squadResult.warnings ??
        [],

      squadResult,

      period:
        squadResult.period,
    }
  }

  const period =
    squadResult.period

  const testSquad = {
    activeSeason,

    availablePlayers:
      players.length,

    squad:
      squadResult
        .result
        .squad,

    candidates:
      squadResult
        .result
        .candidates,

    positionCounts:
      squadResult
        .result
        .positionCounts,

    clubCounts:
      squadResult
        .result
        .clubCounts,

    totalPrice:
      squadResult
        .result
        .totalPrice,

    remainingBudget:
      squadResult
        .result
        .remainingBudget,

    startRound:
      period.startRound,

    endRound:
      period.endRound,

    roundCount:
      period.roundCount,

    rounds:
      period.rounds ??
      [],
  }

/*
|--------------------------------------------------------------------------
| Tijdelijke Coach Rapport-test
|--------------------------------------------------------------------------
|
| We verzwakken de optimale selectie door Godts te vervangen door Bounida.
| Het prijsverschil wordt aan de bank toegevoegd, zodat de planner Godts
| daarna weer legaal kan terugkopen.
|
*/

const godtsIndex =
  testSquad.squad.findIndex(
    (player) =>
      player.name ===
      'Godts',
  )

const bounida =
  players.find(
    (player) =>
      player.name ===
      'Bounida',
  )

if (
  injectBounidaRegressionScenario &&
  godtsIndex !== -1 &&
  bounida
) {
  const godts =
    testSquad.squad[
      godtsIndex
    ]

  const godtsPrice =
    Number(
      godts.currentPrice ??
      godts.endPrice ??
      godts.price ??
      godts.startPrice ??
      0,
    )

  const bounidaPrice =
    Number(
      bounida.currentPrice ??
      bounida.endPrice ??
      bounida.price ??
      bounida.startPrice ??
      0,
    )

  testSquad.squad[
    godtsIndex
  ] = bounida

  testSquad.remainingBudget =
    Math.round(
      (
        testSquad.remainingBudget +
        godtsPrice -
        bounidaPrice
      ) *
      10,
    ) /
    10

  console.log(
    '=== TIJDELIJKE TESTSELECTIE ===',
  )

  console.log(
    'Godts vervangen door Bounida',
  )

  console.log(
    'Prijs Godts:',
    godtsPrice,
  )

  console.log(
    'Prijs Bounida:',
    bounidaPrice,
  )

  console.log(
    'Aangepaste bank:',
    testSquad.remainingBudget,
  )
} else if (
  injectBounidaRegressionScenario
) {
  console.warn(
    'Tijdelijke test niet uitgevoerd: Godts of Bounida niet gevonden.',
  )
}

  const periodLabel =
    testSquad.roundCount === 1
      ? `Speelronde ${testSquad.startRound}`
      : `Speelronde ${testSquad.startRound} t/m ${testSquad.endRound}`

  console.group(
    [
      'Fantasy Studio Optimizer',
      activeSeason,
      periodLabel,
    ]
      .filter(Boolean)
      .join(' — '),
  )

  console.log(
    'Actief seizoen:',
    activeSeason ||
      'Onbekend',
  )

  console.log(
    'Beschikbare spelers:',
    players.length,
  )

  /*
   * Toon eerst de geselecteerde squad.
   */

  logSquadResult(
    squadResult,
  )

  /*
   * Stap 2:
   *
   * Bepaal binnen de gevonden squad
   * de beste basisopstelling, captain,
   * vice-captain en bankvolgorde.
   */

  const optimizerResult =
    testSquad.roundCount === 1
      ? optimizeLineupForRound({
          squad:
            testSquad.squad,

          round:
            testSquad.startRound,
        })
      : optimizeLineupForPeriod({
          squad:
            testSquad.squad,

          startRound:
            testSquad.startRound,

          roundCount:
            testSquad.roundCount,
        })

  logOptimizerResult(
    optimizerResult,
  )

/*
|--------------------------------------------------------------------------
| Stap 3:
|
| Test de Single Transfer Planner.
|--------------------------------------------------------------------------
*/

const transferPlannerResult =
  planSingleTransfers({
    currentSquad:
      testSquad.squad,

    playerPool:
      players,

    bank:
      testSquad.remainingBudget,

    availableFreeTransfers: 1,

    startRound:
      testSquad.startRound,

    roundCount:
      testSquad.roundCount,
  })

console.log(
  'TRANSFERPLANNER OBJECT:',
  transferPlannerResult,
)

console.log(
  '=== TRANSFER PLANNER ===',
)

console.log(
  'Valid:',
  transferPlannerResult.valid,
)

console.log(
  '=== COACH RAPPORT ===',
)

console.log(
  transferPlannerResult
    ?.result
    ?.bestOption
    ?.report,
)

console.log(
  'Errors:',
  transferPlannerResult.errors,
)

console.log(
  'Recommendation:',
  transferPlannerResult.result?.recommendation,
)

console.log(
  'Best option:',
  transferPlannerResult.result?.bestOption,
)

console.log(
  'Best transfer:',
  transferPlannerResult.result?.bestTransferOption,
)

console.log(
  'Statistics:',
  transferPlannerResult.result?.statistics,
)

/*
|--------------------------------------------------------------------------
| Stap 4:
|
| Test de Season Simulation Engine.
|--------------------------------------------------------------------------
*/

const seasonSimulationResult =
  runSeasonSimulation({
    request,

    players,

    squad:
      testSquad.squad,

    bank:
      testSquad.remainingBudget,

    freeTransfers:
      request
        ?.team
        ?.freeTransfers ??
      1,

    startRound:
      testSquad.startRound,

    roundCount:
      testSquad.roundCount,
  })

const seasonPlannerResult =
  planSeason({
    currentSquad: testSquad.squad,
    playerPool: players,
    bank: testSquad.remainingBudget,
    availableFreeTransfers: request?.team?.freeTransfers ?? 1,
    startRound: testSquad.startRound,
    roundCount: request?.period?.roundCount ?? roundCount,
    maximumRounds: request?.period?.roundCount ?? roundCount,
  })

const seasonPlan = createSeasonPlanTimeline({
  plannerResult: seasonPlannerResult,
})

console.log('=== SEASON PLAN TIMELINE ===')
console.log('Valid:', seasonPlan.valid)
console.log('Errors:', seasonPlan.errors)
console.log('Summary:', seasonPlan.summary)
console.table(
  seasonPlan.timeline.map((entry) => ({
    Speelronde: entry.round,
    Actie: entry.action.label,
    Bank: `${entry.finance.bankBefore} → ${entry.finance.bankAfter}`,
    VrijeTransfers: `${entry.transfers.freeTransfersBefore} → ${entry.transfers.nextFreeTransfers}`,
    xP: entry.points.expectedPoints,
    Strafpunten: entry.points.transferPointsCost,
    NettoXP: entry.points.netExpectedPoints,
    CumulatiefNettoXP: entry.points.cumulativeNetExpectedPoints,
    Formatie: entry.lineup.formation,
    Captain: entry.lineup.captain?.name ?? '—',
  })),
)

console.log(
  '=== SEASON SIMULATION ===',
)

console.log(
  'Valid:',
  seasonSimulationResult.valid,
)

console.log(
  'Errors:',
  seasonSimulationResult.errors,
)

console.log(
  'Warnings:',
  seasonSimulationResult.warnings,
)

console.log(
  'Period:',
  seasonSimulationResult.period,
)

console.log(
  'Summary:',
  seasonSimulationResult.summary,
)

console.log(
  'Starting state:',
  seasonSimulationResult.startingState,
)

console.log(
  'Final state:',
  seasonSimulationResult.finalState,
)

console.log(
  'Full season result:',
  seasonSimulationResult,
)

console.table(
  (
    seasonSimulationResult
      ?.rounds ??
    []
  ).map(
    (
      roundResult,
    ) => ({
      Speelronde:
        roundResult.round,

      Actie:
        roundResult.actionType,

      Uit:
        roundResult
          .transfer
          ?.playerOut
          ?.name ??
        '—',

      In:
        roundResult
          .transfer
          ?.playerIn
          ?.name ??
        '—',

      Captain:
        roundResult
          .lineup
          ?.captain
          ?.player
          ?.name ??
        '—',

      Formatie:
        roundResult
          .lineup
          ?.formation ??
        '—',

      xP:
        roundResult.expectedPoints,

      BankVoor:
        roundResult.bankBefore,

      BankNa:
        roundResult.bankAfter,

      VrijeTransfersVoor:
        roundResult
          .freeTransfersBefore,

      VrijeTransfersVolgendeRonde:
        roundResult
          .nextFreeTransfers,

      Strafpunten:
        roundResult
          .transferCost
          ?.pointsCost ??
        0,
    }),
  ),
)

  console.groupEnd()

  return {
    ...optimizerResult,

    squadResult,

    testSquad,

    transferPlannerResult,

    seasonSimulationResult,

    seasonPlannerResult,

    seasonPlan,

    period: {
      startRound:
        testSquad.startRound,

      endRound:
        testSquad.endRound,

      roundCount:
        testSquad.roundCount,

      rounds:
        testSquad.rounds,
    },
  }
}

/*
|--------------------------------------------------------------------------
| Eenmalige automatische test
|--------------------------------------------------------------------------
|
| Hiermee voorkomen we dat de test bij iedere rerender opnieuw wordt
| uitgevoerd.
|
*/

export function runOptimizerSandboxOnce({
  round,

  startRound =
    round ?? 1,

  roundCount = 1,

  enabled = false,
} = {}) {
  if (!enabled) {
    return null
  }

  if (
    hasRunAutomatically
  ) {
    return null
  }

  hasRunAutomatically =
    true

  return runOptimizerSandbox({
    startRound,
    roundCount,
  })
}
