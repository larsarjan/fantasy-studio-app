import {getHistoryPlayerProfileId} from '../services/historyPresentation.js'
import {escapeBlock as esc} from '../services/articleBlocks.js'

function renderRepeatedEvent(
  symbol,
  count,
  title,
  className = '',
) {
  const amount =
    Math.max(
      0,
      Number(count) || 0,
    )

  if (!amount) {
    return ''
  }

  if (amount <= 5) {
    return Array
      .from(
        { length: amount },
        () => `
          <span
            class="history-match-event ${className}"
            title="${title}"
          >
            ${symbol}
          </span>
        `,
      )
      .join('')
  }

  return `
    <span
      class="history-match-event ${className}"
      title="${title}"
    >
      ${symbol}×${amount}
    </span>
  `
}

function renderPlayerEvents(
  match,
) {
  const events = []

  const optaBonus =
  Number(match.optaBonus) || 0

if (optaBonus === 3) {
  events.push(`
    <span
      class="history-match-event history-match-event-opta-gold"
      title="3 OPTA-bonuspunten"
    >
      🥇
    </span>
  `)
}

if (optaBonus === 2) {
  events.push(`
    <span
      class="history-match-event history-match-event-opta-silver"
      title="2 OPTA-bonuspunten"
    >
      🥈
    </span>
  `)
}

if (optaBonus === 1) {
  events.push(`
    <span
      class="history-match-event history-match-event-opta-bronze"
      title="1 OPTA-bonuspunt"
    >
      🥉
    </span>
  `)
}

  const goals =
    Number(match.goals) || 0

  if (goals > 0) {
    events.push(
      renderRepeatedEvent(
        '⚽',
        goals,
        goals === 1
          ? 'Doelpunt'
          : `${goals} doelpunten`,
      ),
    )
  }

  const assists =
    Number(match.assists) || 0

  if (assists > 0) {
    events.push(
      renderRepeatedEvent(
        'A',
        assists,
        assists === 1
          ? 'Assist'
          : `${assists} assists`,
        'history-match-event-assist',
      ),
    )
  }

  /*
   * Alleen een muur tonen wanneer
   * er daadwerkelijk Fantasy-punten
   * voor de clean sheet zijn verdiend.
   */
  if (
    Number(
      match.punten?.cleanSheet,
    ) > 0
  ) {
    events.push(`
      <span
        class="history-match-event"
        title="Clean sheet"
      >
        🧱
      </span>
    `)
  }

  const saves =
    Number(match.saves) || 0

  if (saves > 0) {
    events.push(
      saves <= 5
        ? Array
            .from(
              { length: saves },
              () => `
                <span
                  class="history-match-event"
                  title="${saves} ${
                    saves === 1
                      ? 'redding'
                      : 'reddingen'
                  }"
                >
                  🧤
                </span>
              `,
            )
            .join('')
        : `
            <span
              class="history-match-event"
              title="${saves} reddingen"
            >
              🧤×${saves}
            </span>
          `,
    )
  }

  const yellowCards =
    Number(match.yellowCards) || 0

  if (yellowCards > 0) {
    events.push(
      renderRepeatedEvent(
        '🟨',
        yellowCards,
        'Gele kaart',
      ),
    )
  }

  const redCards =
    Number(match.redCards) || 0

  if (redCards > 0) {
    events.push(
      renderRepeatedEvent(
        '🟥',
        redCards,
        'Rode kaart',
      ),
    )
  }

  const ownGoals =
    Number(match.ownGoals) || 0

  if (ownGoals > 0) {
    events.push(
      renderRepeatedEvent(
        'OG',
        ownGoals,
        'Eigen doelpunt',
        'history-match-event-own-goal',
      ),
    )
  }

  const penaltiesMissed =
    Number(
      match.penaltiesMissed,
    ) || 0

  if (penaltiesMissed > 0) {
    events.push(
      renderRepeatedEvent(
        '❌⚽',
        penaltiesMissed,
        'Penalty gemist',
      ),
    )
  }

  const penaltiesSaved =
    Number(
      match.penaltiesSaved,
    ) || 0

  if (penaltiesSaved > 0) {
    events.push(
      renderRepeatedEvent(
        '🧤⚽',
        penaltiesSaved,
        'Penalty gestopt',
      ),
    )
  }

  return events
    .filter(Boolean)
    .join('')
}

function renderMatchEventLegend() {
  const items = [
    ['🥇 / 🥈 / 🥉', 'OPTA-bonus'], ['⚽', 'Doelpunt'],
    ['A', 'Assist', 'history-match-event-assist'], ['🧱', 'Clean sheet'],
    ['🧤', 'Redding'], ['🟨', 'Gele kaart'], ['🟥', 'Rode kaart'],
    ['OG', 'Eigen doelpunt', 'history-match-event-own-goal'],
    ['❌⚽', 'Penalty gemist'], ['🧤⚽', 'Penalty gestopt'],
  ]
  return `<div class="history-match-legend" aria-label="Legenda wedstrijdgebeurtenissen">${items.map(([icon, label, className = '']) => `<span><i class="history-match-event ${className}">${icon}</i>${label}</span>`).join('')}</div>`
}

