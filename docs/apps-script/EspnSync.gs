const ESPN_BOOTSTRAP_URL =
  'https://fantasy.espngoal.nl/api/bootstrap-static/'

const ESPN_SYNC_SEASON =
  '2026/2027'

const ESPN_PLAYER_SHEET =
  'Spelers'


function syncEspnPlayerData(showAlert = true) {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet()

  const sheet =
    spreadsheet.getSheetByName(
      ESPN_PLAYER_SHEET,
    )

  if (!sheet) {
    throw new Error(
      `Tabblad "${ESPN_PLAYER_SHEET}" niet gevonden.`,
    )
  }

  const response =
    UrlFetchApp.fetch(
      ESPN_BOOTSTRAP_URL,
      {
        muteHttpExceptions: true,
      },
    )

  if (
    response.getResponseCode() !== 200
  ) {
    throw new Error(
      `ESPN kon niet worden geladen. HTTP ${response.getResponseCode()}`,
    )
  }

  const espnData =
    JSON.parse(
      response.getContentText(),
    )

  const espnPlayers =
    Array.isArray(
      espnData.elements,
    )
      ? espnData.elements
      : []

  const espnTeams =
    Array.isArray(
      espnData.teams,
    )
      ? espnData.teams
      : []

  const espnPositions =
    Array.isArray(
      espnData.element_types,
    )
      ? espnData.element_types
      : []

  if (!espnPlayers.length) {
    throw new Error(
      'ESPN gaf geen spelers terug.',
    )
  }

  const teamById =
    new Map()

  espnTeams.forEach(
    (team) => {
      teamById.set(
        Number(team.id),
        String(
          team.name ?? '',
        ).trim(),
      )
    },
  )

  const positionById =
    new Map()

  espnPositions.forEach(
    (position) => {
      positionById.set(
        Number(position.id),
        String(
          position.singular_name ?? '',
        ).trim(),
      )
    },
  )

  const lastRow =
    sheet.getLastRow()

  const lastColumn =
    sheet.getLastColumn()

  if (lastRow < 2) {
    throw new Error(
      'Het tabblad Spelers bevat geen spelers.',
    )
  }

  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn,
      )
      .getValues()

  const headers =
    values[0].map(
      (value) =>
        String(
          value ?? '',
        ).trim(),
    )

  const playerColumn =
    findRequiredColumn(
      headers,
      'Speler',
    )

  const seasonColumn =
    findRequiredColumn(
      headers,
      'Seizoen',
    )

  const positionColumn =
    findRequiredColumn(
      headers,
      'Positie',
    )

  const clubColumn =
    findRequiredColumn(
      headers,
      'Club',
    )

  const endPriceColumn =
    findRequiredColumn(
      headers,
      'Eindprijs',
    )

  const selectedColumn =
    findRequiredColumn(
      headers,
      'Gespeeld',
    )

  /*
   * ESPN-index maken.
   *
   * We koppelen op:
   * naam + club + positie
   *
   * Zowel web_name als volledige naam
   * worden als mogelijke naam opgeslagen.
   */
  const espnIndex =
    new Map()

  espnPlayers.forEach(
    (player) => {
      const club =
        teamById.get(
          Number(
            player.team,
          ),
        ) ?? ''

      const position =
        positionById.get(
          Number(
            player.element_type,
          ),
        ) ?? ''

      const possibleNames =
        new Set(
          [
            player.web_name,

            [
              player.first_name,
              player.second_name,
            ]
              .filter(Boolean)
              .join(' '),

            player.second_name,
          ]
            .map(normalizeText)
            .filter(Boolean),
        )

      possibleNames.forEach(
        (name) => {
          const key =
            createEspnPlayerKey(
              name,
              club,
              position,
            )

          if (!espnIndex.has(key)) {
            espnIndex.set(
              key,
              [],
            )
          }

          espnIndex
            .get(key)
            .push(player)
        },
      )
    },
  )

  const endPriceValues = []
  const selectedValues = []

  const unmatched = []
  const ambiguous = []

  let updatedPlayers = 0

  /*
   * Rij 1 bevat headers.
   */
  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex += 1
  ) {
    const row =
      values[rowIndex]

    const season =
      String(
        row[seasonColumn] ?? '',
      ).trim()

    const currentEndPrice =
      row[endPriceColumn]

    const currentSelected =
      row[selectedColumn]

    /*
     * Andere seizoenen absoluut
     * niet aanpassen.
     */
    if (
      season !==
      ESPN_SYNC_SEASON
    ) {
      endPriceValues.push(
        [currentEndPrice],
      )

      selectedValues.push(
        [currentSelected],
      )

      continue
    }

    const playerName =
      String(
        row[playerColumn] ?? '',
      ).trim()

    const club =
      String(
        row[clubColumn] ?? '',
      ).trim()

    const position =
      String(
        row[positionColumn] ?? '',
      ).trim()

    if (!playerName) {
      endPriceValues.push(
        [currentEndPrice],
      )

      selectedValues.push(
        [currentSelected],
      )

      continue
    }

    const key =
      createEspnPlayerKey(
        playerName,
        club,
        position,
      )

    const candidates =
      espnIndex.get(key) ?? []

    if (
      candidates.length === 0
    ) {
      /*
       * Geen betrouwbare match:
       * bestaande waarde behouden.
       */
      endPriceValues.push(
        [currentEndPrice],
      )

      selectedValues.push(
        [currentSelected],
      )

      unmatched.push(
        {
          player:
            playerName,

          club,

          position,

          row:
            rowIndex + 1,
        },
      )

      continue
    }

    if (
      candidates.length > 1
    ) {
      /*
       * Dubbele match:
       * niet gokken.
       */
      endPriceValues.push(
        [currentEndPrice],
      )

      selectedValues.push(
        [currentSelected],
      )

      ambiguous.push(
        {
          player:
            playerName,

          club,

          position,

          row:
            rowIndex + 1,
        },
      )

      continue
    }

    const espnPlayer =
      candidates[0]

    /*
     * ESPN now_cost:
     * 75 = â‚¬7,5 miljoen.
     */
    const endPrice =
      Number(
        espnPlayer.now_cost,
      ) / 10

    /*
     * ESPN selected_by_percent:
     * bijvoorbeeld "15.8".
     *
     * In de sheet slaan we dus 15,8 op,
     * niet 0,158.
     */
    const selected =
      Number(
        espnPlayer.selected_by_percent,
      )

    endPriceValues.push(
      [
        Number.isFinite(
          endPrice,
        )
          ? endPrice
          : currentEndPrice,
      ],
    )

    selectedValues.push(
      [
        Number.isFinite(
          selected,
        )
          ? selected
          : currentSelected,
      ],
    )

    updatedPlayers += 1
  }

  /*
   * Alleen de twee gewenste kolommen
   * terugschrijven.
   */
  sheet
    .getRange(
      2,
      endPriceColumn + 1,
      endPriceValues.length,
      1,
    )
    .setValues(
      endPriceValues,
    )

  sheet
    .getRange(
      2,
      selectedColumn + 1,
      selectedValues.length,
      1,
    )
    .setValues(
      selectedValues,
    )

  createEspnSyncControlSheet(
    spreadsheet,
    unmatched,
    ambiguous,
  )

  SpreadsheetApp.flush()

  const message = [
    'ESPN-synchronisatie voltooid.',
    '',
    `${updatedPlayers} spelers bijgewerkt.`,
    `${unmatched.length} spelers niet gekoppeld.`,
    `${ambiguous.length} spelers met meerdere mogelijke matches.`,
    '',
    'Bijgewerkt:',
    'â€¢ Eindprijs',
    'â€¢ Gespeeld',
  ].join('\n')

  if (showAlert) {
  SpreadsheetApp
    .getUi()
    .alert(
      message,
    )
}
}


