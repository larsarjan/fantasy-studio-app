import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const initialNames = [
  'Spelers', 'CHIP_GEBRUIK', 'CHIP_DYNAMISCH_DUO', 'CHIP_AANVALLUH',
  'CHIP_SUIKEROOM', 'CHIP_WILDCARD', 'ELITE_FORMATIONS',
  'ELITE_CLUB_EXPOSURE', 'ELITE_MANAGERS', 'ELITE_TEAM_SNAPSHOTS',
  'ELITE_PLAYER_STATS', 'ELITE_TRANSFERS', 'ELITE_SYNC_CONTROLE',
  'ELITE_META', 'ESPN_SYNC_CONTROLE', 'PLAYER_METADATA',
  'PLAYER_MATCH_STATS', 'ESPN_MATCHSTATS_CONTROLE', 'Wedstrijden', 'Results',
  'SPELERS_HISTORIE', 'TEAM_RATINGS', 'Gespeeld door%',
]
const operationLog = []

class MockRange {
  constructor(sheet, row = 1, column = 1, numRows = 1, numColumns = 1) {
    this.sheet = sheet
    this.row = row
    this.column = column
    this.numRows = numRows
    this.numColumns = numColumns
  }
  merge() { return this }
  breakApart() { return this }
  setBackground() { return this }
  setFontColor() { return this }
  setFontSize() { return this }
  setFontWeight() { return this }
  setFontStyle() { return this }
  setHorizontalAlignment() { return this }
  setVerticalAlignment() { return this }
  setBorder() { return this }
  setWrap() { return this }
  insertCheckboxes() { this.sheet.checkboxes.add(`${this.row}:${this.column}`); return this }
  setValue(value) { return this.setValues([[value]]) }
  setValues(values) {
    values.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
      this.sheet.cells.set(`${this.row + rowOffset}:${this.column + columnOffset}`, value)
    }))
    return this
  }
  setNote(note) { this.sheet.notes.set(`${this.row}:${this.column}`, note); return this }
  getNote() { return this.sheet.notes.get(`${this.row}:${this.column}`) || '' }
  activate() {
    this.sheet.activeRange = this
    operationLog.push(`activate:${this.sheet.name}:A1`)
    return this
  }
  getSheet() { return this.sheet }
  getNumRows() { return this.numRows }
  getNumColumns() { return this.numColumns }
  getColumn() { return this.column }
}

class MockSheet {
  constructor(name, spreadsheet = null) {
    this.name = name
    this.spreadsheet = spreadsheet
    this.hidden = false
    this.cells = new Map()
    this.notes = new Map()
    this.checkboxes = new Set()
    this.activeRange = null
  }
  getName() { return this.name }
  showSheet() { this.hidden = false; operationLog.push(`show:${this.name}`); return this }
  hideSheet() {
    if (this.spreadsheet && this.spreadsheet.activeSheet === this) {
      throw new Error(`Actief tabblad ${this.name} mag niet worden verborgen.`)
    }
    this.hidden = true
    return this
  }
  isSheetHidden() { return this.hidden }
  clear() { this.cells.clear(); this.notes.clear(); this.checkboxes.clear(); return this }
  clearConditionalFormatRules() { return this }
  setHiddenGridlines() { return this }
  setFrozenRows() { return this }
  setColumnWidth() { return this }
  setRowHeight() { return this }
  getLastRow() { return Math.max(0, ...[...this.cells.keys()].map(key => Number(key.split(':')[0]))) }
  getMaxRows() { return 1000 }
  getMaxColumns() { return 26 }
  getRange(row, column, numRows, numColumns) {
    if (typeof row === 'string') return new MockRange(this)
    return new MockRange(this, row, column, numRows, numColumns)
  }
}

class MockSpreadsheet {
  constructor(names) {
    this.sheets = names.map(name => new MockSheet(name, this))
    this.activeSheet = this.sheets[0]
  }
  getSheets() { return this.sheets.slice() }
  getActiveSheet() { return this.activeSheet }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null }
  insertSheet(name) { const sheet = new MockSheet(name, this); this.sheets.push(sheet); return sheet }
  setActiveSheet(sheet) { this.activeSheet = sheet; operationLog.push(`setActive:${sheet.name}`); return sheet }
  moveActiveSheet(position) {
    this.sheets = this.sheets.filter(sheet => sheet !== this.activeSheet)
    this.sheets.splice(position - 1, 0, this.activeSheet)
  }
}

