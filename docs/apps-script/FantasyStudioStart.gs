const FANTASY_STUDIO_START_SHEET = 'START'
const FANTASY_STUDIO_TEMPORARY_SHEET_PROPERTY = 'FANTASY_STUDIO_TEMPORARY_SHEET'

const FANTASY_STUDIO_VISIBLE_SHEETS = Object.freeze([
  'START',
  'Spelers',
  'Wedstrijden',
  'PLAYER_MATCH_STATS',
  'Results',
])

const FANTASY_STUDIO_START_SECTIONS = Object.freeze([
  {
    title: 'DAGELIJKS GEBRUIK',
    sheets: [
      'Spelers',
      'Wedstrijden',
      'PLAYER_MATCH_STATS',
      'PLAYER_METADATA',
      'Results',
      'TEAM_RATINGS',
    ],
  },
  {
    title: 'TOPMANAGERS / ELITE DATA',
    sheets: [
      'ELITE_MANAGERS',
      'ELITE_TEAM_SNAPSHOTS',
      'ELITE_PLAYER_STATS',
      'ELITE_TRANSFERS',
      'ELITE_FORMATIONS',
      'ELITE_CLUB_EXPOSURE',
      'CHIP_GEBRUIK',
      'CHIP_DYNAMISCH_DUO',
      'CHIP_AANVALLUH',
      'CHIP_SUIKEROOM',
      'CHIP_WILDCARD',
    ],
  },
  {
    title: 'AUTOMATISERING & CONTROLE',
    sheets: [
      'ESPN_SYNC_CONTROLE',
      'ESPN_MATCHSTATS_CONTROLE',
      'ELITE_SYNC_CONTROLE',
      'ELITE_META',
    ],
  },
  {
    title: 'HISTORIE / ONDERSTEUNEND',
    sheets: [
      'SPELERS_HISTORIE',
      'Gespeeld door%',
    ],
  },
])

const FANTASY_STUDIO_SHEET_DESCRIPTIONS = Object.freeze({
  Spelers: 'Centrale spelersdatabase van het actuele en historische seizoen.',
  Wedstrijden: 'Wedstrijdschema, speelrondes en fixture-ID’s.',
  PLAYER_MATCH_STATS: 'Wedstrijdspecifieke spelersstatistieken per fixture.',
  PLAYER_METADATA: 'Aanvullende spelersmetadata voor Fantasy Studio.',
  Results: 'Wedstrijduitslagen en historische resultaten.',
  TEAM_RATINGS: 'Teamsterkte en ratings gebruikt door Fantasy Studio.',
  ELITE_MANAGERS: 'Ranglijst en rondegegevens van de gevolgde topmanagers.',
  ELITE_TEAM_SNAPSHOTS: 'Teamsamenstellingen van topmanagers per speelronde.',
  ELITE_PLAYER_STATS: 'Geaggregeerd bezit, basisplaatsen en captaincy binnen Elite-cohorten.',
  ELITE_TRANSFERS: 'Transferbewegingen van topmanagers tussen speelrondes.',
  ELITE_FORMATIONS: 'Formatieverdeling binnen de verschillende Elite-cohorten.',
  ELITE_CLUB_EXPOSURE: 'Clubspreiding en gemiddelde bezetting binnen Elite-teams.',
  CHIP_GEBRUIK: 'Centrale registratie van chipgebruik per ronde en cohort.',
  CHIP_DYNAMISCH_DUO: 'Presentatieoverzicht van het gebruik van Dynamisch Duo.',
  CHIP_AANVALLUH: 'Presentatieoverzicht van het gebruik van Aanvalluh!!.',
  CHIP_SUIKEROOM: 'Presentatieoverzicht van het gebruik van Suikeroom.',
  CHIP_WILDCARD: 'Presentatieoverzicht van het gebruik van Wildcard.',
  ESPN_SYNC_CONTROLE: 'Compact logboek van de algemene ESPN-datasynchronisatie.',
  ESPN_MATCHSTATS_CONTROLE: 'Controleoverzicht van verwerkte wedstrijdstatistieken.',
  ELITE_SYNC_CONTROLE: 'Status, dekking en fouten van de Elite Manager-sync.',
  ELITE_META: 'Technische voortgangs- en configuratiewaarden voor Elite-data.',
  SPELERS_HISTORIE: 'Historische spelerssnapshots voor ontwikkelingen door het seizoen.',
  'Gespeeld door%': 'Ondersteunende historische populariteitsgegevens van spelers.',
})

function setupFantasyStudioStartSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  const existingSheets = spreadsheet.getSheets()
  const existingNames = existingSheets.map(sheet => sheet.getName())
  let startSheet = spreadsheet.getSheetByName(FANTASY_STUDIO_START_SHEET)

  if (!startSheet) {
    startSheet = spreadsheet.insertSheet(FANTASY_STUDIO_START_SHEET)
  } else {
    startSheet.showSheet()
  }

  spreadsheet.setActiveSheet(startSheet)
  spreadsheet.moveActiveSheet(1)

  startSheet.getRange(
    1,
    1,
    Math.max(startSheet.getMaxRows(), 1),
    Math.max(startSheet.getMaxColumns(), 3),
  ).breakApart()
  startSheet.clear()
  startSheet.clearConditionalFormatRules()
  startSheet.setHiddenGridlines(true)
  startSheet.setFrozenRows(5)

  startSheet.getRange('A1:C1').merge()
    .setValue('FANTASY STUDIO')
    .setBackground('#12355b')
    .setFontColor('#ffffff')
    .setFontSize(20)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')

  startSheet.getRange('A2:C2').merge()
    .setValue('Database & automatisering')
    .setBackground('#12355b')
    .setFontColor('#dce9f5')
    .setFontSize(11)

  startSheet.getRange('A4:C4').merge()
    .setValue('AUTOMATISERING')
    .setBackground('#dbe8f4')
    .setFontColor('#12355b')
    .setFontWeight('bold')

  startSheet.getRange('A5:C5').merge()
    .setValue('Hoofdsync: dagelijks   •   Matchstats: iedere 6 uur   •   Elite Managers: iedere 6 uur')
    .setFontColor('#486581')
    .setFontSize(10)

  startSheet.getRange('A6:C6').merge()
    .setValue('Technisch tabblad geopend? Gebruik Fantasy Studio → 🏠 Naar START om terug te keren en technische tabs weer te verbergen.')
    .setBackground('#f7f9fc')
    .setFontColor('#486581')
    .setFontSize(10)
    .setFontStyle('italic')

  const inventoryNames = existingNames.filter(name => name !== FANTASY_STUDIO_START_SHEET)
  const sectionBySheet = createFantasyStudioSectionIndex_()
  const groupedNames = {}

  FANTASY_STUDIO_START_SECTIONS.forEach(section => {
    groupedNames[section.title] = []
  })
  groupedNames['OVERIG / TECHNISCH'] = []

  inventoryNames.forEach(name => {
    const section = sectionBySheet[name] || 'OVERIG / TECHNISCH'
    groupedNames[section].push(name)
  })

  const rows = []
  const sectionRows = []
  const headerRows = []
  const navigationRows = []
  const orderedSections = FANTASY_STUDIO_START_SECTIONS
    .map(section => section.title)
    .concat(['OVERIG / TECHNISCH'])

  orderedSections.forEach(sectionTitle => {
    const names = sortFantasyStudioSectionSheets_(sectionTitle, groupedNames[sectionTitle])
    if (!names.length) return

    sectionRows.push(rows.length + 7)
    rows.push([sectionTitle, '', ''])
    headerRows.push(rows.length + 7)
    rows.push(['Tabblad', 'Omschrijving', '☐ OPEN'])

    names.forEach(name => {
      navigationRows.push({
        row: rows.length + 7,
        sheetName: name,
      })
      rows.push([
        name,
        FANTASY_STUDIO_SHEET_DESCRIPTIONS[name] ||
          'Technisch of ondersteunend werkblad binnen Fantasy Studio.',
        false,
      ])
    })

    rows.push(['', '', ''])
  })

  if (rows.length) {
    startSheet.getRange(7, 1, rows.length, 3).setValues(rows)
  }

  sectionRows.forEach(row => {
    startSheet.getRange(row, 1, 1, 3).merge()
      .setBackground('#dbe8f4')
      .setFontColor('#12355b')
      .setFontWeight('bold')
  })

  headerRows.forEach(row => {
    startSheet.getRange(row, 1, 1, 3)
      .setBackground('#eef4f9')
      .setFontColor('#334e68')
      .setFontWeight('bold')
      .setBorder(false, false, true, false, false, false, '#bcccdc', SpreadsheetApp.BorderStyle.SOLID)
  })

  navigationRows.forEach((item, index) => {
    const range = startSheet.getRange(item.row, 1, 1, 3)
    range.setBackground(index % 2 === 0 ? '#ffffff' : '#f7f9fc')
    startSheet.getRange(item.row, 1).setFontWeight('bold').setFontColor('#243b53')
    startSheet.getRange(item.row, 2).setFontColor('#486581').setWrap(true)
    startSheet.getRange(item.row, 3)
      .insertCheckboxes()
      .setValue(false)
      .setFontColor('#1769aa')
      .setHorizontalAlignment('center')
      .setNote(`FANTASY_STUDIO_OPEN:${item.sheetName}`)
  })

  startSheet.setColumnWidth(1, 220)
  startSheet.setColumnWidth(2, 520)
  startSheet.setColumnWidth(3, 100)
  startSheet.setRowHeight(1, 34)
  startSheet.setRowHeight(2, 24)
  startSheet.getRange(1, 1, Math.max(startSheet.getLastRow(), 1), 3)
    .setVerticalAlignment('middle')

  applyFantasyStudioSheetVisibility_(spreadsheet)
  clearFantasyStudioTemporarySheet_()
  spreadsheet.setActiveSheet(startSheet)
  SpreadsheetApp.flush()
}