function createEspnPlayerKey(
  playerName,
  club,
  position,
) {
  return [
    normalizeText(
      playerName,
    ),

    normalizeClub(
      club,
    ),

    normalizePosition(
      position,
    ),
  ].join('|')
}


function normalizeText(
  value,
) {
  return String(
    value ?? '',
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      '',
    )
}


function normalizeClub(
  value,
) {
  const club =
    normalizeText(
      value,
    )

  const aliases = {
  nec:
    'nec',

  'necnijmegen':
    'nec',

  'sccambuur':
    'sccambuur',

  'cambuurleeuwarden':
    'sccambuur',

  cambuur:
    'sccambuur',

  ado:
    'adodenhaag',

  'adodenhaag':
    'adodenhaag',
}
  return (
    aliases[club] ??
    club
  )
}


function normalizePosition(
  value,
) {
  const position =
    normalizeText(
      value,
    )

  const aliases = {
    gkp:
      'keeper',

    kee:
      'keeper',

    doelman:
      'keeper',

    keeper:
      'keeper',

    def:
      'verdediger',

    ver:
      'verdediger',

    verdediger:
      'verdediger',

    mid:
      'middenvelder',

    middenvelder:
      'middenvelder',

    fwd:
      'spits',

    spi:
      'spits',

    aanvaller:
      'spits',

    spits:
      'spits',
  }

  return (
    aliases[position] ??
    position
  )
}


function findRequiredColumn(
  headers,
  name,
) {
  const index =
    headers.findIndex(
      (header) =>
        normalizeText(
          header,
        ) ===
        normalizeText(
          name,
        ),
    )

  if (index === -1) {
    throw new Error(
      `Kolom "${name}" niet gevonden in tabblad Spelers.`,
    )
  }

  return index
}


