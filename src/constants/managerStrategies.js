export const MANAGER_STRATEGIES = [
  {
    id: 'recommended',

    name: 'Aanbevolen (FVT)',

    description:
      'Onze aanbevolen balans tussen verwachte punten, speelschema en zekerheid.',

    weights: {
      expectedPoints: 35,
      fixtures: 20,
      form: 15,
      flexibility: 10,
      teamValue: 10,
      risk: 5,
      benchStrength: 5,
    },
  },

  {
    id: 'shortTerm',

    name: 'Korte termijn',

    description:
      'Maximaliseer punten in de komende speelrondes.',

    weights: {
      expectedPoints: 30,
      fixtures: 30,
      form: 20,
      flexibility: 5,
      teamValue: 5,
      risk: 5,
      benchStrength: 5,
    },
  },

  {
    id: 'longTerm',

    name: 'Lange termijn',

    description:
      'Meer focus op stabiliteit en toekomstige waarde.',

    weights: {
      expectedPoints: 30,
      fixtures: 10,
      form: 10,
      flexibility: 20,
      teamValue: 15,
      risk: 10,
      benchStrength: 5,
    },
  },

  {
    id: 'budget',

    name: 'Budgetbewust',

    description:
      'Zo veel mogelijk waarde voor iedere geïnvesteerde miljoen.',

    weights: {
      expectedPoints: 25,
      fixtures: 15,
      form: 10,
      flexibility: 10,
      teamValue: 30,
      risk: 5,
      benchStrength: 5,
    },
  },

  {
    id: 'differentials',

    name: 'Differentials',

    description:
      'Meer ruimte voor verrassende keuzes met een hoog plafond.',

    weights: {
      expectedPoints: 30,
      fixtures: 20,
      form: 20,
      flexibility: 10,
      teamValue: 5,
      risk: 10,
      benchStrength: 5,
    },
  },
]