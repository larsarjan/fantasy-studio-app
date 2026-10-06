/*
|--------------------------------------------------------------------------
| Season Transition Engine Tests
|--------------------------------------------------------------------------
*/

import {
  calculateSeasonTransition,
  calculateSeasonTransitionBatch,
  blendSeasonTransitionValue,
  getSeasonTransitionEngineInfo,
} from './seasonTransitionEngine.js'

console.clear()

console.log('')
console.log('==========================================')
console.log('SEASON TRANSITION TESTS')
console.log('==========================================')
console.log('')

function assert(condition, message) {
  if (condition) {
    console.log('✅', message)
  } else {
    console.error('❌', message)
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log('✅', message)
  } else {
    console.error('❌', message)
    console.log('Verwacht:', expected)
    console.log('Ontvangen:', actual)
  }
}

const preseasonHistory = {
  sample: {
    registeredMatches: 0,
    appearances: 0,
    starts: 0,
    substituteAppearances: 0,
    unusedSubstitutions: 0,
    minutes: 0,
  },
}

const preseason =
  calculateSeasonTransition(
    preseasonHistory,
  )

console.log(preseason)

assertEqual(
  preseason.role.preseasonPercentage,
  100,
  'Rol begint volledig preseason',
)

assertEqual(
  preseason.production.preseasonPercentage,
  100,
  'Productie begint volledig preseason',
)

assertEqual(
  preseason.role.currentSeasonPercentage,
  0,
  'Nog geen actuele rol',
)

assertEqual(
  preseason.production.currentSeasonPercentage,
  0,
  'Nog geen actuele productie',
)

console.log('')
console.log('==========================================')

/*
|--------------------------------------------------------------------------
| Actuele rolinformatie
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== ROLTRANSITIE =====',
)

const fourBenchMatchesHistory = {
  sample: {
    registeredMatches: 4,
    appearances: 0,
    starts: 0,
    substituteAppearances: 0,
    unusedSubstitutions: 4,
    minutes: 0,
  },
}

const fourBenchMatches =
  calculateSeasonTransition(
    fourBenchMatchesHistory,
  )

assertEqual(
  fourBenchMatches
    .role
    .currentSeasonPercentage,
  80,
  'Vier geregistreerde wedstrijden geven 80% actuele rolweging',
)

assertEqual(
  fourBenchMatches
    .role
    .preseasonPercentage,
  20,
  'Vier geregistreerde wedstrijden laten 20% preseason-rolweging over',
)

assertEqual(
  fourBenchMatches
    .production
    .currentSeasonPercentage,
  0,
  'Vier keer op de bank geeft nog geen actuele productieweging',
)

assertEqual(
  fourBenchMatches
    .production
    .preseasonPercentage,
  100,
  'Zonder minuten blijft productie volledig preseason',
)

assert(
  fourBenchMatches
    .explanation
    .some(
      (
        line,
      ) =>
        line.includes(
          '4 keer op de bank',
        ),
    ),
  'Uitleg benoemt vier ongebruikte invalbeurten',
)

/*
|--------------------------------------------------------------------------
| Vijf geregistreerde wedstrijden
|--------------------------------------------------------------------------
*/

const fiveRegisteredMatchesHistory = {
  sample: {
    registeredMatches: 5,
    appearances: 0,
    starts: 0,
    substituteAppearances: 0,
    unusedSubstitutions: 5,
    minutes: 0,
  },
}

const fiveRegisteredMatches =
  calculateSeasonTransition(
    fiveRegisteredMatchesHistory,
  )

assertEqual(
  fiveRegisteredMatches
    .role
    .currentSeasonPercentage,
  100,
  'Na vijf geregistreerde wedstrijden is de rol volledig actueel',
)

assertEqual(
  fiveRegisteredMatches
    .role
    .preseasonPercentage,
  0,
  'Na vijf geregistreerde wedstrijden vervalt preseason voor de rol',
)

assertEqual(
  fiveRegisteredMatches
    .production
    .currentSeasonPercentage,
  0,
  'Vijf bankbeurten zonder minuten geven nog steeds geen actuele productie',
)