function createEspnSyncControlSheet(
  spreadsheet,
  unmatched,
  ambiguous,
) {
  const sheetName =
    'ESPN_SYNC_CONTROLE'

  let sheet =
    spreadsheet.getSheetByName(
      sheetName,
    )

  if (!sheet) {
    sheet =
      spreadsheet.insertSheet(
        sheetName,
      )
  }

  sheet.clearContents()

  const rows = [
    [
      'Type',
      'Rij',
      'Speler',
      'Club',
      'Positie',
      'Actie',
    ],
  ]

  unmatched.forEach(
    (item) => {
      rows.push(
        [
          'Geen match',
          item.row,
          item.player,
          item.club,
          item.position,
          'Handmatig controleren',
        ],
      )
    },
  )

  ambiguous.forEach(
    (item) => {
      rows.push(
        [
          'Meerdere matches',
          item.row,
          item.player,
          item.club,
          item.position,
          'Handmatig controleren',
        ],
      )
    },
  )

  if (
    rows.length === 1
  ) {
    rows.push(
      [
        'OK',
        '',
        '',
        '',
        '',
        'Alle spelers betrouwbaar gekoppeld',
      ],
    )
  }

  sheet
    .getRange(
      1,
      1,
      rows.length,
      rows[0].length,
    )
    .setValues(
      rows,
    )

  sheet
    .getRange(
      1,
      1,
      1,
      rows[0].length,
    )
    .setFontWeight(
      'bold',
    )

  sheet.autoResizeColumns(
    1,
    rows[0].length,
  )
}

function onOpen() {
  const ui = SpreadsheetApp.getUi()
  ui
    .createMenu('Fantasy Studio')
    .addItem(
      'ðŸš€ Alles synchroniseren',
      'syncEverything',
    )
    .addSeparator()
    .addItem(
      'Alleen spelerdata synchroniseren',
      'syncEspnPlayerData',
    )
    .addItem(
      'Alleen laatste speelronde synchroniseren',
      'syncLatestCompletedEspnRound',
    )
    .addSeparator()
    .addItem(
      '🏠 Naar START',
      'goToFantasyStudioStart',
    )
    .addToUi()
}

function syncEspnMatchStatsRound2() {
  syncEspnMatchStatsForRound(2)
}