const spreadsheet = new MockSpreadsheet(initialNames)
const alerts = []
const userProperties = new Map()
const context = {
  console,
  SpreadsheetApp: {
    BorderStyle: { SOLID: 'SOLID' },
    getActiveSpreadsheet: () => spreadsheet,
    getUi: () => ({ alert: message => alerts.push(message) }),
    flush: () => operationLog.push('flush'),
  },
  PropertiesService: {
    getUserProperties: () => ({
      getProperty: key => userProperties.get(key) || null,
      setProperty: (key, value) => userProperties.set(key, value),
      deleteProperty: key => userProperties.delete(key),
    }),
  },
}

vm.createContext(context)
vm.runInContext(fs.readFileSync(new URL('../../docs/apps-script/FantasyStudioStart.gs', import.meta.url), 'utf8'), context)

context.setupFantasyStudioStartSheet()
assert.equal(spreadsheet.sheets.length, initialNames.length + 1)
assert.equal(spreadsheet.sheets[0].name, 'START')
assert.equal(spreadsheet.activeSheet.name, 'START')
assert.deepEqual(
  spreadsheet.sheets.filter(sheet => !sheet.hidden).map(sheet => sheet.name),
  ['START', 'Spelers', 'PLAYER_MATCH_STATS', 'Wedstrijden', 'Results'],
)

const start = spreadsheet.getSheetByName('START')
const inventory = [...start.cells.entries()]
  .filter(([key]) => key.endsWith(':1'))
  .map(([, value]) => value)
  .filter(value => initialNames.includes(value))
assert.deepEqual(new Set(inventory), new Set(initialNames))
assert.equal(inventory.length, initialNames.length)
assert.equal(start.checkboxes.size, initialNames.length)

context.setupFantasyStudioStartSheet()
assert.equal(spreadsheet.sheets.filter(sheet => sheet.name === 'START').length, 1)
assert.equal(start.checkboxes.size, initialNames.length)

const metadata = spreadsheet.getSheetByName('PLAYER_METADATA')
const metadataEntry = [...start.notes.entries()].find(([, note]) => note === 'FANTASY_STUDIO_OPEN:PLAYER_METADATA')
assert.ok(metadataEntry)
const [metadataKey] = metadataEntry
const [metadataRow, metadataColumn] = metadataKey.split(':').map(Number)
const metadataCheckbox = start.getRange(metadataRow, metadataColumn, 1, 1)

assert.equal(metadata.hidden, true)
operationLog.length = 0
metadataCheckbox.setValue(true)
context.onEdit({ range: metadataCheckbox, value: 'TRUE' })
assert.equal(metadata.hidden, false)
assert.equal(spreadsheet.activeSheet.name, 'PLAYER_METADATA')
assert.equal(metadata.activeRange.row, 1)
assert.equal(metadata.activeRange.column, 1)
assert.equal(start.cells.get(metadataKey), false)
assert.deepEqual(operationLog, [
  'show:PLAYER_METADATA', 'flush', 'setActive:PLAYER_METADATA',
  'activate:PLAYER_METADATA:A1', 'flush',
])

const playersSheet = spreadsheet.getSheetByName('Spelers')
spreadsheet.setActiveSheet(playersSheet)
context.onSelectionChange({ range: playersSheet.getRange('A1') })
assert.equal(metadata.hidden, true)
assert.equal(spreadsheet.activeSheet.name, 'Spelers')
assert.equal(start.cells.get(metadataKey), false)

spreadsheet.setActiveSheet(start)
metadataCheckbox.setValue(true)
context.onEdit({ range: metadataCheckbox, value: 'TRUE' })
spreadsheet.setActiveSheet(playersSheet)
context.onEdit({ range: playersSheet.getRange('A1'), value: 'bewerkt' })
assert.equal(metadata.hidden, true)

spreadsheet.setActiveSheet(start)
metadataCheckbox.setValue(true)
context.onEdit({ range: metadataCheckbox, value: 'TRUE' })
assert.equal(metadata.hidden, false)
operationLog.length = 0
assert.equal(context.goToFantasyStudioStart(), true)
assert.equal(spreadsheet.activeSheet.name, 'START')
assert.equal(start.activeRange.row, 1)
assert.equal(start.activeRange.column, 1)
assert.equal(metadata.hidden, true)
assert.equal(operationLog.at(-1), 'flush')
assert.deepEqual(
  spreadsheet.sheets.filter(sheet => !sheet.hidden).map(sheet => sheet.name),
  ['START', 'Spelers', 'PLAYER_MATCH_STATS', 'Wedstrijden', 'Results'],
)

assert.equal(context.openFantasyStudioSheet('BESTAAT_NIET'), false)
assert.equal(alerts.length, 1)

console.log('FantasyStudioStart Apps Script tests passed.')