/*
|--------------------------------------------------------------------------
| Actuele productie
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== PRODUCTIETRANSITIE =====',
)

const threeStartsHistory = {
  sample: {
    registeredMatches: 3,
    appearances: 3,
    starts: 3,
    substituteAppearances: 0,
    unusedSubstitutions: 0,
    minutes: 270,
  },
}

const threeStarts =
  calculateSeasonTransition(
    threeStartsHistory,
  )

assertEqual(
  threeStarts
    .role
    .currentSeasonPercentage,
  60,
  'Drie geregistreerde wedstrijden geven 60% actuele rolweging',
)

assertEqual(
  threeStarts
    .production
    .appearanceProgress,
  0.6,
  'Drie van vijf optredens geven 60% voortgang',
)

assertEqual(
  threeStarts
    .production
    .minutesProgress,
  0.6,
  '270 van 450 minuten geven 60% voortgang',
)

assertEqual(
  threeStarts
    .production
    .currentSeasonPercentage,
  60,
  'Drie volledige wedstrijden geven 60% actuele productieweging',
)

assertEqual(
  threeStarts
    .production
    .preseasonPercentage,
  40,
  'Drie volledige wedstrijden laten 40% preseason-productie over',
)

/*
|--------------------------------------------------------------------------
| Volledige actuele sample
|--------------------------------------------------------------------------
*/

const fullCurrentHistory = {
  sample: {
    registeredMatches: 5,
    appearances: 5,
    starts: 5,
    substituteAppearances: 0,
    unusedSubstitutions: 0,
    minutes: 450,
  },
}

const fullCurrent =
  calculateSeasonTransition(
    fullCurrentHistory,
  )

assertEqual(
  fullCurrent
    .role
    .currentSeasonPercentage,
  100,
  'Vijf wedstrijden geven volledige actuele rolweging',
)

assertEqual(
  fullCurrent
    .production
    .currentSeasonPercentage,
  100,
  'Vijf volledige wedstrijden geven volledige actuele productieweging',
)

assertEqual(
  fullCurrent
    .overall
    .currentSeasonPercentage,
  100,
  'Bij volledige samples is ook de algemene overgang 100% actueel',
)

/*
|--------------------------------------------------------------------------
| Blendhelper
|--------------------------------------------------------------------------
*/

console.log('')
console.log(
  '===== BLEND EN API =====',
)

const blendedProduction =
  blendSeasonTransitionValue({
    preseasonValue: 10,
    currentSeasonValue: 20,
    transition:
      threeStarts,
    type:
      'production',
  })

assertEqual(
  blendedProduction,
  16,
  'Productieblend gebruikt 40% preseason en 60% actueel',
)

const blendedRole =
  blendSeasonTransitionValue({
    preseasonValue: 80,
    currentSeasonValue: 40,
    transition:
      fourBenchMatches,
    type:
      'role',
  })

assertEqual(
  blendedRole,
  48,
  'Rolblend gebruikt 20% preseason en 80% actueel',
)

/*
|--------------------------------------------------------------------------
| Batch
|--------------------------------------------------------------------------
*/

const batchResults =
  calculateSeasonTransitionBatch([
    preseasonHistory,
    fourBenchMatchesHistory,
    fullCurrentHistory,
  ])

assertEqual(
  batchResults.length,
  3,
  'Batch geeft drie resultaten terug',
)

assertEqual(
  batchResults[0]
    .role
    .currentSeasonPercentage,
  0,
  'Eerste batchresultaat is volledig preseason',
)

assertEqual(
  batchResults[1]
    .role
    .currentSeasonPercentage,
  80,
  'Tweede batchresultaat bevat 80% actuele rolweging',
)

assertEqual(
  batchResults[2]
    .overall
    .currentSeasonPercentage,
  100,
  'Derde batchresultaat is volledig actueel',
)

assertEqual(
  calculateSeasonTransitionBatch(
    null,
  ).length,
  0,
  'Ongeldige batch geeft lege array',
)

/*
|--------------------------------------------------------------------------
| Engine-info
|--------------------------------------------------------------------------
*/

const engineInfo =
  getSeasonTransitionEngineInfo()

assertEqual(
  engineInfo.id,
  'season-transition-engine',
  'Engine-info bevat het juiste id',
)

assertEqual(
  engineInfo.supports
    .roleTransition,
  true,
  'Engine ondersteunt roltransitie',
)

assertEqual(
  engineInfo.supports
    .productionTransition,
  true,
  'Engine ondersteunt productietransitie',
)

assertEqual(
  engineInfo.supports
    .blending,
  true,
  'Engine ondersteunt blending',
)

console.log('')
console.log(
  '==========================================',
)

console.log(
  'SEASON TRANSITION TESTS AFGEROND',
)

console.log(
  '==========================================',
)

console.log({
  preseason,
  fourBenchMatches,
  threeStarts,
  fullCurrent,
  batchResults,
  engineInfo,
})