function syncEspnMatchStatsForRound(
  gameweek,
  showAlert = true,
) {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet()

  const playerSheet =
    spreadsheet.getSheetByName('Spelers')

  const fixtureSheet =
    spreadsheet.getSheetByName('Wedstrijden')

  const matchStatsSheet =
    spreadsheet.getSheetByName('PLAYER_MATCH_STATS')

  if (
    !playerSheet ||
    !fixtureSheet ||
    !matchStatsSheet
  ) {
    throw new Error(
      'Spelers, Wedstrijden of PLAYER_MATCH_STATS ontbreekt.',
    )
  }

  /*
   * ============================================================
   * 1. ESPN bootstrap ophalen
   * ============================================================
   */

  const bootstrapResponse =
    UrlFetchApp.fetch(
      ESPN_BOOTSTRAP_URL,
      {
        muteHttpExceptions: true,
      },
    )

  if (
    bootstrapResponse.getResponseCode() !== 200
  ) {
    throw new Error(
      `ESPN bootstrap kon niet worden geladen (${bootstrapResponse.getResponseCode()}).`,
    )
  }

  const bootstrap =
    JSON.parse(
      bootstrapResponse.getContentText(),
    )

  const espnPlayers =
    bootstrap.elements ?? []

  const espnTeams =
    bootstrap.teams ?? []

  const espnPositions =
    bootstrap.element_types ?? []

  /*
   * ============================================================
   * 2. ESPN teams + posities indexeren
   * ============================================================
   */

  const espnTeamById =
    new Map()

  espnTeams.forEach(
    (team) => {
      espnTeamById.set(
        Number(team.id),
        String(team.name ?? '').trim(),
      )
    },
  )

  const espnPositionById =
    new Map()

  espnPositions.forEach(
    (position) => {
      espnPositionById.set(
        Number(position.id),
        String(
          position.singular_name ?? '',
        ).trim(),
      )
    },
  )

  /*
   * ============================================================
   * 3. Eigen spelers uit tabblad Spelers lezen
   * ============================================================
   */

  const playerValues =
    playerSheet
      .getDataRange()
      .getValues()

  const playerHeaders =
    playerValues[0].map(
      (value) =>
        String(value ?? '').trim(),
    )

  const ownPlayerIdColumn =
    findRequiredColumn(
      playerHeaders,
      'Speler ID',
    )

  const ownPlayerNameColumn =
    findRequiredColumn(
      playerHeaders,
      'Speler',
    )

  const ownSeasonColumn =
    findRequiredColumn(
      playerHeaders,
      'Seizoen',
    )

  const ownPositionColumn =
    findRequiredColumn(
      playerHeaders,
      'Positie',
    )

  const ownClubColumn =
    findRequiredColumn(
      playerHeaders,
      'Club',
    )

  /*
   * Sleutel:
   * naam + club + positie
   */
  const ownPlayerIndex =
    new Map()

  for (
    let rowIndex = 1;
    rowIndex < playerValues.length;
    rowIndex += 1
  ) {
    const row =
      playerValues[rowIndex]

    const season =
      String(
        row[ownSeasonColumn] ?? '',
      ).trim()

    if (
      season !== ESPN_SYNC_SEASON
    ) {
      continue
    }

    const playerId =
      row[ownPlayerIdColumn]

    const playerName =
      String(
        row[ownPlayerNameColumn] ?? '',
      ).trim()

    const club =
      String(
        row[ownClubColumn] ?? '',
      ).trim()

    const position =
      String(
        row[ownPositionColumn] ?? '',
      ).trim()

    if (
      !playerId ||
      !playerName
    ) {
      continue
    }

    const key =
      createEspnPlayerKey(
        playerName,
        club,
        position,
      )

    if (!ownPlayerIndex.has(key)) {
      ownPlayerIndex.set(
        key,
        [],
      )
    }

    ownPlayerIndex
      .get(key)
      .push({
        playerId,
        playerName,
        club,
        position,
      })
  }

  /*
   * ============================================================
   * 4. ESPN speler â†’ eigen PlayerID koppelen
   * ============================================================
   */

  const espnToOwnPlayer =
    new Map()

  const unmatchedPlayers = []
  const ambiguousPlayers = []

  espnPlayers.forEach(
    (espnPlayer) => {
      const espnClub =
        espnTeamById.get(
          Number(
            espnPlayer.team,
          ),
        ) ?? ''

      const espnPosition =
        espnPositionById.get(
          Number(
            espnPlayer.element_type,
          ),
        ) ?? ''

      const possibleNames =
        new Set(
          [
            espnPlayer.web_name,

            [
              espnPlayer.first_name,
              espnPlayer.second_name,
            ]
              .filter(Boolean)
              .join(' '),

            espnPlayer.second_name,
          ]
            .map(normalizeText)
            .filter(Boolean),
        )

      const matches =
        new Map()

      possibleNames.forEach(
        (name) => {
          const key =
            createEspnPlayerKey(
              name,
              espnClub,
              espnPosition,
            )

          const candidates =
            ownPlayerIndex.get(key) ?? []

          candidates.forEach(
            (candidate) => {
              matches.set(
                String(
                  candidate.playerId,
                ),
                candidate,
              )
            },
          )
        },
      )

      const uniqueMatches =
        Array.from(
          matches.values(),
        )

      if (
        uniqueMatches.length === 1
      ) {
        espnToOwnPlayer.set(
          Number(
            espnPlayer.id,
          ),
          uniqueMatches[0],
        )

        return
      }

      if (
        uniqueMatches.length > 1
      ) {
        ambiguousPlayers.push([
          espnPlayer.id,
          espnPlayer.web_name,
          espnClub,
          espnPosition,
          'Meerdere mogelijke spelers',
        ])

        return
      }

      unmatchedPlayers.push([
        espnPlayer.id,
        espnPlayer.web_name,
        espnClub,
        espnPosition,
        'Niet aanwezig / niet betrouwbaar gekoppeld',
      ])
    },
  )

  /*
   * ============================================================
   * 5. ESPN-fixtures van deze speelronde ophalen
   * ============================================================
   */

  const fixtureResponse =
    UrlFetchApp.fetch(
      `https://fantasy.espngoal.nl/api/fixtures/?event=${gameweek}`,
      {
        muteHttpExceptions: true,
      },
    )

  if (
    fixtureResponse.getResponseCode() !== 200
  ) {
    throw new Error(
      `ESPN fixtures voor SR${gameweek} konden niet worden geladen.`,
    )
  }

  const espnFixtures =
    JSON.parse(
      fixtureResponse.getContentText(),
    )

  const finishedEspnFixtures =
    getFinishedEspnFixtures(
      espnFixtures,
    )

  const finishedEspnFixtureIds =
    new Set(
      finishedEspnFixtures.map(
        (fixture) =>
          Number(fixture.id),
      ),
    )

  /*
   * ============================================================
   * 6. Eigen Wedstrijden-tabblad koppelen
   *
   * BELANGRIJK:
   * Niet op ESPN-fixturenummer koppelen.
   *
   * We gebruiken:
   * speelronde + thuisclub + uitclub.
   * ============================================================
   */

  const fixtureValues =
    fixtureSheet
      .getDataRange()
      .getValues()

  const fixtureHeaders =
    fixtureValues[0].map(
      (value) =>
        String(value ?? '').trim(),
    )

  const fixtureIdColumn =
    findRequiredColumn(
      fixtureHeaders,
      'ID',
    )

  const fixtureSeasonColumn =
    findRequiredColumn(
      fixtureHeaders,
      'Seizoen',
    )

  const fixtureRoundColumn =
    findRequiredColumn(
      fixtureHeaders,
      'Speelronde',
    )

  const fixtureHomeColumn =
    findRequiredColumn(
      fixtureHeaders,
      'Thuisclub',
    )

  const fixtureAwayColumn =
    findRequiredColumn(
      fixtureHeaders,
      'Uitclub',
    )

  const ownFixtureIndex =
    new Map()

  for (
    let rowIndex = 1;
    rowIndex < fixtureValues.length;
    rowIndex += 1
  ) {
    const row =
      fixtureValues[rowIndex]

    const season =
      String(
        row[fixtureSeasonColumn] ?? '',
      ).trim()

    const round =
      Number(
        row[fixtureRoundColumn],
      )

    if (
      season !== ESPN_SYNC_SEASON ||
      round !== Number(gameweek)
    ) {
      continue
    }

    const fixtureId =
      String(
        row[fixtureIdColumn] ?? '',
      ).trim()

    const homeClub =
      String(
        row[fixtureHomeColumn] ?? '',
      ).trim()

    const awayClub =
      String(
        row[fixtureAwayColumn] ?? '',
      ).trim()

    const key =
      createFixtureKey(
        gameweek,
        homeClub,
        awayClub,
      )

    ownFixtureIndex.set(
      key,
      fixtureId,
    )
  }

  /*
   * ESPN fixture-ID â†’ Fantasy Studio FixtureId
   */
  const espnFixtureToOwnFixture =
    new Map()

  const unmatchedFixtures = []

  finishedEspnFixtures.forEach(
    (fixture) => {
      const homeClub =
        espnTeamById.get(
          Number(
            fixture.team_h,
          ),
        ) ?? ''

      const awayClub =
        espnTeamById.get(
          Number(
            fixture.team_a,
          ),
        ) ?? ''

      const key =
        createFixtureKey(
          gameweek,
          homeClub,
          awayClub,
        )

      const ownFixtureId =
        ownFixtureIndex.get(key)

      if (ownFixtureId) {
        espnFixtureToOwnFixture.set(
          Number(
            fixture.id,
          ),
          ownFixtureId,
        )
      } else {
        unmatchedFixtures.push([
          fixture.id,
          homeClub,
          awayClub,
          `Geen FixtureId gevonden voor SR${gameweek}`,
        ])
      }
    },
  )

  if (!finishedEspnFixtures.length) {
    writeEspnMatchStatsControl(
      spreadsheet,
      gameweek,
      0,
      0,
      0,
      unmatchedPlayers,
      ambiguousPlayers,
      unmatchedFixtures,
    )

    if (showAlert) {
      SpreadsheetApp.getUi().alert(
        `SR${gameweek} bevat nog geen individueel afgeronde fixtures.`,
      )
    }

    return
  }

  /*
   * ============================================================
   * 7. Fixturegebonden live-data ophalen
   *
   * Dit endpoint bevat dezelfde benodigde velden
   * per ESPN fixture-ID en ondersteunt daardoor DGW's.
   * ============================================================
   */

  const liveResponse =
    UrlFetchApp.fetch(
      `https://fantasy.espngoal.nl/api/event/${gameweek}/live/`,
      {
        muteHttpExceptions: true,
      },
    )

  if (liveResponse.getResponseCode() !== 200) {
    throw new Error(
      `ESPN live-data voor SR${gameweek} kon niet worden geladen.`,
    )
  }

  const liveData =
    JSON.parse(
      liveResponse.getContentText(),
    )

  const liveByPlayerId =
    new Map(
      (liveData.elements ?? []).map(
        (element) => [
          Number(element.id),
          element,
        ],
      ),
    )

  /*
   * ============================================================
   * 8. Gewenste PLAYER_MATCH_STATS-regels bouwen
   * ============================================================
   */

  const generatedRows = []

  espnPlayers.forEach(
    (espnPlayer) => {
      const ownPlayer =
        espnToOwnPlayer.get(
          Number(
            espnPlayer.id,
          ),
        )

      if (!ownPlayer) {
        return
      }

      const livePlayer =
        liveByPlayerId.get(
          Number(
            espnPlayer.id,
          ),
        )

      if (!livePlayer) {
        return
      }

      const history =
        Array.isArray(
          livePlayer.explain,
        )
          ? livePlayer.explain
          : []

      const roundHistory =
        history.filter(
          (historyItem) =>
            finishedEspnFixtureIds.has(
              Number(
                historyItem.fixture,
              ),
            ),
        )

      roundHistory.forEach(
        (historyItem) => {
          const historyStats =
            createEspnFixtureStats(
              historyItem.stats,
            )

          const ownFixtureId =
            espnFixtureToOwnFixture.get(
              Number(
                historyItem.fixture,
              ),
            )

          if (!ownFixtureId) {
            return
          }

          const minutes =
            Number(
              historyStats.minutes ?? 0,
            )

          let automaticStatus = ''

          if (minutes >= 60) {
            automaticStatus =
              'Basis'
          } else if (minutes > 0) {
            automaticStatus =
              'Wissel'
          }

          generatedRows.push({
            playerId:
              ownPlayer.playerId,

            playerName:
              ownPlayer.playerName,

            season:
              ESPN_SYNC_SEASON,

            gameweek:
              Number(gameweek),

            fixtureId:
              ownFixtureId,

            automaticStatus,

            minutes,

            goals:
              Number(
                historyStats.goals_scored ?? 0,
              ),

            assists:
              Number(
                historyStats.assists ?? 0,
              ),

            bonus:
              Number(
                historyStats.bonus ?? 0,
              ),

            cleanSheet:
              Number(
                historyStats.clean_sheets ?? 0,
              ),

            goalsConceded:
              Number(
                historyStats.goals_conceded ?? 0,
              ),

            saves:
              Number(
                historyStats.saves ?? 0,
              ),

            penaltiesSaved:
              Number(
                historyStats.penalties_saved ?? 0,
              ),

            penaltyMissed:
              Number(
                historyStats.penalties_missed ?? 0,
              ),

            ownGoals:
              Number(
                historyStats.own_goals ?? 0,
              ),

            yellowCards:
              Number(
                historyStats.yellow_cards ?? 0,
              ),

            redCards:
              Number(
                historyStats.red_cards ?? 0,
              ),
          })
        },
      )
    },
  )

  /*
   * ============================================================
   * 9. Bestaande PLAYER_MATCH_STATS lezen
   *
   * Hierdoor kan dezelfde sync later opnieuw draaien
   * zonder dubbele regels te maken.
   * ============================================================
   */

  const existingValues =
    matchStatsSheet
      .getDataRange()
      .getValues()

  const headers =
    existingValues[0].map(
      (value) =>
        String(value ?? '').trim(),
    )

  const msPlayerIdColumn =
    findRequiredColumn(
      headers,
      'Speler ID',
    )

  const msSeasonColumn =
    findRequiredColumn(
      headers,
      'Seizoen',
    )

  const msGameweekColumn =
    findRequiredColumn(
      headers,
      'Gameweek',
    )

  const msFixtureColumn =
    findRequiredColumn(
      headers,
      'FixtureId',
    )

  const msStatusColumn =
    findRequiredColumn(
      headers,
      'Status',
    )

  const msNoteColumn =
    findRequiredColumn(
      headers,
      'Notitie',
    )

  const existingRowByKey =
    new Map()

  for (
    let rowIndex = 1;
    rowIndex < existingValues.length;
    rowIndex += 1
  ) {
    const row =
      existingValues[rowIndex]

    const key =
      createMatchStatsKey(
        row[msPlayerIdColumn],
        row[msSeasonColumn],
        row[msGameweekColumn],
        row[msFixtureColumn],
      )

    existingRowByKey.set(
      key,
      {
        sheetRow:
          rowIndex + 1,

        values:
          row,
      },
    )
  }

  /*
   * ============================================================
   * 10. Updates + nieuwe rijen voorbereiden
   * ============================================================
   */

  const newRows = []

  let updatedRows = 0

  generatedRows.forEach(
    (generated) => {
      const key =
        createMatchStatsKey(
          generated.playerId,
          generated.season,
          generated.gameweek,
          generated.fixtureId,
        )

      const existing =
        existingRowByKey.get(key)

      /*
       * Bestaande handmatige Status behouden.
       * Alleen automatisch invullen wanneer hij leeg is.
       */
      let status =
        generated.automaticStatus

      let note = ''

      if (existing) {
        const existingStatus =
          String(
            existing.values[
              msStatusColumn
            ] ?? '',
          ).trim()

        if (existingStatus) {
          status =
            existingStatus
        }

        note =
          existing.values[
            msNoteColumn
          ] ?? ''

        const rowValues = [
          generated.playerId,
          generated.playerName,
          generated.season,
          generated.gameweek,
          generated.fixtureId,
          status,
          generated.minutes,
          generated.goals,
          generated.assists,
          generated.bonus,
          generated.cleanSheet,
          generated.goalsConceded,
          generated.saves,
          generated.penaltiesSaved,
          generated.penaltyMissed,
          generated.ownGoals,
          generated.yellowCards,
          generated.redCards,
          true,
          note,
        ]

        matchStatsSheet
          .getRange(
            existing.sheetRow,
            1,
            1,
            20,
          )
          .setValues([
            rowValues,
          ])

        updatedRows += 1

        return
      }

      newRows.push([
        generated.playerId,
        generated.playerName,
        generated.season,
        generated.gameweek,
        generated.fixtureId,
        status,
        generated.minutes,
        generated.goals,
        generated.assists,
        generated.bonus,
        generated.cleanSheet,
        generated.goalsConceded,
        generated.saves,
        generated.penaltiesSaved,
        generated.penaltyMissed,
        generated.ownGoals,
        generated.yellowCards,
        generated.redCards,
        true,
        '',
      ])
    },
  )

  /*
   * Nieuwe regels in Ã©Ã©n batch toevoegen.
   */
  if (newRows.length) {
    matchStatsSheet
      .getRange(
        matchStatsSheet.getLastRow() + 1,
        1,
        newRows.length,
        20,
      )
      .setValues(
        newRows,
      )
  }

  /*
   * ============================================================
   * 11. Controleblad maken
   * ============================================================
   */

  writeEspnMatchStatsControl(
    spreadsheet,
    gameweek,
    generatedRows.length,
    newRows.length,
    updatedRows,
    unmatchedPlayers,
    ambiguousPlayers,
    unmatchedFixtures,
  )

  SpreadsheetApp.flush()

  if (showAlert) {
  SpreadsheetApp
    .getUi()
    .alert(
      [
        `ESPN matchstats SR${gameweek} voltooid.`,
        '',
        `${generatedRows.length} gekoppelde wedstrijdregels gevonden.`,
        `${newRows.length} nieuwe regels toegevoegd.`,
        `${updatedRows} bestaande regels bijgewerkt.`,
        '',
        `${unmatchedPlayers.length} ESPN-spelers zonder koppeling.`,
        `${unmatchedFixtures.length} fixtures zonder koppeling.`,
      ].join('\n'),
    )
}
}


