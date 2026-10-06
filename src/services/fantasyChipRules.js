/* Canonieke, dependency-vrije chipregels voor rules engine en optimizer. */

export const FANTASY_CHIP_RULES_VERSION = '2026-2027-chip-v1'

export const FANTASY_CHIP_PERIODS = Object.freeze([
  Object.freeze({ id: 'period-1', startRound: 1, endRound: 17 }),
  Object.freeze({ id: 'period-2', startRound: 18, endRound: 34 }),
])

export const FANTASY_CHIP_RULES = Object.freeze({
  wildcard: Object.freeze({
    id: 'wildcard', label: 'Wildcard', aliases: ['wildcard'], usesPerPeriod: 1,
    unlimitedTransfers: true, unlimitedBudget: false,
    preservesStoredFreeTransfers: true, restorePreviousSquadAfterRound: false,
    cancelsTransferPointCosts: true, cancellableBeforeDeadline: false, temporary: false,
  }),
  'sugar-daddy': Object.freeze({
    id: 'sugar-daddy', label: 'Suikeroom', aliases: ['sugar-daddy', 'sugarDaddy'], usesPerPeriod: 1,
    unlimitedTransfers: true, unlimitedBudget: true,
    preservesStoredFreeTransfers: true, restorePreviousSquadAfterRound: true,
    transfersBeforeActivationAreTemporary: true, cancellableBeforeDeadline: false, temporary: true,
  }),
  attacking: Object.freeze({
    id: 'attacking', label: 'Aanvalluh!', aliases: ['attacking'], usesPerPeriod: 1,
    forwardsMultiplier: 2, captainDisabled: true,
    cancellableBeforeDeadline: true, temporary: true,
    assumptions: Object.freeze({
      scoringForwards: 'all-three-squad-forwards',
      automaticSubstitutionsSimulated: false,
      unavailableFixtureExpectedPoints: 0,
    }),
  }),
  'dynamic-duo': Object.freeze({
    id: 'dynamic-duo', label: 'Dynamisch Duo', aliases: ['dynamic-duo', 'dynamicDuo'], usesPerPeriod: 1,
    captainMultiplier: 3, viceCaptainMultiplier: 2,
    cancellableBeforeDeadline: true, temporary: true,
  }),
})

export const FANTASY_CHIP_IDS = Object.freeze(Object.keys(FANTASY_CHIP_RULES))
