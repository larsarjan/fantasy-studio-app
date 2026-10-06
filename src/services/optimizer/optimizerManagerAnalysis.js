/*
|--------------------------------------------------------------------------
| FVT Manager Analysis
|--------------------------------------------------------------------------
|
| Deterministic result layer. This module only explains existing optimizer
| output. It never generates candidates, changes a lineup or simulates an
| action. Missing evidence is omitted instead of inferred.
|
*/

function finite(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function round(value, digits = 1) {
  const number = finite(value)
  if (number === null) return 0
  const factor = 10 ** digits
  return Math.round((number + Number.EPSILON) * factor) / factor
}

function clamp(value, minimum = 0, maximum = 10) {
  return Math.min(maximum, Math.max(minimum, value))
}

function candidateName(candidate) {
  return String(candidate?.player?.name ?? candidate?.name ?? '').trim()
}

function candidateIdentity(candidate) {
  const direct = candidate?.playerId ?? candidate?.id ?? candidate?.player?.id ?? candidate?.player?.playerId
  if (direct !== null && direct !== undefined && String(direct).trim()) return String(direct).trim()
  const name = candidateName(candidate)
  const club = String(candidate?.player?.club ?? candidate?.club ?? '').trim()
  return name ? `${name}@${club}` : ''
}

function metric(candidate, name) {
  return finite(candidate?.[name] ?? candidate?.player?.[name])
}

function outlookMetric(candidate, name) {
  return finite(
    candidate?.player?.outlook?.scores?.[name] ??
    candidate?.player?.outlook?.[name] ??
    candidate?.outlook?.scores?.[name] ??
    candidate?.outlook?.[name],
  )
}

function playerPrice(candidate) {
  const values = [
    candidate?.price,
    candidate?.player?.currentPrice,
    candidate?.player?.endPrice,
    candidate?.player?.price,
    candidate?.player?.startPrice,
  ]
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === '') continue
    const number = finite(value)
    if (number !== null && number >= 0) return number
  }
  return null
}

function section(key, title, icon, text, severity, evidence) {
  return {
    key,
    title,
    icon,
    text,
    severity,
    evidence: evidence.filter((item) => item?.label && item?.value),
  }
}

function evidence(label, value) {
  return { label: String(label), value: String(value) }
}

function formatPoints(value) {
  return `${round(value, 1).toFixed(1).replace('.', ',')} xP`
}

function formatMillions(value) {
  return `€${round(value, 1).toFixed(1).replace('.', ',')}m`
}

function formatApproximatePoints(value) {
  const number = round(value, Math.abs(Number(value)) < 1 ? 1 : 0)
  return String(number).replace('.', ',')
}

function getLineupResult(lineupResult) {
  const source = lineupResult?.result ?? lineupResult ?? {}
  const starters = Array.isArray(source.starters) ? source.starters : []
  const bench = Array.isArray(source.bench?.ordered)
    ? source.bench.ordered
    : Array.isArray(source.bench)
      ? source.bench
      : []
  return { source, starters, bench }
}

function getPlannerAction(seasonPlannerResult, index) {
  const source = seasonPlannerResult?.result ?? seasonPlannerResult ?? {}
  return source?.bestPath?.[index]?.action ?? {}
}