function getFinishedEspnFixtures(fixtures) {
  return (Array.isArray(fixtures) ? fixtures : []).filter(
    (fixture) => fixture && (fixture.finished === true || fixture.finished_provisional === true) && Number.isFinite(Number(fixture.id)) && Number.isFinite(Number(fixture.event)),
  )
}


function createEspnFixtureStats(stats) {
  const result = {}
  ;(Array.isArray(stats) ? stats : []).forEach((stat) => {
    const identifier = String(stat.identifier ?? '').trim()
    if (identifier) result[identifier] = Number(result[identifier] ?? 0) + Number(stat.value ?? 0)
  })
  return result
}


function selectAutomaticMatchStatsRounds(fixtures, events, storedSignatures = {}, recentRoundCount = 3) {
  const finishedByRound = new Map()
  ;(Array.isArray(fixtures) ? fixtures : []).forEach((fixture) => {
    const round = Number(fixture?.event)
    if (Number.isFinite(round) && round > 0 && !finishedByRound.has(round)) finishedByRound.set(round, [])
  })
  getFinishedEspnFixtures(fixtures).forEach((fixture) => {
    const round = Number(fixture.event)
    if (!finishedByRound.has(round)) finishedByRound.set(round, [])
    finishedByRound.get(round).push(Number(fixture.id))
  })
  const currentRound = Number((events ?? []).find((event) => event.is_current === true)?.id) || Math.max(0, ...finishedByRound.keys())
  const firstRecentRound = Math.max(1, currentRound - Math.max(1, Number(recentRoundCount) || 3) + 1)
  const signatures = {}; const rounds = []
  Array.from(finishedByRound.entries()).sort((left, right) => left[0] - right[0]).forEach(([round, fixtureIds]) => {
    const signature = fixtureIds.sort((left, right) => left - right).join(',')
    signatures[round] = signature
    const wasObserved = Object.prototype.hasOwnProperty.call(storedSignatures, round)
    if (signature && (round >= firstRecentRound || wasObserved && String(storedSignatures[round] ?? '') !== signature)) rounds.push(round)
  })
  return { rounds, signatures, currentRound }
}


