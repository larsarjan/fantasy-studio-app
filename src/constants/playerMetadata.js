export const PLAYER_ROLES = [
  'CB',
  'LB',
  'RB',
  'LWB',
  'RWB',
  'DM',
  'B2B',
  'AM',
  'LW',
  'RW',
  'SS',
  'ST',
]

export const PLAYER_ROLE_LABELS = {
  CB: 'Centrale verdediger',
  LB: 'Linksback',
  RB: 'Rechtsback',
  LWB: 'Linker wingback',
  RWB: 'Rechter wingback',
  DM: 'Controlerende middenvelder',
  B2B: 'Box-to-box middenvelder',
  AM: 'Aanvallende middenvelder',
  LW: 'Linksbuiten',
  RW: 'Rechtsbuiten',
  SS: 'Schaduwspits',
  ST: 'Spits',
}

export const PLAYER_STATUSES = [
  'Fit',
  'Twijfel',
  'Geblesseerd',
  'Geschorst',
]

export const PLAYER_STATUS_META = {
  Fit: {
    label: 'Fit',
    className: 'status-fit',
  },

  Twijfel: {
    label: 'Twijfelgeval',
    className: 'status-doubt',
  },

  Geblesseerd: {
    label: 'Geblesseerd',
    className: 'status-injured',
  },

  Geschorst: {
    label: 'Geschorst',
    className: 'status-suspended',
  },
}

export const FANTASY_POSITIONS = [
  'Keeper',
  'Verdediger',
  'Middenvelder',
  'Aanvaller',
]

export function parsePlayerRoles(value) {
  if (Array.isArray(value)) {
    return value
      .map((role) =>
        String(role || '')
          .trim()
          .toUpperCase(),
      )
      .filter((role) =>
        PLAYER_ROLES.includes(role),
      )
  }

  return String(value || '')
    .split(',')
    .map((role) =>
      role.trim().toUpperCase(),
    )
    .filter((role) =>
      PLAYER_ROLES.includes(role),
    )
}

export function getPlayerRoleLabel(role) {
  return (
    PLAYER_ROLE_LABELS[
      String(role || '')
        .trim()
        .toUpperCase()
    ] || role
  )
}

export function normalizePlayerStatus(status) {
  const normalizedStatus =
    String(status || '').trim()

  return PLAYER_STATUSES.includes(
    normalizedStatus,
  )
    ? normalizedStatus
    : 'Fit'
}

export function normalizePercentage(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return Math.max(
    0,
    Math.min(100, number),
  )
}

export function normalizeExpectedMinutes(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return Math.max(
    0,
    Math.min(90, number),
  )
}

export function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue =
    String(value || '')
      .trim()
      .toLowerCase()

  return [
    'true',
    'waar',
    'ja',
    'yes',
    '1',
  ].includes(normalizedValue)
}