function createTeamScore({ lineupResult, seasonPlan }) {
  const { source, starters, bench } = getLineupResult(lineupResult)
  const components = []
  const averageRoundPoints = finite(seasonPlan?.summary?.averageExpectedPointsPerRound)
    ?? finite(source.expectedPoints)
  if (averageRoundPoints !== null && averageRoundPoints >= 0) {
    components.push({
      key: 'expectedPoints',
      label: 'Expected Points',
      score: round(clamp((averageRoundPoints / 70) * 10), 1),
      evidence: formatPoints(averageRoundPoints),
      weight: 3,
    })
  }

  const starterPoints = starters.map((item) => metric(item, 'expectedPoints')).filter((item) => item !== null)
  const benchPoints = bench.map((item) => metric(item, 'expectedPoints')).filter((item) => item !== null)
  if (starterPoints.length && benchPoints.length) {
    const starterAverage = starterPoints.reduce((total, item) => total + item, 0) / starterPoints.length
    const benchAverage = benchPoints.reduce((total, item) => total + item, 0) / benchPoints.length
    components.push({
      key: 'bench',
      label: 'Bank',
      score: round(clamp((benchAverage / Math.max(starterAverage, 0.1)) * 10), 1),
      evidence: `${formatPoints(benchAverage)} gemiddeld`,
      weight: 1,
    })
  }

  const minutes = [...starters, ...bench]
    .map((item) => metric(item, 'expectedMinutesPerRound') ?? metric(item, 'expectedMinutes'))
    .filter((item) => item !== null && item >= 0)
  const probabilities = [...starters, ...bench]
    .map((item) => metric(item, 'appearanceProbability'))
    .filter((item) => item !== null && item >= 0 && item <= 1)
  if (minutes.length || probabilities.length) {
    const averageMinutes = minutes.length
      ? minutes.reduce((total, item) => total + item, 0) / minutes.length
      : null
    const averageProbability = probabilities.length
      ? probabilities.reduce((total, item) => total + item, 0) / probabilities.length
      : null
    const normalizedInputs = [
      averageMinutes === null ? null : clamp(averageMinutes / 90, 0, 1),
      averageProbability,
    ].filter((item) => item !== null)
    const normalizedAvailability = normalizedInputs.reduce((total, item) => total + item, 0) / normalizedInputs.length
    const availabilityEvidence = [
      averageMinutes === null ? '' : `${round(averageMinutes, 0)} minuten`,
      averageProbability === null ? '' : `${round(averageProbability * 100, 0)}% speelkans`,
    ].filter(Boolean).join(' · ')
    components.push({
      key: 'availability',
      label: 'Beschikbaarheid',
      score: round(clamp(normalizedAvailability * 10), 1),
      evidence: `${availabilityEvidence} gemiddeld`,
      weight: 1.5,
    })
  }

  const fixtureScores = [...starters, ...bench]
    .map((item) => outlookMetric(item, 'fixtures'))
    .filter((item) => item !== null && item >= 0 && item <= 10)
  if (fixtureScores.length) {
    const average = fixtureScores.reduce((total, item) => total + item, 0) / fixtureScores.length
    components.push({
      key: 'fixtures', label: 'Fixtures', score: round(average, 1),
      evidence: `${round(average, 1).toFixed(1).replace('.', ',')} / 10 gemiddeld`, weight: 1,
    })
  }

  const rawRiskScores = [...starters, ...bench]
    .map((item) => outlookMetric(item, 'risk'))
    .filter((item) => item !== null && item >= 0 && item <= 10)
  if (rawRiskScores.length) {
    const averageRisk = rawRiskScores.reduce((total, item) => total + item, 0) / rawRiskScores.length
    components.push({
      key: 'risk', label: 'Risicobeheersing', score: round(10 - averageRisk, 1),
      evidence: `${round(averageRisk, 1).toFixed(1).replace('.', ',')} / 10 risico`, weight: 1,
    })
  }

  const captainPoints = metric(source.captain, 'expectedPoints')
  const highestStarterPoints = starterPoints.length ? Math.max(...starterPoints) : null
  const captainInStarters = new Set(starters.map(candidateIdentity).filter(Boolean))
    .has(candidateIdentity(source.captain))
  if (captainPoints !== null && highestStarterPoints !== null && captainInStarters) {
    components.push({
      key: 'captain',
      label: 'Captain',
      score: round(clamp((captainPoints / Math.max(highestStarterPoints, 0.1)) * 10), 1),
      evidence: `${candidateName(source.captain) || 'Captain'} · ${formatPoints(captainPoints)}`,
      weight: 1.5,
    })
  }

  const pricedPlayers = [...starters, ...bench]
    .map((item) => ({ points: metric(item, 'expectedPoints'), price: playerPrice(item) }))
    .filter((item) => item.points !== null && item.price !== null && item.price > 0)
  if (pricedPlayers.length) {
    const totalPoints = pricedPlayers.reduce((total, item) => total + item.points, 0)
    const totalPrice = pricedPlayers.reduce((total, item) => total + item.price, 0)
    const pointsPerMillion = totalPoints / totalPrice
    components.push({
      key: 'value',
      label: 'Waarde',
      score: round(clamp((pointsPerMillion / 1.25) * 10), 1),
      evidence: `${round(pointsPerMillion, 2).toFixed(2).replace('.', ',')} xP per miljoen`,
      weight: 1,
    })
  }


  const positions = new Map()
  starters.forEach((item) => {
    const position = String(item?.position ?? item?.player?.fantasyPosition ?? item?.player?.position ?? '').trim()
    const points = metric(item, 'expectedPoints')
    if (!position || points === null) return
    const values = positions.get(position) ?? []
    values.push(points)
    positions.set(position, values)
  })
  if (positions.size >= 3) {
    const averages = [...positions.values()].map((values) => values.reduce((a, b) => a + b, 0) / values.length)
    const highest = Math.max(...averages)
    const lowest = Math.min(...averages)
    components.push({
      key: 'balance', label: 'Positiebalans',
      score: round(clamp(10 - ((highest - lowest) / Math.max(highest, 0.1)) * 10), 1),
      evidence: `${formatPoints(lowest)}–${formatPoints(highest)} per speler`, weight: 1,
    })
  }

  const totalWeight = components.reduce((total, item) => total + item.weight, 0)
  const value = totalWeight
    ? round(components.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight, 1)
    : 0
  const possibleDimensions = 8
  const usedDimensions = components.length
  const coverageRatio = usedDimensions / possibleDimensions
  const coverageLevel = coverageRatio >= 0.75 ? 'high' : coverageRatio >= 0.5 ? 'medium' : 'low'
  return {
    available: components.length > 0,
    value,
    label: `${value.toFixed(1).replace('.', ',')} / 10`,
    components,
    coverage: {
      usedDimensions,
      possibleDimensions,
      ratio: round(coverageRatio, 2),
      percentage: round(coverageRatio * 100, 0),
      level: coverageLevel,
      warning: coverageLevel === 'low'
        ? 'Lage datadekking: deze Teamscore is op minder dan de helft van de mogelijke dimensies gebaseerd.'
        : '',
    },
    method: 'Gewogen gemiddelde: Expected Points ×3; beschikbaarheid en captain ×1,5; bank, fixtures, risico, positiebalans en waarde ×1. Expected Points wordt begrensd op 70 xP, beschikbaarheid op 90 minuten/100% en waarde op 1,25 xP per miljoen. Ontbrekende dimensies tellen niet mee in de noemer.',
  }
}