function syncMatchStatsAutomatic() {
  const bootstrapResponse = UrlFetchApp.fetch(ESPN_BOOTSTRAP_URL, { muteHttpExceptions: true })
  const fixtureResponse = UrlFetchApp.fetch('https://fantasy.espngoal.nl/api/fixtures/', { muteHttpExceptions: true })
  if (bootstrapResponse.getResponseCode() !== 200 || fixtureResponse.getResponseCode() !== 200) throw new Error('ESPN bootstrap of fixtures konden niet worden geladen voor de automatische matchstats-sync.')
  const bootstrap = JSON.parse(bootstrapResponse.getContentText()), fixtures = JSON.parse(fixtureResponse.getContentText()), properties = PropertiesService.getScriptProperties(), propertyKey = `ESPN_MATCH_STATS_FINISHED_FIXTURES_${ESPN_SYNC_SEASON}`
  let storedSignatures = {}
  try { storedSignatures = JSON.parse(properties.getProperty(propertyKey) || '{}') } catch (error) { console.warn('Ongeldige matchstats-signaturecache wordt opnieuw opgebouwd.', error) }
  const selection = selectAutomaticMatchStatsRounds(fixtures, bootstrap.events ?? [], storedSignatures, 3), completedSignatures = { ...storedSignatures }, errors = []
  Object.keys(selection.signatures).forEach((round) => { if (!Object.prototype.hasOwnProperty.call(completedSignatures, round)) completedSignatures[round] = selection.signatures[round] })
  selection.rounds.forEach((round) => {
    try { syncEspnMatchStatsForRound(round, false); completedSignatures[round] = selection.signatures[round] } catch (error) { errors.push(`SR${round}: ${error.message}`) }
  })
  properties.setProperty(propertyKey, JSON.stringify(completedSignatures))
  SpreadsheetApp.flush()
  if (errors.length) throw new Error(errors.join(' | '))
  return selection.rounds
}


