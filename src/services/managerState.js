import { compactManagerImport } from './managerPersistence.js'

export const managerTeamState = {
  mode: '',

  seasonPhase: 'preseason',

  seasonStatus: {
    phase: 'preseason',
    firstPlayableRound: 1,
  },

  importResult: null,

  bank: 0,
  bankKnown: false,
  plannedTransfers: [],

  freeTransfers: 1,

  purchasePrices: {},

  manualSellingPrices: {},

  chipStrategy: {
  mode: 'disabled',

  allowedChips: [
    'wildcard',
    'sugar-daddy',
    'attacking',
    'dynamic-duo',
  ],

  schedule: [],

  wildcardPlanning: {
    /*
    |--------------------------------------------------------------------------
    | Wildcardplanning
    |--------------------------------------------------------------------------
    |
    | hold:
    | De Wildcard wordt niet ingepland of geanalyseerd.
    |
    | advisory:
    | De Manager toont maximaal drie kansrijke momenten, maar neemt de
    | Wildcard niet automatisch mee in de volledige Beam Search.
    |
    | forced:
    | De gebruiker kiest zelf een ronde. Die ronde wordt vervolgens
    | volledig met Wildcard en alle vervolgrondes doorgerekend.
    |
    */

    mode: 'advisory',

    round: null,
  },

  state: {
    usedRounds: {},
  },
},
}

export function getManagerTeamState() {
  return {
    ...managerTeamState,

    seasonStatus: {
      ...managerTeamState.seasonStatus,
    },

    chipStrategy: structuredClone(managerTeamState.chipStrategy),

    importResult: compactManagerImport(managerTeamState.importResult),

    purchasePrices: {
      ...managerTeamState.purchasePrices,
    },

    manualSellingPrices: {
      ...managerTeamState.manualSellingPrices,
    },
  }
}

export const managerSettings = {
  philosophy: {
    expectedPoints: 35,
    fixtures: 20,
    form: 15,
    flexibility: 10,
    teamValue: 10,
    risk: 5,
    benchStrength: 5,
  },

  rules: {
    maxPlayersPerClub: {
      enabled: true,
      value: 3,
    },

    minPlayingChance: {
      enabled: true,
      value: 75,
    },

    maxTransferHit: {
      enabled: true,
      value: -8,
    },

    minMoneyInBank: {
      enabled: true,
      value: 0.5,
    },
  },

  planning: {
    startRound: 1,
    roundCount: 5,
  },
}

export function getManagerSettings() {
  return JSON.parse(
    JSON.stringify(
      managerSettings,
    ),
  )
}

export function restoreManagerState(state, settings) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Ongeldige teamgegevens')
  // Only restore known fields; never accept prototype keys or arbitrary executable configuration.
  for (const key of Object.keys(managerTeamState)) {
    if (Object.hasOwn(state, key)) managerTeamState[key] = structuredClone(state[key])
  }
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    for (const key of Object.keys(managerSettings)) {
      if (Object.hasOwn(settings, key)) managerSettings[key] = structuredClone(settings[key])
    }
  }
}

