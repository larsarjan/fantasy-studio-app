import {
  calculateSellingPrice,
  getEffectiveSellingPrice,
  calculateTransferCost,
  calculateNextFreeTransfers,
  validateStartingLineup,
  validateSquad,
  validateChipUsage,
} from './fantasyGameRulesEngine.js'

function test(
  label,
  actual,
  expected,
) {
  const passed =
    JSON.stringify(actual) ===
    JSON.stringify(expected)

  console.log(
    passed
      ? `✅ ${label}`
      : `❌ ${label}`,
  )

  if (!passed) {
    console.log(
      'Verwacht:',
      expected,
    )

    console.log(
      'Ontvangen:',
      actual,
    )
  }
}

function createPlayer({
  id,
  club,
  position,
  price = 5,
}) {
  return {
    id,
    name:
      `Speler ${id}`,

    club,

    position,

    endPrice:
      price,
  }
}

console.log('')
console.log(
  '===== VERKOOPWAARDE =====',
)

test(
  'Winst €0,4 geeft €0,2 verkoopwinst',
  calculateSellingPrice({
    purchasePrice: 9.0,
    currentPrice: 9.4,
  }),
  9.2,
)

test(
  'Winst €0,3 wordt naar beneden afgerond',
  calculateSellingPrice({
    purchasePrice: 5.0,
    currentPrice: 5.3,
  }),
  5.1,
)

test(
  'Bij prijsdaling geldt actuele prijs',
  calculateSellingPrice({
    purchasePrice: 6.0,
    currentPrice: 5.7,
  }),
  5.7,
)

test(
  'Handmatige verkoopwaarde krijgt voorrang',
  getEffectiveSellingPrice({
    manualSellingPrice: 7.8,
    purchasePrice: 7.0,
    currentPrice: 8.0,
  }),
  7.8,
)

test(
  'Zonder aankoopprijs geldt actuele prijs',
  getEffectiveSellingPrice({
    manualSellingPrice: null,
    purchasePrice: null,
    currentPrice: 8.4,
  }),
  8.4,
)

console.log('')
console.log(
  '===== TRANSFERS =====',
)

test(
  '6 transfers met 2 gratis kosten 16 punten',
  calculateTransferCost({
    transfersMade: 6,
    availableFreeTransfers: 2,
  }).pointsCost,
  16,
)

test(
  'Wildcard voorkomt transferstraf',
  calculateTransferCost({
    transfersMade: 12,
    availableFreeTransfers: 1,
    wildcardActive: true,
  }).pointsCost,
  0,
)

test(
  'Suikeroom voorkomt transferstraf',
  calculateTransferCost({
    transfersMade: 12,
    availableFreeTransfers: 1,
    sugarDaddyActive: true,
  }).pointsCost,
  0,
)

test(
  'Gratis transfers kunnen niet boven 5 komen',
  calculateNextFreeTransfers({
    currentFreeTransfers: 5,
    transfersMade: 0,
  }),
  5,
)

test(
  'Gebruikte gratis transfer wordt aangevuld',
  calculateNextFreeTransfers({
    currentFreeTransfers: 3,
    transfersMade: 1,
  }),
  3,
)

test(
  'Wildcard behoudt opgeslagen transfers',
  calculateNextFreeTransfers({
    currentFreeTransfers: 4,
    transfersMade: 10,
    wildcardActive: true,
  }),
  4,
)

console.log('')
console.log(
  '===== GELDIGE SELECTIE =====',
)

const validSquad = [
  createPlayer({
    id: 'gk-1',
    club: 'Ajax',
    position: 'Doelman',
  }),

  createPlayer({
    id: 'gk-2',
    club: 'PSV',
    position: 'Doelman',
  }),

  ...Array.from(
    {
      length: 5,
    },
    (
      _,
      index,
    ) =>
      createPlayer({
        id:
          `def-${index + 1}`,

        club:
  [
    'Feyenoord',
    'FC Utrecht',
    'AZ',
    'FC Twente',
    'NEC',
  ][index],

        position:
          'Verdediger',
      }),
  ),

  ...Array.from(
    {
      length: 5,
    },
    (
      _,
      index,
    ) =>
      createPlayer({
        id:
          `mid-${index + 1}`,

        club:
          [
            'Ajax',
            'PSV',
            'Feyenoord',
            'FC Utrecht',
            'AZ',
          ][index],

        position:
          'Middenvelder',
      }),
  ),

  ...Array.from(
    {
      length: 3,
    },
    (
      _,
      index,
    ) =>
      createPlayer({
        id:
          `fwd-${index + 1}`,

        club:
          [
            'Ajax',
            'PSV',
            'Feyenoord',
          ][index],

        position:
          'Spits',
      }),
  ),
]