function openFantasyStudioSheet(sheetName) {
  const name = String(sheetName || '').trim()
  if (!name) return false

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  const targetSheet = spreadsheet.getSheetByName(name)
  if (!targetSheet) {
    SpreadsheetApp.getUi().alert(`Tabblad “${name}” bestaat niet.`)
    return false
  }

  targetSheet.showSheet()
  SpreadsheetApp.flush()
  spreadsheet.setActiveSheet(targetSheet)
  targetSheet.getRange('A1').activate()
  SpreadsheetApp.flush()

  if (spreadsheet.getActiveSheet().getName() !== name) {
    throw new Error(`Navigatie naar tabblad “${name}” is niet gelukt.`)
  }

  trackFantasyStudioTemporarySheet_(name)

  return true
}

function goToFantasyStudioStart() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  const startSheet = spreadsheet.getSheetByName(FANTASY_STUDIO_START_SHEET)
  if (!startSheet) {
    SpreadsheetApp.getUi().alert('Tabblad “START” bestaat niet.')
    return false
  }

  startSheet.showSheet()
  spreadsheet.setActiveSheet(startSheet)
  startSheet.getRange('A1').activate()
  SpreadsheetApp.flush()
  applyFantasyStudioSheetVisibility_(spreadsheet)
  clearFantasyStudioTemporarySheet_()
  SpreadsheetApp.flush()
  return true
}