function installMatchStatsAutomaticTrigger() {
  ScriptApp.getProjectTriggers().filter((trigger) => trigger.getHandlerFunction() === 'syncMatchStatsAutomatic').forEach((trigger) => ScriptApp.deleteTrigger(trigger))
  ScriptApp.newTrigger('syncMatchStatsAutomatic').timeBased().everyHours(6).create()
}


function createFixtureKey(
  gameweek,
  homeClub,
  awayClub,
) {
  return [
    Number(gameweek),
    normalizeClub(
      homeClub,
    ),
    normalizeClub(
      awayClub,
    ),
  ].join('|')
}


function createMatchStatsKey(
  playerId,
  season,
  gameweek,
  fixtureId,
) {
  return [
    String(
      playerId ?? '',
    ).trim(),

    String(
      season ?? '',
    ).trim(),

    Number(
      gameweek,
    ),

    String(
      fixtureId ?? '',
    ).trim(),
  ].join('|')
}


function writeEspnMatchStatsControl(
  spreadsheet,
  gameweek,
  generatedCount,
  addedCount,
  updatedCount,
  unmatchedPlayers,
  ambiguousPlayers,
  unmatchedFixtures,
) {
  const sheetName =
    'ESPN_MATCHSTATS_CONTROLE'

  let sheet =
    spreadsheet.getSheetByName(
      sheetName,
    )

  if (!sheet) {
    sheet =
      spreadsheet.insertSheet(
        sheetName,
      )
  }

  sheet.clearContents()

  const rows = [
    [
      'ESPN MATCHSTATS CONTROLE',
      '',
      '',
      '',
      '',
    ],

    [
      'Speelronde',
      gameweek,
      '',
      '',
      '',
    ],

    [
      'Gekoppelde regels',
      generatedCount,
      '',
      '',
      '',
    ],

    [
      'Nieuwe regels',
      addedCount,
      '',
      '',
      '',
    ],

    [
      'Bijgewerkte regels',
      updatedCount,
      '',
      '',
      '',
    ],

    [
      '',
      '',
      '',
      '',
      '',
    ],

    [
      'Type',
      'ESPN ID / Fixture',
      'Naam / Thuisclub',
      'Club / Uitclub',
      'Reden',
    ],
  ]

  unmatchedPlayers.forEach(
    (item) => {
      rows.push([
        'Speler - geen match',
        item[0],
        item[1],
        item[2],
        item[4],
      ])
    },
  )

  ambiguousPlayers.forEach(
    (item) => {
      rows.push([
        'Speler - meerdere matches',
        item[0],
        item[1],
        item[2],
        item[4],
      ])
    },
  )

  unmatchedFixtures.forEach(
    (item) => {
      rows.push([
        'Fixture - geen match',
        item[0],
        item[1],
        item[2],
        item[3],
      ])
    },
  )

  if (
    rows.length === 7
  ) {
    rows.push([
      'OK',
      '',
      '',
      '',
      'Geen uitzonderingen gevonden',
    ])
  }

  sheet
    .getRange(
      1,
      1,
      rows.length,
      5,
    )
    .setValues(
      rows,
    )

  sheet
    .getRange(
      1,
      1,
      1,
      5,
    )
    .setFontWeight(
      'bold',
    )

  sheet
    .getRange(
      7,
      1,
      1,
      5,
    )
    .setFontWeight(
      'bold',
    )

  sheet.autoResizeColumns(
    1,
    5,
  )
}