const validSquadResult =
  validateSquad(
    validSquad,
  )

test(
  '2-5-5-3-selectie is geldig',
  validSquadResult.valid,
  true,
)

test(
  'Geldige selectie bevat 15 spelers',
  validSquadResult.squadSize,
  15,
)

const fourFromOneClub =
  validSquad.map(
    (player) => ({
      ...player,
    }),
  )

fourFromOneClub[0].club =
  'Ajax'

fourFromOneClub[1].club =
  'Ajax'

fourFromOneClub[2].club =
  'Ajax'

fourFromOneClub[3].club =
  'Ajax'

test(
  '4 spelers van één club is ongeldig',
  validateSquad(
    fourFromOneClub,
  ).valid,
  false,
)

const tooExpensiveSquad =
  validSquad.map(
    (player) => ({
      ...player,
      endPrice:
        7,
    }),
  )

test(
  'Selectie boven €100 miljoen is ongeldig',
  validateSquad(
    tooExpensiveSquad,
  ).valid,
  false,
)

test(
  'Suikeroom staat onbeperkt budget toe',
  validateSquad(
    tooExpensiveSquad,
    {
      unlimitedBudget:
        true,
    },
  ).valid,
  true,
)

console.log('')
console.log(
  '===== FORMATIES =====',
)

const validLineup = [
  validSquad[0],

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Verdediger',
  ).slice(
    0,
    4,
  ),

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Middenvelder',
  ).slice(
    0,
    4,
  ),

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Spits',
  ).slice(
    0,
    2,
  ),
]

test(
  'Formatie 1-4-4-2 is geldig',
  validateStartingLineup(
    validLineup,
  ).valid,
  true,
)

const invalidTwoDefenders = [
  validSquad[0],

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Verdediger',
  ).slice(
    0,
    2,
  ),

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Middenvelder',
  ).slice(
    0,
    5,
  ),

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Spits',
  ).slice(
    0,
    3,
  ),
]

test(
  'Formatie met 2 verdedigers is ongeldig',
  validateStartingLineup(
    invalidTwoDefenders,
  ).valid,
  false,
)

const invalidNoForward = [
  validSquad[0],

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Verdediger',
  ).slice(
    0,
    5,
  ),

  ...validSquad.filter(
    (player) =>
      player.position ===
      'Middenvelder',
  ).slice(
    0,
    5,
  ),
]

test(
  'Formatie zonder spits is ongeldig',
  validateStartingLineup(
    invalidNoForward,
  ).valid,
  false,
)

console.log('')
console.log(
  '===== CHIPS =====',
)

test(
  'Aanvalluh mag in eerste seizoenshelft',
  validateChipUsage({
    chipId:
      'attacking',

    round:
      8,
  }).valid,
  true,
)

test(
  'Zelfde chip niet tweemaal per helft',
  validateChipUsage({
    chipId:
      'attacking',

    round:
      8,

    usedInFirstHalf: [
      'attacking',
    ],
  }).valid,
  false,
)

test(
  'Chip kan niet naast Wildcard',
  validateChipUsage({
    chipId:
      'dynamic-duo',

    round:
      12,

    wildcardActive:
      true,
  }).valid,
  false,
)

test(
  'Tweede helft gebruikt aparte chipvoorraad',
  validateChipUsage({
    chipId:
      'attacking',

    round:
      20,

    usedInFirstHalf: [
      'attacking',
    ],

    usedInSecondHalf:
      [],
  }).valid,
  true,
)

console.log('')
console.log(
  '===== TESTS AFGEROND =====',
)