function onEdit(event) {
  const range = event && event.range
  if (!range || range.getNumRows() !== 1 || range.getNumColumns() !== 1) return
  const sheetName = range.getSheet().getName()
  if (sheetName !== FANTASY_STUDIO_START_SHEET) {
    if (FANTASY_STUDIO_VISIBLE_SHEETS.includes(sheetName)) {
      hideFantasyStudioTemporarySheet_(SpreadsheetApp.getActiveSpreadsheet())
    }
    return
  }
  if (range.getColumn() !== 3 || String(event.value || '').toUpperCase() !== 'TRUE') return

  const note = String(range.getNote() || '')
  const prefix = 'FANTASY_STUDIO_OPEN:'
  if (!note.startsWith(prefix)) {
    range.setValue(false)
    return
  }

  try {
    openFantasyStudioSheet(note.slice(prefix.length))
  } finally {
    range.setValue(false)
  }
}

function onSelectionChange(event) {
  const range = event && event.range
  if (!range) return
  if (!FANTASY_STUDIO_VISIBLE_SHEETS.includes(range.getSheet().getName())) return

  hideFantasyStudioTemporarySheet_(SpreadsheetApp.getActiveSpreadsheet())
}

function createFantasyStudioSectionIndex_() {
  const result = {}
  FANTASY_STUDIO_START_SECTIONS.forEach(section => {
    section.sheets.forEach(name => {
      result[name] = section.title
    })
  })
  return result
}

function trackFantasyStudioTemporarySheet_(sheetName) {
  const properties = PropertiesService.getUserProperties()
  if (FANTASY_STUDIO_VISIBLE_SHEETS.includes(sheetName)) {
    hideFantasyStudioTemporarySheet_(SpreadsheetApp.getActiveSpreadsheet())
    return
  }

  const previousName = properties.getProperty(FANTASY_STUDIO_TEMPORARY_SHEET_PROPERTY)
  if (previousName && previousName !== sheetName) {
    const previousSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(previousName)
    if (previousSheet && !FANTASY_STUDIO_VISIBLE_SHEETS.includes(previousName)) {
      previousSheet.hideSheet()
    }
  }
  properties.setProperty(FANTASY_STUDIO_TEMPORARY_SHEET_PROPERTY, sheetName)
}

function hideFantasyStudioTemporarySheet_(spreadsheet) {
  const properties = PropertiesService.getUserProperties()
  const sheetName = properties.getProperty(FANTASY_STUDIO_TEMPORARY_SHEET_PROPERTY)
  if (!sheetName) return false

  const activeSheet = spreadsheet.getActiveSheet()
  if (activeSheet && activeSheet.getName() === sheetName) return false

  const sheet = spreadsheet.getSheetByName(sheetName)
  if (sheet && !FANTASY_STUDIO_VISIBLE_SHEETS.includes(sheetName)) sheet.hideSheet()
  properties.deleteProperty(FANTASY_STUDIO_TEMPORARY_SHEET_PROPERTY)
  return true
}

function clearFantasyStudioTemporarySheet_() {
  PropertiesService.getUserProperties().deleteProperty(
    FANTASY_STUDIO_TEMPORARY_SHEET_PROPERTY,
  )
}

function sortFantasyStudioSectionSheets_(sectionTitle, names) {
  const section = FANTASY_STUDIO_START_SECTIONS.find(item => item.title === sectionTitle)
  const preferredOrder = section ? section.sheets : []
  return (names || []).slice().sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left)
    const rightIndex = preferredOrder.indexOf(right)
    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1
      if (rightIndex < 0) return -1
      return leftIndex - rightIndex
    }
    return left.localeCompare(right, 'nl')
  })
}

function applyFantasyStudioSheetVisibility_(spreadsheet) {
  const visibleNames = new Set(FANTASY_STUDIO_VISIBLE_SHEETS)
  spreadsheet.getSheets().forEach(sheet => {
    if (visibleNames.has(sheet.getName())) {
      sheet.showSheet()
    } else {
      sheet.hideSheet()
    }
  })
}