function renderMatchPlayerRow({
  player,
  match,
}, options = {}) {
  const playerProfileId =
    getHistoryPlayerProfileId(player)

  const points =
    Number(
      match.punten?.totaal,
    ) || 0

  const position =
    player.position ||
    player.fantasyPosition ||
    '–'

  return `
    <div class="history-match-player">
      ${playerProfileId && options.playerLinks !== false
        ? `<button type="button" class="history-match-player-name history-match-player-link" ${options.article ? `data-article-player="${esc(playerProfileId)}" data-season="${esc(player.season)}"` : `data-history-player="${esc(playerProfileId)}"`}>${esc(player.name)}</button>`
        : `<strong class="history-match-player-name">${esc(player.name)}</strong>`}

      <span class="history-match-player-position">
        ${esc(position)}
      </span>

      <span class="history-match-player-minutes">
        ${Number(match.minutes) || 0}'
      </span>

      <strong
        class="history-match-player-points ${
          points < 0
            ? 'negative'
            : ''
        }"
      >
        ${points} pt
      </strong>

      <span class="history-match-player-events">
        ${renderPlayerEvents(match)}
        ${match.recordedGoalsConceded !== null && match.recordedGoalsConceded !== undefined && ['Doelman','Verdediger'].includes(position) ? `<small>${match.recordedGoalsConceded} tegengoals</small>` : ''}
      </span>
    </div>
  `
}

const POSITION_GROUPS = [
  {
    key: 'Doelman',
    label: 'Doelman',
    icon: '🧤',
  },
  {
    key: 'Verdediger',
    label: 'Verdedigers',
    icon: '🛡',
  },
  {
    key: 'Middenvelder',
    label: 'Middenvelders',
    icon: '🎽',
  },
  {
    key: 'Spits',
    label: 'Spitsen',
    icon: '🎯',
  },
]

function renderPositionSections(
  players,
  options = {},
) {
  return POSITION_GROUPS
    .map(
      (group) => {
        const groupPlayers =
          players.filter(
            ({ player }) =>
              player.position ===
              group.key,
          )

        if (!groupPlayers.length) {
          return ''
        }

        return `
          <section class="history-match-position-section">
            <div class="history-match-position-heading">
              <span>
                ${group.icon}
              </span>

              <strong>
                ${group.label}
              </strong>

              <small>
                ${groupPlayers.length}
              </small>
            </div>

            <div class="history-match-lineup">
              ${groupPlayers
                .map(
                  row => renderMatchPlayerRow(row, options),
                )
                .join('')}
            </div>
          </section>
        `
      },
    )
    .filter(Boolean)
    .join('')
}

function renderMatchTeam({
  club,
  players,
  options = {},
}) {

  const POSITION_ORDER = {
  Doelman: 1,
  Verdediger: 2,
  Middenvelder: 3,
  Spits: 4,
}

const starters = players
  .filter(
    ({ match }) =>
      match.started === true,
  )
  .sort((a, b) => {
    const left =
      POSITION_ORDER[a.player.position] ?? 99

    const right =
      POSITION_ORDER[b.player.position] ?? 99

    if (left !== right) {
      return left - right
    }

    return a.player.name.localeCompare(
      b.player.name,
      'nl',
    )
  })

  const substitutes =
    players.filter(
      ({ match }) =>
        match.started !== true &&
        Number(match.minutes) > 0,
    )

  return `
    <section class="history-match-team">
      <div class="history-match-team-heading">
        <strong>${esc(club)}</strong>

        <span>
          ${starters.length} basis ·
          ${substitutes.length} ingevallen
        </span>
      </div>

      ${
  starters.length
    ? renderPositionSections(
        starters, options,
      )
    : `
        <div class="history-match-no-data">
          Geen basisspelers beschikbaar.
        </div>
      `
}

      ${
        substitutes.length && options.showSubstitutes !== false
          ? `
              <div class="history-match-subs-heading">
                Invallers
              </div>

              <div class="history-match-lineup">
                ${substitutes
                  .map(
                    row => renderMatchPlayerRow(row, options),
                  )
                  .join('')}
              </div>
            `
          : ''
      }
    </section>
  `
}


export function renderHistoricalMatchContent(groups,result,options={}) {
 const {fixture,home,away,unassigned}=groups
 if(!fixture)return '<p class="history-match-no-data">Geen gekoppelde wedstrijdgegevens beschikbaar.</p>'
 const all=[...home,...away,...unassigned]
 if(!all.length)return '<p class="history-match-no-data">Voor deze wedstrijd zijn nog geen spelersstatistieken beschikbaar.</p>'
 const topper=[...all].sort((a,b)=>(Number(b.match.punten?.totaal)||0)-(Number(a.match.punten?.totaal)||0))[0]
 return `<div class="history-match-details"><div class="history-match-summary"><div><span>Speelronde</span><strong>${Number(result.round)||Number(fixture.round)||'-'}</strong></div>${options.showTopScorer!==false?`<div class="history-match-summary-topper"><span>Fantasy-topscorer</span><strong>${esc(topper.player.name)} · ${Number(topper.match.punten?.totaal)||0} pt</strong></div>`:''}</div>${options.showLegend!==false?renderMatchEventLegend():''}<div class="history-match-teams">${renderMatchTeam({club:fixture.home,players:home,options})}${renderMatchTeam({club:fixture.away,players:away,options})}</div>${unassigned.length?`<p>Bij ${unassigned.length} speler(s) is de wedstrijdclub niet betrouwbaar vastgelegd.</p>${renderMatchTeam({club:'Wedstrijdclub niet vastgelegd',players:unassigned,options})}`:''}</div>`
}