function createTransferReasons({ seasonPlan, seasonPlannerResult }) {
  return (seasonPlan?.timeline ?? []).
    filter((entry) => Number(entry?.action?.transfersMade) > 0)
    .map((entry) => {
      const plannerAction = getPlannerAction(seasonPlannerResult, entry.index)
      const gain = finite(plannerAction.expectedPointsGain)
      const suppliedNetGain = finite(plannerAction.netExpectedPointsGain)
      const pairs = (entry.action.transferPairs ?? []).filter((pair) => (
        String(pair?.playerOut?.name ?? '').trim() && String(pair?.playerIn?.name ?? '').trim()
      ))
      if (pairs.length !== Number(entry.action.transfersMade)) return null
      const names = pairs.map((pair) => (
        `${pair?.playerOut?.name || 'Onbekend'} → ${pair?.playerIn?.name || 'Onbekend'}`
      )).join(' + ')
      const cost = finite(entry.points.transferPointsCost) ?? 0
      const calculatedNetGain = gain === null ? null : round(gain - cost, 2)
      const netGain = suppliedNetGain !== null && calculatedNetGain !== null &&
        Math.abs(suppliedNetGain - calculatedNetGain) <= 0.01
        ? suppliedNetGain
        : calculatedNetGain
      const textParts = [`De FVT Manager adviseert om ${names} in speelronde ${entry.round} uit te voeren.`]
      if (gain !== null) textParts.push(`Deze wissel${entry.action.transfersMade === 2 ? 's verhogen' : ' verhoogt'} de rondeprojectie met ongeveer ${formatApproximatePoints(gain)} punt${Math.abs(gain) === 1 ? '' : 'en'}.`)
      if (cost > 0) textParts.push(`Na ${round(cost, 0)} transferpunten is het verwachte nettoresultaat ${netGain === null ? 'niet beschikbaar' : `ongeveer ${formatApproximatePoints(netGain)} punt${Math.abs(netGain) === 1 ? '' : 'en'}`}.`)
      else textParts.push('De transfer kost geen punten.')
      return section(
        `transfer-${entry.round}-${entry.action.id || entry.index}`,
        `Waarom deze ${entry.action.transfersMade === 2 ? 'dubbele ' : ''}transfer?`,
        '↔',
        textParts.join(' '),
        cost > 0 ? 'warning' : 'positive',
        [
          evidence('Actie', names),
          gain === null ? null : evidence('Bruto verschil', formatPoints(gain)),
          netGain === null ? null : evidence('Netto verschil', formatPoints(netGain)),
          evidence('Transferkosten', `${round(cost, 0)} punten`),
          evidence('Vrije transfers', `${entry.transfers.freeTransfersBefore} → ${entry.transfers.nextFreeTransfers}`),
          evidence('Bank', `${formatMillions(entry.finance.bankBefore)} → ${formatMillions(entry.finance.bankAfter)}`),
        ],
      )
    })
    .filter(Boolean)
}

