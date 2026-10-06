export const FANTASY_LABELS = {
  'must-have': {
    label: 'Must-have',
    icon: '👑',
    className: 'must-have',
  },

  stabiel: {
    label: 'Stabiel',
    icon: '🟢',
    className: 'stable',
  },

  'hoog-plafond': {
    label: 'Hoog plafond',
    icon: '↗',
    className: 'high-ceiling',
  },

  budget: {
    label: 'Budget',
    icon: '💰',
    className: 'budget',
  },

  differential: {
    label: 'Differential',
    icon: '💎',
    className: 'differential',
  },

  standaardsituaties: {
    label: 'Standaardsituaties',
    icon: '🎯',
    className: 'set-pieces',
  },

  premium: {
    label: 'Premium',
    icon: '⭐',
    className: 'premium',
  },

  risico: {
    label: 'Risico',
    icon: '⚠',
    className: 'risk',
  },
}

export function getFantasyLabelMeta(labelKey) {
  return (
    FANTASY_LABELS[labelKey] || {
      label: labelKey,
      icon: '',
      className: 'unknown',
    }
  )
}