function syncLatestCompletedEspnRound(
  showAlert = true,
) {
  const response =
    UrlFetchApp.fetch(
      ESPN_BOOTSTRAP_URL,
      {
        muteHttpExceptions: true,
      },
    )

  if (
    response.getResponseCode() !== 200
  ) {
    throw new Error(
      `ESPN kon niet worden geladen (${response.getResponseCode()}).`,
    )
  }

  const bootstrap =
    JSON.parse(
      response.getContentText(),
    )

  const events =
    Array.isArray(
      bootstrap.events,
    )
      ? bootstrap.events
      : []

  const completedRounds =
    events
      .filter(
        (event) =>
          event.finished === true,
      )
      .map(
        (event) =>
          Number(event.id),
      )
      .filter(
        Number.isFinite,
      )
      .sort(
        (a, b) => b - a,
      )

  if (!completedRounds.length) {
    throw new Error(
      'ESPN heeft nog geen volledig afgeronde speelronde.',
    )
  }

  const latestRound =
    completedRounds[0]

  SpreadsheetApp
    .getActiveSpreadsheet()
    .toast(
      `Speelronde ${latestRound} wordt gesynchroniseerd...`,
      'Fantasy Studio',
      5,
    )

  syncEspnMatchStatsForRound(
  latestRound,
  showAlert,
)
}

function syncEverything() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet()

  spreadsheet.toast(
    'ESPN spelerdata wordt bijgewerkt...',
    'Fantasy Studio',
    5,
  )

  syncEspnPlayerData(
    false,
  )

  spreadsheet.toast(
    'Laatste speelronde wordt bijgewerkt...',
    'Fantasy Studio',
    5,
  )

  syncLatestCompletedEspnRound(
    false,
  )

  SpreadsheetApp.flush()

  SpreadsheetApp
    .getUi()
    .alert(
      [
        'Fantasy Studio synchronisatie voltooid! âœ…',
        '',
        'Bijgewerkt:',
        'â€¢ Eindprijs',
        'â€¢ Gespeeld %',
        'â€¢ Laatste afgeronde speelronde',
        'â€¢ PLAYER_MATCH_STATS',
        '',
        'Eventuele uitzonderingen staan in de controle-tabbladen.',
      ].join('\n'),
    )
}

function syncEverythingAutomatic() {
  syncEspnPlayerData(false)

  syncLatestCompletedEspnRound(false)

  SpreadsheetApp.flush()
}