function uniqueSections(sections) {
  const seen = new Set()
  return sections.filter((item) => {
    if (!item || seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

export function createManagerAnalysis({
  seasonPlan,
  lineupResult,
  optimizedLineupResult = null,
  transferPlannerResult,
  seasonPlannerResult,
  preseason = null,
} = {}) {
  if (!seasonPlan?.valid || !Array.isArray(seasonPlan.timeline) || !seasonPlan.timeline.length) {
    return {
      valid: false,
      errors: ['Er is geen volledig Season Plan beschikbaar om te analyseren.'],
      overview: [], strengths: [], weaknesses: [], priority: [], transferReason: [],
      strategy: [], future: [], risk: [], summary: [], sections: [],
      teamScore: {
        available: false, value: 0, label: 'Niet beschikbaar', components: [],
        coverage: { usedDimensions: 0, possibleDimensions: 8, ratio: 0, percentage: 0, level: 'low', warning: 'Onvoldoende teamgegevens.' },
        method: 'Onvoldoende teamgegevens.',
      },
    }
  }

  const { source, starters, bench } = getLineupResult(lineupResult)
  const comparesPreseasonTeams = preseason?.valid && preseason?.mode === 'current-team'
  const teamScore = createTeamScore({
    lineupResult,
    seasonPlan: comparesPreseasonTeams ? null : seasonPlan,
  })
  const optimizedTeamScore = comparesPreseasonTeams
    ? createTeamScore({ lineupResult: optimizedLineupResult, seasonPlan: null })
    : null
  const initialProjection = comparesPreseasonTeams
    ? finite(preseason.initialExpectedPointsRound1)
    : null
  const optimizedProjection = comparesPreseasonTeams
    ? finite(preseason.expectedPointsRound1)
    : null
  const initialBenchValues = comparesPreseasonTeams
    ? getLineupResult(lineupResult).bench.map((item) => metric(item, 'expectedPoints')).filter((item) => item !== null)
    : []
  const optimizedBenchValues = comparesPreseasonTeams
    ? getLineupResult(optimizedLineupResult).bench.map((item) => metric(item, 'expectedPoints')).filter((item) => item !== null)
    : []
  const comparison = comparesPreseasonTeams && teamScore.available && optimizedTeamScore?.available &&
    teamScore.coverage?.level !== 'low' && optimizedTeamScore.coverage?.level !== 'low' &&
    initialProjection !== null && optimizedProjection !== null
    ? {
        available: true,
        initialTeamScore: teamScore.value,
        optimizedTeamScore: optimizedTeamScore.value,
        teamScoreDelta: round(optimizedTeamScore.value - teamScore.value, 1),
        initialExpectedPointsRound1: initialProjection,
        optimizedExpectedPointsRound1: optimizedProjection,
        expectedPointsGain: round(optimizedProjection - initialProjection, 1),
        initialBenchExpectedPoints: initialBenchValues.length
          ? round(initialBenchValues.reduce((total, value) => total + value, 0), 1)
          : null,
        optimizedBenchExpectedPoints: optimizedBenchValues.length
          ? round(optimizedBenchValues.reduce((total, value) => total + value, 0), 1)
          : null,
      }
    : { available: false }
  const summary = seasonPlan.summary ?? {}
  const timeline = seasonPlan.timeline
  const firstRound = timeline[0]
  const firstTransfer = timeline.find((entry) => entry.action.transfersMade > 0)
  const sections = {
    overview: [], strengths: [], weaknesses: [], priority: [], transferReason: [],
    strategy: [], future: [], risk: [], summary: [],
  }

  sections.overview.push(section(
    'overview', 'Plan in het kort', '◎',
    `De FVT Manager verwacht over ${timeline.length} speelronde${timeline.length === 1 ? '' : 's'} ${formatPoints(summary.totalNetExpectedPoints)} na transferkosten.`,
    'neutral',
    [evidence('Bruto', formatPoints(summary.totalExpectedPoints)), evidence('Netto', formatPoints(summary.totalNetExpectedPoints)), evidence('Transferkosten', `${round(summary.totalTransferPointsCost, 0)} punten`)],
  ))
  if (preseason?.valid) {
    const changeCount = Number(preseason.changes?.changesMade ?? 0)
    sections.overview.unshift(section(
      'preseason-overview', 'Voor de eerste deadline', '✓',
      `Voor speelronde 1 mag je onbeperkt wisselen. De FVT Manager heeft je selectie daarom volledig opnieuw beoordeeld en adviseert ${changeCount} wijziging${changeCount === 1 ? '' : 'en'}.`,
      'positive',
      [evidence('Transferpunten', '0'), evidence('Eindbank', formatMillions(preseason.bankAfter))],
    ))
  }

  const starterValues = starters.map((item) => metric(item, 'expectedPoints')).filter((item) => item !== null)
  const benchValues = bench.map((item) => metric(item, 'expectedPoints')).filter((item) => item !== null)
  if (starterValues.length && benchValues.length) {
    const startersTotal = starterValues.reduce((a, b) => a + b, 0)
    const benchTotal = benchValues.reduce((a, b) => a + b, 0)
    const difference = round(startersTotal - benchTotal, 1)
    const lineupSection = section(
      'lineup-quality', 'Basiself en bank', '✓',
      `De basiself projecteert ${formatPoints(startersTotal)} en de bank ${formatPoints(benchTotal)}; het verschil is ${formatPoints(difference)}.`,
      startersTotal > benchTotal ? 'positive' : 'warning',
      [evidence('Basiself', formatPoints(startersTotal)), evidence('Bank', formatPoints(benchTotal))],
    )
    if (startersTotal >= benchTotal) sections.strengths.push(lineupSection)
    else sections.weaknesses.push(lineupSection)
  }

  const minutePlayers = [...starters, ...bench]
    .map((item) => ({ name: candidateName(item), minutes: metric(item, 'expectedMinutesPerRound') ?? metric(item, 'expectedMinutes') }))
    .filter((item) => item.name && item.minutes !== null && item.minutes >= 0)
    .sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name, 'nl'))
  if (minutePlayers.length) {
    const lowest = minutePlayers[0]
    sections.risk.push(section(
      'minutes-risk', 'Laagste speelzekerheid', '!',
      `${lowest.name} heeft binnen de beschikbare projecties de minste verwachte minuten.`,
      lowest.minutes < 60 ? 'warning' : 'neutral',
      [evidence('Speler', lowest.name), evidence('Verwachte minuten', `${round(lowest.minutes, 0)}`)],
    ))
  }


  const outlookPlayers = [...starters, ...bench].map((item) => ({
    name: candidateName(item),
    fixture: outlookMetric(item, 'fixtures'),
    form: outlookMetric(item, 'form'),
    risk: outlookMetric(item, 'risk'),
  })).filter((item) => item.name)
  const validFixtures = outlookPlayers.filter((item) => item.fixture !== null && item.fixture >= 0 && item.fixture <= 10)
  if (validFixtures.length) {
    const strongest = [...validFixtures].sort((a, b) => b.fixture - a.fixture || a.name.localeCompare(b.name, 'nl'))[0]
    const weakest = [...validFixtures].sort((a, b) => a.fixture - b.fixture || a.name.localeCompare(b.name, 'nl'))[0]
    if (strongest.fixture >= 6.5) sections.strengths.push(section('fixtures-strong', 'Hoogste fixtureprofiel', '↗', `${strongest.name} heeft binnen de selectie de hoogste beschikbare fixturescore.`, 'positive', [evidence('Fixturescore', `${round(strongest.fixture, 1)} / 10`)]))
    if (weakest.fixture <= 4.5) sections.weaknesses.push(section('fixtures-weak', 'Laagste fixtureprofiel', '↘', `${weakest.name} heeft binnen de selectie de laagste beschikbare fixturescore.`, 'warning', [evidence('Fixturescore', `${round(weakest.fixture, 1)} / 10`)]))
  }
  const validRisk = outlookPlayers.filter((item) => item.risk !== null && item.risk >= 0 && item.risk <= 10)
  if (validRisk.length) {
    const highestRisk = [...validRisk].sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name, 'nl'))[0]
    sections.risk.push(section('outlook-risk', 'Hoogste risicoscore', '!', `${highestRisk.name} heeft binnen de selectie de hoogste expliciete risicoscore.`, highestRisk.risk > 5 ? 'warning' : 'neutral', [evidence('Risicoscore', `${round(highestRisk.risk, 1)} / 10`)]))
  }
  const validForm = outlookPlayers.filter((item) => item.form !== null && item.form >= 0 && item.form <= 10)
  if (validForm.length) {
    const strongestForm = [...validForm].sort((a, b) => b.form - a.form || a.name.localeCompare(b.name, 'nl'))[0]
    if (strongestForm.form >= 6.5) sections.strengths.push(section('form', 'Hoogste vormscore', '↑', `${strongestForm.name} heeft binnen de selectie de hoogste beschikbare vormscore.`, 'positive', [evidence('Vormscore', `${round(strongestForm.form, 1)} / 10`)]))
  }

  const clubCounts = new Map()
  ;[...starters, ...bench].forEach((item) => {
    const club = String(item?.player?.club ?? item?.club ?? '').trim()
    if (club) clubCounts.set(club, (clubCounts.get(club) ?? 0) + 1)
  })
  const largestClubGroup = [...clubCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl'))[0]
  if (largestClubGroup && largestClubGroup[1] >= 2) {
    sections.risk.push(section('club-distribution', 'Clubverdeling', '◇', `${largestClubGroup[0]} is met ${largestClubGroup[1]} spelers de grootste clubgroep in de selectie.`, largestClubGroup[1] >= 3 ? 'warning' : 'neutral', [evidence('Grootste groep', `${largestClubGroup[0]} · ${largestClubGroup[1]} spelers`), evidence('Clubs vertegenwoordigd', `${clubCounts.size}`)]))
  }

  const captain = source.captain
  const viceCaptain = source.viceCaptain
  const starterIdentities = new Set(starters.map(candidateIdentity).filter(Boolean))
  const captainIsStarter = starterIdentities.has(candidateIdentity(captain))
  const viceCaptainIsStarter = starterIdentities.has(candidateIdentity(viceCaptain))
  if (candidateName(captain) && captainIsStarter) {
    sections.strengths.push(section(
      'captain', 'Aanvoerders', 'C',
      `${candidateName(captain)} is captain${candidateName(viceCaptain) && viceCaptainIsStarter ? ` en ${candidateName(viceCaptain)} is vice-captain` : ''}.`,
      'neutral',
      [
        evidence('Captain', `${candidateName(captain)}${metric(captain, 'expectedPoints') === null ? '' : ` · ${formatPoints(metric(captain, 'expectedPoints'))}`}`),
        candidateName(viceCaptain) && viceCaptainIsStarter ? evidence('Vice-captain', `${candidateName(viceCaptain)}${metric(viceCaptain, 'expectedPoints') === null ? '' : ` · ${formatPoints(metric(viceCaptain, 'expectedPoints'))}`}`) : null,
      ],
    ))
  }

  const holdsFirst = firstRound.action.actionType === 'no-transfer'
  const noTransferRounds = Number(summary.noTransferRounds) || 0
  if (preseason?.valid) {
    sections.strategy.push(section(
      'strategy-preseason', 'Team klaar voor speelronde 1', '✓',
      `Deze voorseizoenaanpassingen kosten geen transferpunten. Na de optimalisatie start je speelronde 1 met ${formatMillions(preseason.bankAfter)} op de bank.`,
      'positive',
      [evidence('Wijzigingen', `${Number(preseason.changes?.changesMade ?? 0)}`), evidence('Transferpunten', '0')],
    ))
  } else if (holdsFirst) {
    const saved = firstRound.transfers.nextFreeTransfers > firstRound.transfers.freeTransfersBefore
    sections.strategy.push(section(
      'strategy-hold', saved ? 'Vrije transfer sparen' : 'Wachten', '◷',
      saved
        ? `De FVT Manager adviseert in speelronde ${firstRound.round} geen transfer te doen. Daardoor zijn in de volgende ronde ${firstRound.transfers.nextFreeTransfers} vrije transfers beschikbaar.`
        : `De FVT Manager adviseert in speelronde ${firstRound.round} geen transfer te doen; selectie, budget en transferkosten blijven die ronde ongewijzigd.`,
      'neutral',
      [evidence('Vrije transfers', `${firstRound.transfers.freeTransfersBefore} → ${firstRound.transfers.nextFreeTransfers}`), evidence('Transferkosten', `${firstRound.points.transferPointsCost} punten`)],
    ))
  } else {
    sections.strategy.push(section(
      'strategy-act', 'Direct handelen', '→',
      `De FVT Manager adviseert om in speelronde ${firstRound.round} direct ${firstRound.action.transfersMade === 2 ? 'twee transfers' : 'een transfer'} uit te voeren.`,
      firstRound.points.transferPointsCost > 0 ? 'warning' : 'positive',
      [evidence('Actie', firstRound.action.label), evidence('Netto rondeprojectie', formatPoints(firstRound.points.netExpectedPoints))],
    ))
  }

  if (preseason?.valid) {
    sections.transferReason.push(section(
      'preseason-changes', 'Onbeperkt optimaliseren', '→',
      comparison.available
        ? `De FVT Manager adviseert ${Number(preseason.changes?.changesMade ?? 0)} wijziging${Number(preseason.changes?.changesMade ?? 0) === 1 ? '' : 'en'} vóór de eerste deadline. De verwachte ronde-1-score gaat daarmee van ${formatPoints(comparison.initialExpectedPointsRound1)} naar ${formatPoints(comparison.optimizedExpectedPointsRound1)}. Deze aanpassingen kosten geen transferpunten.`
        : `De FVT Manager adviseert ${Number(preseason.changes?.changesMade ?? 0)} wijziging${Number(preseason.changes?.changesMade ?? 0) === 1 ? '' : 'en'} vóór de eerste deadline. Deze aanpassingen kosten geen transferpunten.`,
      'positive',
      [evidence('Kosten', 'Geen transferpunten'), evidence('Speelronde 1', 'Definitieve selectie')],
    ))
  } else {
    sections.transferReason.push(...createTransferReasons({ seasonPlan, seasonPlannerResult }))
  }

  if (timeline.length > 1) {
    sections.future.push(section(
      'future-horizon', 'Vooruitblik', '↗',
      firstTransfer
        ? `De eerste geplande transfer staat in speelronde ${firstTransfer.round}; de horizon loopt tot en met speelronde ${seasonPlan.period.endRound}.`
        : `Binnen de volledige horizon tot en met speelronde ${seasonPlan.period.endRound} adviseert de FVT Manager geen transfer.`,
      'neutral',
      [evidence('Horizon', `${seasonPlan.period.startRound}–${seasonPlan.period.endRound}`), evidence('Rondes zonder transfer', `${noTransferRounds}`), evidence('Eindstand vrije transfers', `${summary.finalFreeTransfers}`)],
    ))
  }

  const initialBank = finite(summary.startingBank)
  const finalBank = finite(summary.finalBank)
  if (initialBank !== null && finalBank !== null) {
    sections.summary.push(section(
      'finance', 'Budget', '€',
      `De bank verandert over het plan van ${formatMillions(initialBank)} naar ${formatMillions(finalBank)}.`,
      finalBank < 0 ? 'warning' : 'neutral',
      [evidence('Startbank', formatMillions(initialBank)), evidence('Eindbank', formatMillions(finalBank)), evidence('Verschil', formatMillions(finalBank - initialBank))],
    ))
  }

  const plannedOutgoingNames = new Set(timeline.flatMap((entry) => (
    entry.action.transferPairs ?? []
  )).map((pair) => String(pair?.playerOut?.name ?? '').trim()).filter(Boolean))
  const lowestMinutes = minutePlayers[0]
  const highestRiskPriority = validRisk.length
    ? [...validRisk].sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name, 'nl'))[0]
    : null
  const weakestFixturePriority = validFixtures.length
    ? [...validFixtures].sort((a, b) => a.fixture - b.fixture || a.name.localeCompare(b.name, 'nl'))[0]
    : null
  const priorityCandidates = [
    lowestMinutes && lowestMinutes.minutes < 60 && !plannedOutgoingNames.has(lowestMinutes.name)
      ? { impact: (60 - lowestMinutes.minutes) / 60, item: section('priority-minutes', 'Controleer speelzekerheid', '1', `${lowestMinutes.name} projecteert de minste minuten en blijft volgens de timeline in de selectie.`, 'warning', [evidence('Speler', lowestMinutes.name), evidence('Verwachte minuten', `${round(lowestMinutes.minutes, 0)}`)]) }
      : null,
    highestRiskPriority && highestRiskPriority.risk > 5 && !plannedOutgoingNames.has(highestRiskPriority.name)
      ? { impact: (highestRiskPriority.risk - 5) / 5, item: section('priority-risk', 'Beperk het hoogste spelersrisico', '2', `${highestRiskPriority.name} heeft de hoogste risicoscore en blijft volgens de timeline in de selectie.`, 'warning', [evidence('Speler', highestRiskPriority.name), evidence('Risicoscore', `${round(highestRiskPriority.risk, 1)} / 10`)]) }
      : null,
    weakestFixturePriority && weakestFixturePriority.fixture <= 4.5 && !plannedOutgoingNames.has(weakestFixturePriority.name)
      ? { impact: (4.5 - weakestFixturePriority.fixture) / 4.5, item: section('priority-fixture', 'Herbekijk het laagste fixtureprofiel', '3', `${weakestFixturePriority.name} heeft de laagste fixturescore en blijft volgens de timeline in de selectie.`, 'warning', [evidence('Speler', weakestFixturePriority.name), evidence('Fixturescore', `${round(weakestFixturePriority.fixture, 1)} / 10`)]) }
      : null,
    holdsFirst && !preseason?.valid
      ? { impact: -1, item: section('priority-ft', 'Volg de geplande no-transfer', '◷', `Doe in speelronde ${firstRound.round} geen transfer; daarna zijn ${firstRound.transfers.nextFreeTransfers} vrije transfers beschikbaar.`, 'neutral', [evidence('Vrije transfers', `${firstRound.transfers.freeTransfersBefore} → ${firstRound.transfers.nextFreeTransfers}`)]) }
      : null,
  ]
  sections.priority = uniqueSections(
    priorityCandidates
      .filter(Boolean)
      .sort((left, right) => right.impact - left.impact || left.item.key.localeCompare(right.item.key, 'en'))
      .map((candidate) => candidate.item),
  ).slice(0, 3).map((item, index) => ({ ...item, rank: index + 1 }))

  const allSections = uniqueSections([
    ...sections.overview, ...sections.strengths, ...sections.weaknesses,
    ...sections.strategy, ...sections.risk, ...sections.future, ...sections.summary,
  ])
  return {
    valid: true,
    errors: [],
    ...sections,
    sections: allSections,
    teamScore,
    optimizedTeamScore,
    comparison,
    source: {
      planType: seasonPlan.planType,
      rounds: timeline.length,
      transferOptionsAvailable: Number(transferPlannerResult?.result?.statistics?.returnedValidOptions ?? 0),
    },
  }
}

export default createManagerAnalysis
