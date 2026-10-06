import {
  calculateFvtScore,
} from './fvtScoreEngine.js'

/*
|==============================================================================
| FVT INSIGHTS ENGINE
|==============================================================================
|
| Deze engine vertaalt de technische FVT Fantasy Score
| naar begrijpelijke informatie voor de gebruiker.
|
| Verantwoordelijkheden:
|
| - sterrenbeoordeling;
| - sterke punten;
| - aandachtspunten;
| - automatische samenvatting;
| - betrouwbaarheidstekst;
| - presentatiegegevens voor de interface.
|
| Deze engine berekent de FVT Fantasy Score niet opnieuw.
| De score komt altijd uit:
|
| fvtScoreEngine.js
|
*/

/*
|==============================================================================
| ALGEMENE INSTELLINGEN
|==============================================================================
*/

const MAX_INSIGHTS =
  4

const MAX_SECONDARY_INSIGHTS =
  3

/*
 * Vorm wordt pas inhoudelijk beoordeeld
 * wanneer een speler minimaal drie
 * wedstrijden heeft gespeeld.
 *
 * Daarvoor is de vormscore nog te gevoelig
 * voor toeval en onvolledige informatie.
 */
const MIN_FORM_MATCHES =
  3

const PILLAR_LABELS = {
  potential:
    'Fantasy-potentie',

  availability:
    'Speelzekerheid',

  fixtures:
    'Programma',

  form:
    'Vorm',

  value:
    'Waarde',

  risk:
    'Laag risico',
}

/*
|==============================================================================
| HULPFUNCTIES
|==============================================================================
*/

function toNumber(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const normalizedValue =
    typeof value === 'string'
      ? value
          .trim()
          .replace(',', '.')
      : value

  const number =
    Number(
      normalizedValue,
    )

  return Number.isFinite(number)
    ? number
    : null
}

function clamp(
  value,
  minimum,
  maximum,
) {
  const number =
    toNumber(
      value,
    )

  if (number === null) {
    return minimum
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      number,
    ),
  )
}

function roundToOne(
  value,
) {
  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
      10,
    ) /
    10
  )
}

function normalizeText(
  value,
) {
  return String(
    value ??
    '',
  )
    .trim()
    .toLocaleLowerCase(
      'nl-NL',
    )
}

function uniqueById(
  values,
) {
  const seen =
    new Set()

  return values.filter(
    (value) => {
      const id =
        value?.id

      if (
        !id ||
        seen.has(id)
      ) {
        return false
      }

      seen.add(id)

      return true
    },
  )
}

function getPlayerName(
  player,
) {
  return (
    player?.name ||
    player?.playerName ||
    'Deze speler'
  )
}

function getFirstName(
  player,
) {
  const name =
    getPlayerName(
      player,
    )

  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .at(0) ||
    'Deze speler'
  )
}

function getPlayedFormMatchCount(
  player,
  fvt,
) {
  const rawOutlook =
    fvt?.rawOutlook ?? {}

  const formResult =
    rawOutlook.form ??
    rawOutlook.formResult ??
    rawOutlook.calculation
      ?.form ??
    null

  const rounds =
    Array.isArray(
      formResult?.rounds,
    )
      ? formResult.rounds
      : []

  const playedRounds =
    rounds.filter(
      (round) =>
        round?.played === true ||
        Number(
          round?.minutes,
        ) > 0,
    ).length

  if (playedRounds > 0) {
    return playedRounds
  }

  const profileAppearances =
    toNumber(
      player?.profile
        ?.match
        ?.statistieken
        ?.gespeeldeWedstrijden,
    )

  if (
    profileAppearances !== null
  ) {
    return Math.max(
      0,
      profileAppearances,
    )
  }

  const appearances =
    toNumber(
      player?.appearances ??
      player?.matchesPlayed ??
      player?.matches,
    )

  return Math.max(
    0,
    appearances ?? 0,
  )
}

function getFormDataStatus(
  player,
  fvt,
) {
  const playedMatches =
    getPlayedFormMatchCount(
      player,
      fvt,
    )

  return {
    playedMatches,

    minimumMatches:
      MIN_FORM_MATCHES,

    hasAnyData:
      playedMatches > 0,

    hasEnoughData:
      playedMatches >=
      MIN_FORM_MATCHES,

    matchesNeeded:
      Math.max(
        0,
        MIN_FORM_MATCHES -
        playedMatches,
      ),
  }
}

/*
|==============================================================================
| STERREN
|==============================================================================
|
| Sterren worden gebaseerd op de volledige score van 0 tot 100.
|
| We gebruiken halve sterren als numerieke tussenstap.
| De visuele interface kan later zelf bepalen hoe deze
| precies worden weergegeven.
|
*/

function calculateStarValue(
  score,
) {
  const normalizedScore =
    clamp(
      score,
      0,
      100,
    )

  /*
   * Voorbeelden:
   *
   * 90–100  -> 5 sterren
   * 80–89   -> 4,5 sterren
   * 70–79   -> 4 sterren
   * 60–69   -> 3,5 sterren
   * 50–59   -> 3 sterren
   * 40–49   -> 2,5 sterren
   * 30–39   -> 2 sterren
   * 20–29   -> 1,5 ster
   * 10–19   -> 1 ster
   * 0–9     -> 0,5 ster
   */

  const starValue =
    Math.ceil(
      normalizedScore /
      10,
    ) /
    2

  return clamp(
    starValue,
    0.5,
    5,
  )
}

function createStars(
  score,
) {
  const value =
    calculateStarValue(
      score,
    )

  const fullStars =
    Math.floor(
      value,
    )

  const hasHalfStar =
    value % 1 !== 0

  const emptyStars =
    Math.max(
      0,
      5 -
      fullStars -
      (
        hasHalfStar
          ? 1
          : 0
      ),
    )

  return {
    value,

    full:
      fullStars,

    half:
      hasHalfStar
        ? 1
        : 0,

    empty:
      emptyStars,

    accessibleLabel:
      `${String(value).replace(
        '.',
        ',',
      )} van de 5 sterren`,

    /*
     * Tijdelijke tekstweergave.
     *
     * Later kunnen we in de interface
     * echte stericonen gebruiken.
     */
    text:
      [
        ...Array(
          fullStars,
        ).fill('★'),

        ...Array(
          hasHalfStar
            ? 1
            : 0,
        ).fill('◐'),

        ...Array(
          emptyStars,
        ).fill('☆'),
      ].join(''),
  }
}

/*
|==============================================================================
| INZICHTOBJECTEN
|==============================================================================
*/

function createInsight({
  id,
  type,
  title,
  text,
  score = null,
  priority = 0,
  source = null,
}) {
  return {
    id,

    type,

    title,

    text,

    score:
      score === null
        ? null
        : roundToOne(
            score,
          ),

    priority,

    source,
  }
}

/*
|==============================================================================
| STERKE PUNTEN
|==============================================================================
*/

function buildStrengths(
  player,
  fvt,
) {
  const pillars =
    fvt?.pillars ?? {}

  const strengths = []

    const formData =
    getFormDataStatus(
      player,
      fvt,
    )

  if (
    pillars.potential >= 9
  ) {
    strengths.push(
      createInsight({
        id:
          'elite-potential',

        type:
          'strength',

        title:
          'Uitzonderlijke Fantasy-potentie',

        text:
          'Deze speler heeft een zeer hoog realistisch puntenplafond wanneer hij speelt.',

        score:
          pillars.potential,

        priority:
          100,

        source:
          'potential',
      }),
    )
  } else if (
    pillars.potential >= 8
  ) {
    strengths.push(
      createInsight({
        id:
          'high-potential',

        type:
          'strength',

        title:
          'Hoge Fantasy-potentie',

        text:
          'Het verwachte puntenrendement ligt duidelijk boven het gemiddelde.',

        score:
          pillars.potential,

        priority:
          90,

        source:
          'potential',
      }),
    )
  } else if (
    pillars.potential >= 7
  ) {
    strengths.push(
      createInsight({
        id:
          'good-potential',

        type:
          'strength',

        title:
          'Goede Fantasy-potentie',

        text:
          'Deze speler heeft voldoende mogelijkheden om structureel Fantasy-punten te produceren.',

        score:
          pillars.potential,

        priority:
          72,

        source:
          'potential',
      }),
    )
  }

  if (
    pillars.availability >= 9
  ) {
    strengths.push(
      createInsight({
        id:
          'elite-availability',

        type:
          'strength',

        title:
          'Zeer hoge speelzekerheid',

        text:
          'De verwachte rol en minuten wijzen op een vrijwel zekere vaste basisplaats.',

        score:
          pillars.availability,

        priority:
          98,

        source:
          'availability',
      }),
    )
  } else if (
    pillars.availability >= 8
  ) {
    strengths.push(
      createInsight({
        id:
          'high-availability',

        type:
          'strength',

        title:
          'Hoge speelzekerheid',

        text:
          'Deze speler wordt naar verwachting structureel en veelvuldig ingezet.',

        score:
          pillars.availability,

        priority:
          88,

        source:
          'availability',
      }),
    )
  } else if (
    pillars.availability >= 7
  ) {
    strengths.push(
      createInsight({
        id:
          'good-availability',

        type:
          'strength',

        title:
          'Goede kans op veel minuten',

        text:
          'De verwachte rol is gunstig genoeg om regelmatig Fantasy-punten te kunnen verzamelen.',

        score:
          pillars.availability,

        priority:
          70,

        source:
          'availability',
      }),
    )
  }

  if (
    pillars.fixtures >= 8.5
  ) {
    strengths.push(
      createInsight({
        id:
          'elite-fixtures',

        type:
          'strength',

        title:
          'Uitstekend programma',

        text:
          'De aankomende wedstrijden bieden bovengemiddeld veel kansen op Fantasy-rendement.',

        score:
          pillars.fixtures,

        priority:
          94,

        source:
          'fixtures',
      }),
    )
  } else if (
    pillars.fixtures >= 7
  ) {
    strengths.push(
      createInsight({
        id:
          'good-fixtures',

        type:
          'strength',

        title:
          'Gunstig aankomend programma',

        text:
          'Het programma werkt de komende speelronden in het voordeel van deze speler.',

        score:
          pillars.fixtures,

        priority:
          78,

        source:
          'fixtures',
      }),
    )
  }

    if (
    formData.hasEnoughData &&
    pillars.form >= 8.5
  ) {
    strengths.push(
      createInsight({
        id:
          'elite-form',

        type:
          'strength',

        title:
          'Uitstekende recente vorm',

        text:
          'Continuïteit en recente prestaties wijzen beide duidelijk omhoog.',

        score:
          pillars.form,

        priority:
          92,

        source:
          'form',
      }),
    )
    } else if (
    formData.hasEnoughData &&
    pillars.form >= 7
  ) {
    strengths.push(
      createInsight({
        id:
          'good-form',

        type:
          'strength',

        title:
          'Goede recente vorm',

        text:
          'De recente speelminuten en prestaties vormen een positief signaal.',

        score:
          pillars.form,

        priority:
          76,

        source:
          'form',
      }),
    )
  }

  if (
    pillars.value >= 8.5
  ) {
    strengths.push(
      createInsight({
        id:
          'elite-value',

        type:
          'strength',

        title:
          'Uitstekende prijs-kwaliteitverhouding',

        text:
          'Het huidige Fantasy-rendement is zeer sterk in verhouding tot de prijs.',

        score:
          pillars.value,

        priority:
          91,

        source:
          'value',
      }),
    )
  } else if (
    pillars.value >= 7
  ) {
    strengths.push(
      createInsight({
        id:
          'good-value',

        type:
          'strength',

        title:
          'Goede waarde',

        text:
          'Deze speler levert naar verwachting bovengemiddeld rendement voor zijn prijs.',

        score:
          pillars.value,

        priority:
          75,

        source:
          'value',
      }),
    )
  }

  if (
    pillars.risk >= 8.5
  ) {
    strengths.push(
      createInsight({
        id:
          'very-low-risk',

        type:
          'strength',

        title:
          'Zeer laag risicoprofiel',

        text:
          'Er zijn weinig signalen die de verwachte Fantasy-waarde bedreigen.',

        score:
          pillars.risk,

        priority:
          86,

        source:
          'risk',
      }),
    )
  } else if (
    pillars.risk >= 7
  ) {
    strengths.push(
      createInsight({
        id:
          'low-risk',

        type:
          'strength',

        title:
          'Laag risico',

        text:
          'De kans op onverwachte problemen lijkt momenteel beperkt.',

        score:
          pillars.risk,

        priority:
          68,

        source:
          'risk',
      }),
    )
  }

  if (
    player?.penalties === true ||
    player?.scoutProfile
      ?.penalties === true
  ) {
    strengths.push(
      createInsight({
        id:
          'penalty-taker',

        type:
          'strength',

        title:
          'Strafschopnemer',

        text:
          'Strafschoppen geven deze speler extra en relatief voorspelbare doelpuntenpotentie.',

        priority:
          89,

        source:
          'metadata',
      }),
    )
  }

  if (
    player?.corners === true ||
    player?.scoutProfile
      ?.corners === true
  ) {
    strengths.push(
      createInsight({
        id:
          'corners',

        type:
          'strength',

        title:
          'Neemt corners',

        text:
          'Corners vergroten de kans op assists en aanvullende Fantasy-punten.',

        priority:
          65,

        source:
          'metadata',
      }),
    )
  }

  if (
    player?.freeKicks === true ||
    player?.scoutProfile
      ?.freeKicks === true
  ) {
    strengths.push(
      createInsight({
        id:
          'free-kicks',

        type:
          'strength',

        title:
          'Neemt vrije trappen',

        text:
          'Directe en indirecte vrije trappen bieden extra scoringsmogelijkheden.',

        priority:
          66,

        source:
          'metadata',
      }),
    )
  }

  return uniqueById(
    strengths,
  )
    .sort(
      (
        left,
        right,
      ) =>
        right.priority -
        left.priority,
    )
    .slice(
      0,
      MAX_INSIGHTS,
    )
}

/*
|==============================================================================
| AANDACHTSPUNTEN
|==============================================================================
*/

function buildConcerns(
  player,
  fvt,
) {
  const pillars =
    fvt?.pillars ?? {}

  const concerns = []

  /*
   * Vorm en waarde mogen alleen als
   * aandachtspunt worden gebruikt wanneer
   * daar daadwerkelijk actuele data voor is.
   *
   * Een neutrale tijdelijke score van 5,0
   * betekent niet automatisch dat vorm of
   * waarde slecht is.
   */
    const formData =
    getFormDataStatus(
      player,
      fvt,
    )

  const hasFormData =
    formData.hasEnoughData

  const hasValueData =
    fvt?.rawOutlook
      ?.value
      ?.hasData === true

  if (
    pillars.potential < 4.5
  ) {
    concerns.push(
      createInsight({
        id:
          'low-potential',

        type:
          'concern',

        title:
          'Beperkte Fantasy-potentie',

        text:
          'Het verwachte puntenplafond ligt momenteel duidelijk onder het gemiddelde.',

        score:
          pillars.potential,

        priority:
          94,

        source:
          'potential',
      }),
    )
  } else if (
    pillars.potential < 6
  ) {
    concerns.push(
      createInsight({
        id:
          'moderate-potential',

        type:
          'concern',

        title:
          'Beperkt puntenplafond',

        text:
          'Deze speler lijkt voor zijn waarde relatief afhankelijk van specifieke wedstrijdsituaties.',

        score:
          pillars.potential,

        priority:
          66,

        source:
          'potential',
      }),
    )
  }

  if (
    pillars.availability < 4.5
  ) {
    concerns.push(
      createInsight({
        id:
          'very-low-availability',

        type:
          'concern',

        title:
          'Zeer onzekere speelminuten',

        text:
          'De verwachte rol biedt momenteel onvoldoende zekerheid op structurele inzet.',

        score:
          pillars.availability,

        priority:
          100,

        source:
          'availability',
      }),
    )
  } else if (
    pillars.availability < 6
  ) {
    concerns.push(
      createInsight({
        id:
          'low-availability',

        type:
          'concern',

        title:
          'Onzekere speelminuten',

        text:
          'Een basisplaats of voldoende speelminuten zijn momenteel niet vanzelfsprekend.',

        score:
          pillars.availability,

        priority:
          92,

        source:
          'availability',
      }),
    )
  }

  if (
    pillars.fixtures < 4
  ) {
    concerns.push(
      createInsight({
        id:
          'very-hard-fixtures',

        type:
          'concern',

        title:
          'Zwaar aankomend programma',

        text:
          'De komende tegenstanders beperken de verwachte Fantasy-kansen aanzienlijk.',

        score:
          pillars.fixtures,

        priority:
          91,

        source:
          'fixtures',
      }),
    )
  } else if (
    pillars.fixtures < 5.5
  ) {
    concerns.push(
      createInsight({
        id:
          'hard-fixtures',

        type:
          'concern',

        title:
          'Ongunstig programma',

        text:
          'Het aankomende schema werkt voorlopig niet in het voordeel van deze speler.',

        score:
          pillars.fixtures,

        priority:
          72,

        source:
          'fixtures',
      }),
    )
  }

    if (
    hasFormData &&
    pillars.form < 4
  ) {
    concerns.push(
      createInsight({
        id:
          'very-poor-form',

        type:
          'concern',

        title:
          'Slechte recente vorm',

        text:
          'Recente inzet en prestaties geven momenteel duidelijke reden tot voorzichtigheid.',

        score:
          pillars.form,

        priority:
          89,

        source:
          'form',
      }),
    )
    } else if (
    hasFormData &&
    pillars.form < 5.5
  ) {
    concerns.push(
      createInsight({
        id:
          'poor-form',

        type:
          'concern',

        title:
          'Matige recente vorm',

        text:
          'De recente speelminuten of prestaties zijn nog niet overtuigend.',

        score:
          pillars.form,

        priority:
          69,

        source:
          'form',
      }),
    )
  }

    if (
    hasValueData &&
    pillars.value < 4
  ) {
    concerns.push(
      createInsight({
        id:
          'very-poor-value',

        type:
          'concern',

        title:
          'Zwakke prijs-kwaliteitverhouding',

        text:
          'De huidige prijs lijkt hoog in verhouding tot het actuele Fantasy-rendement.',

        score:
          pillars.value,

        priority:
          87,

        source:
          'value',
      }),
    )
    } else if (
    hasValueData &&
    pillars.value < 5.5
  ) {
    concerns.push(
      createInsight({
        id:
          'poor-value',

        type:
          'concern',

        title:
          'Prijs vraagt om voorzichtigheid',

        text:
          'Het verwachte rendement rechtvaardigt de huidige prijs nog niet overtuigend.',

        score:
          pillars.value,

        priority:
          67,

        source:
          'value',
      }),
    )
  }

  if (
    pillars.risk < 3.5
  ) {
    concerns.push(
      createInsight({
        id:
          'very-high-risk',

        type:
          'concern',

        title:
          'Zeer hoog risicoprofiel',

        text:
          'Meerdere onzekerheden kunnen de verwachte Fantasy-waarde sterk beïnvloeden.',

        score:
          pillars.risk,

        priority:
          99,

        source:
          'risk',
      }),
    )
  } else if (
    pillars.risk < 5.5
  ) {
    concerns.push(
      createInsight({
        id:
          'high-risk',

        type:
          'concern',

        title:
          'Verhoogd risico',

        text:
          'De verwachte uitkomst is gevoeliger voor rotatie, fitheid of andere onzekerheden.',

        score:
          pillars.risk,

        priority:
          90,

        source:
          'risk',
      }),
    )
  }

  const status =
    normalizeText(
      player?.status ??
      player?.scoutProfile
        ?.status,
    )

  if (
    [
      'geblesseerd',
      'blessure',
      'injured',
    ].includes(status)
  ) {
    concerns.push(
      createInsight({
        id:
          'injured',

        type:
          'concern',

        title:
          'Blessure',

        text:
          'De speler is momenteel als geblesseerd geregistreerd.',

        priority:
          110,

        source:
          'metadata',
      }),
    )
  }

  if (
    [
      'geschorst',
      'suspended',
    ].includes(status)
  ) {
    concerns.push(
      createInsight({
        id:
          'suspended',

        type:
          'concern',

        title:
          'Geschorst',

        text:
          'De speler is momenteel niet inzetbaar door een schorsing.',

        priority:
          110,

        source:
          'metadata',
      }),
    )
  }

  if (
    [
      'twijfelachtig',
      'doubt',
      'doubtful',
    ].includes(status)
  ) {
    concerns.push(
      createInsight({
        id:
          'doubtful',

        type:
          'concern',

        title:
          'Inzetbaarheid twijfelachtig',

        text:
          'Het is nog onzeker of deze speler volledig inzetbaar is.',

        priority:
          101,

        source:
          'metadata',
      }),
    )
  }

  if (
    player?.rotationRisk === true ||
    player?.scoutProfile
      ?.rotationRisk === true
  ) {
    concerns.push(
      createInsight({
        id:
          'rotation-risk',

        type:
          'concern',

        title:
          'Rotatierisico',

        text:
          'De speler loopt een verhoogde kans om niet iedere wedstrijd te starten.',

        priority:
          86,

        source:
          'metadata',
      }),
    )
  }

  if (
    player?.injuryRisk === true ||
    player?.scoutProfile
      ?.injuryRisk === true
  ) {
    concerns.push(
      createInsight({
        id:
          'injury-risk',

        type:
          'concern',

        title:
          'Verhoogd blessurerisico',

        text:
          'Fitheid blijft een factor om nadrukkelijk te volgen.',

        priority:
          84,

        source:
          'metadata',
      }),
    )
  }

  if (
    player?.newLeague === true ||
    player?.scoutProfile
      ?.newLeague === true
  ) {
    concerns.push(
      createInsight({
        id:
          'new-league',

        type:
          'concern',

        title:
          'Nieuwe competitie',

        text:
          'Aanpassing aan een nieuwe competitie zorgt voor extra onzekerheid.',

        priority:
          61,

        source:
          'metadata',
      }),
    )
  }

  return uniqueById(
    concerns,
  )
    .sort(
      (
        left,
        right,
      ) =>
        right.priority -
        left.priority,
    )
    .slice(
      0,
      MAX_INSIGHTS,
    )
}

/*
|==============================================================================
| DATA- EN BETROUWBAARHEIDSINZICHTEN
|==============================================================================
*/

function buildDataNotes(
  player,
  fvt,
) {
  const notes = []

    const formData =
    getFormDataStatus(
      player,
      fvt,
    )

  const confidenceScore =
    toNumber(
      fvt?.confidence?.score,
    ) || 0

  const formResult =
    fvt?.rawOutlook
      ?.formResult ??
    fvt?.rawOutlook
      ?.calculation
      ?.form ??
    null

  const valueResult =
    fvt?.rawOutlook
      ?.valueResult ??
    fvt?.rawOutlook
      ?.calculation
      ?.value ??
    null

  if (
    confidenceScore < 25
  ) {
    notes.push(
      createInsight({
        id:
          'very-low-confidence',

        type:
          'data',

        title:
          'Nog weinig betrouwbare data',

        text:
          'De beoordeling steunt momenteel grotendeels op verwachtingen en voorlopige informatie.',

        priority:
          100,

        source:
          'confidence',
      }),
    )
  } else if (
    confidenceScore < 50
  ) {
    notes.push(
      createInsight({
        id:
          'low-confidence',

        type:
          'data',

        title:
          'Beoordeling is nog voorlopig',

        text:
          'Nieuwe wedstrijden kunnen de FVT Fantasy Score nog relatief sterk veranderen.',

        priority:
          82,

        source:
          'confidence',
      }),
    )
  }

    if (
    !formData.hasEnoughData
  ) {
    const matchesNeeded =
      formData.matchesNeeded

    notes.push(
      createInsight({
        id:
          'insufficient-form-data',

        type:
          'data',

        title:
          formData.hasAnyData
            ? 'Vorm nog in opbouw'
            : 'Nog geen actuele vormdata',

        text:
          formData.hasAnyData
            ? (
                `Vorm wordt pas inhoudelijk beoordeeld na minimaal ` +
                `${MIN_FORM_MATCHES} gespeelde wedstrijden. ` +
                `Er ${matchesNeeded === 1 ? 'is' : 'zijn'} nog ` +
                `${matchesNeeded} wedstrijd${matchesNeeded === 1 ? '' : 'en'} nodig.`
              )
            : (
                `Vorm wordt tijdelijk niet als plus- of minpunt gebruikt ` +
                `totdat de speler minimaal ${MIN_FORM_MATCHES} wedstrijden heeft gespeeld.`
              ),

        priority:
          78,

        source:
          'form',
      }),
    )
  }

  if (
    valueResult?.hasData ===
    false
  ) {
    notes.push(
      createInsight({
        id:
          'no-value-data',

        type:
          'data',

        title:
          'Nog geen actuele waardedata',

        text:
          'Waarde wordt pas inhoudelijk beoordeeld wanneer er actuele prestaties beschikbaar zijn.',

        priority:
          77,

        source:
          'value',
      }),
    )
  }

  const appearances =
    toNumber(
      player?.appearances ??
      player?.matchesPlayed,
    )

  if (
    appearances === 0
  ) {
    notes.push(
      createInsight({
        id:
          'no-appearances',

        type:
          'data',

        title:
          'Nog geen optreden dit seizoen',

        text:
          'De beoordeling kan daarom nog niet volledig door actuele wedstrijddata worden onderbouwd.',

        priority:
          80,

        source:
          'player-data',
      }),
    )
  }

  return uniqueById(
    notes,
  )
    .sort(
      (
        left,
        right,
      ) =>
        right.priority -
        left.priority,
    )
    .slice(
      0,
      MAX_SECONDARY_INSIGHTS,
    )
}

/*
|==============================================================================
| AUTOMATISCHE HOOFDCONCLUSIE
|==============================================================================
*/

function getScoreIntroduction(
  fvt,
) {
  const score =
    toNumber(
      fvt?.score,
    ) || 0

  if (score >= 90) {
    return (
      'behoort momenteel tot de absolute topkeuzes'
    )
  }

  if (score >= 80) {
    return (
      'is momenteel een zeer sterke Fantasy-keuze'
    )
  }

  if (score >= 70) {
    return (
      'is momenteel een interessante Fantasy-optie'
    )
  }

  if (score >= 60) {
    return (
      'kan interessant zijn wanneer hij bij je strategie past'
    )
  }

  if (score >= 50) {
    return (
      'vraagt momenteel om een voorzichtige afweging'
    )
  }

  return (
    'is op dit moment moeilijk aan te bevelen'
  )
}

function getStrengthSentence(
  strengths,
) {
  if (!strengths.length) {
    return ''
  }

  const titles =
    strengths
      .slice(
        0,
        2,
      )
      .map(
        (insight) =>
          insight.title
            .toLocaleLowerCase(
              'nl-NL',
            ),
      )

  if (titles.length === 1) {
    return (
      ` Het belangrijkste positieve punt is ${titles[0]}.`
    )
  }

  return (
    ` De belangrijkste pluspunten zijn ${titles[0]} en ${titles[1]}.`
  )
}

function getConcernSentence(
  concerns,
) {
  if (!concerns.length) {
    return (
      ' Er zijn momenteel geen zwaarwegende aandachtspunten.'
    )
  }

  const mainConcern =
    concerns[0]
      .title
      .toLocaleLowerCase(
        'nl-NL',
      )

  return (
    ` Het belangrijkste aandachtspunt is ${mainConcern}.`
  )
}

function getConfidenceSentence(
  fvt,
) {
  const confidence =
    fvt?.confidence ?? {}

  const score =
    toNumber(
      confidence.score,
    ) || 0

  if (score >= 85) {
    return (
      ' De onderliggende beoordeling heeft een zeer hoge betrouwbaarheid.'
    )
  }

  if (score >= 70) {
    return (
      ' De onderliggende beoordeling heeft een hoge betrouwbaarheid.'
    )
  }

  if (score >= 50) {
    return (
      ' De betrouwbaarheid van de voorspelling is momenteel gemiddeld.'
    )
  }

  if (score >= 25) {
    return (
      ' De beoordeling is voorlopig en kan door nieuwe data nog duidelijk veranderen.'
    )
  }

  return (
    ' Er is nog weinig actuele data, waardoor deze beoordeling vooral als eerste indicatie moet worden gezien.'
  )
}

function buildSummary({
  player,
  fvt,
  strengths,
  concerns,
}) {
  const firstName =
    getFirstName(
      player,
    )

  const score =
    toNumber(
      fvt?.score,
    ) ?? 0

  const confidenceScore =
    toNumber(
      fvt?.confidence?.score,
    ) ?? 0

  const mainStrength =
    strengths[0] ??
    null

  const mainConcern =
    concerns[0] ??
    null

  let opening =
    `${firstName} vraagt momenteel om een zorgvuldige afweging.`

  if (score >= 90) {
    opening =
      `${firstName} behoort momenteel tot de absolute topkeuzes.`
  } else if (score >= 80) {
    opening =
      `${firstName} is momenteel een zeer sterke Fantasy-keuze.`
  } else if (score >= 70) {
    opening =
      `${firstName} is momenteel een aantrekkelijke Fantasy-optie.`
  } else if (score >= 60) {
    opening =
      `${firstName} is een interessante optie om nadrukkelijk te volgen.`
  } else if (score >= 50) {
    opening =
      `${firstName} heeft interessante eigenschappen, maar is nog geen overtuigende aankoop.`
  } else {
    opening =
      `${firstName} is op dit moment moeilijk aan te bevelen.`
  }

  let analysis =
    ''

  if (
    mainStrength &&
    mainConcern
  ) {
    analysis =
      ` ${mainStrength.title} werkt duidelijk in zijn voordeel, ` +
      `maar ${mainConcern.title.toLocaleLowerCase(
        'nl-NL',
      )} voorkomt momenteel een hogere beoordeling.`
  } else if (mainStrength) {
    analysis =
      ` ${mainStrength.title} is momenteel het belangrijkste argument in zijn voordeel.`
  } else if (mainConcern) {
    analysis =
      ` ${mainConcern.title} is momenteel de belangrijkste reden om voorzichtig te blijven.`
  } else {
    analysis =
      ' Er is momenteel geen uitgesproken doorslaggevend plus- of minpunt.'
  }

  let confidenceText =
    ' De beoordeling is voorlopig door beperkte actuele data.'

  if (confidenceScore >= 85) {
    confidenceText =
      ' De beoordeling wordt ondersteund door zeer betrouwbare data.'
  } else if (confidenceScore >= 70) {
    confidenceText =
      ' De beoordeling wordt ondersteund door betrouwbare data.'
  } else if (confidenceScore >= 50) {
    confidenceText =
      ' De betrouwbaarheid van de voorspelling is momenteel gemiddeld.'
  }

  return (
    opening +
    analysis +
    confidenceText
  )
}

/*
|==============================================================================
| KORTE PRESENTATIETEKST
|==============================================================================
*/

function buildHeadline(
  fvt,
) {
  const tierLabel =
    fvt?.tier?.label ??
    'Nog niet beoordeeld'

  const badgeLabel =
    fvt?.badge?.label ??
    ''

  if (
    badgeLabel &&
    badgeLabel !==
      tierLabel
  ) {
    return {
      title:
        tierLabel,

      subtitle:
        badgeLabel,
    }
  }

  return {
    title:
      tierLabel,

    subtitle:
      'FVT Fantasy Score',
  }
}

/*
|==============================================================================
| BELANGRIJKSTE REDENEN
|==============================================================================
|
| De volledige Insights Engine kan meerdere sterke
| punten, zorgen en datanotities teruggeven.
|
| Voor de hoofdkaart selecteren we alleen de meest
| relevante redenen. Zo blijft de uitleg overzichtelijk.
|
*/

function buildPrimaryReasons({
  strengths,
  concerns,
  dataNotes,
}) {
  const primaryStrengths =
    strengths
      .slice(
        0,
        3,
      )

  const primaryConcerns =
    concerns
      .slice(
        0,
        2,
      )

  const primaryDataNotes =
    dataNotes
      .slice(
        0,
        2,
      )

  return {
    strengths:
      primaryStrengths,

    concerns:
      primaryConcerns,

    dataNotes:
      primaryDataNotes,

    /*
     * Eén gecombineerde lijst voor schermen
     * die alleen de belangrijkste argumenten
     * onder elkaar willen tonen.
     */
    all: [
      ...primaryStrengths,
      ...primaryConcerns,
      ...primaryDataNotes,
    ],
  }
}

/*
|==============================================================================
| ERNSTIGE WAARSCHUWINGEN
|==============================================================================
*/

function hasConcern(
  concerns,
  ids,
) {
  const safeIds =
    Array.isArray(ids)
      ? ids
      : [ids]

  return concerns.some(
    (concern) =>
      safeIds.includes(
        concern?.id,
      ),
  )
}

function getCriticalStatus(
  concerns,
) {
  if (
    hasConcern(
      concerns,
      'suspended',
    )
  ) {
    return {
      id:
        'suspended',

      label:
        'Niet selecteren',

      text:
        'De speler is momenteel geschorst en daardoor niet direct inzetbaar.',
    }
  }

  if (
    hasConcern(
      concerns,
      'injured',
    )
  ) {
    return {
      id:
        'injured',

      label:
        'Eerst fitheid afwachten',

      text:
        'De speler staat als geblesseerd geregistreerd. Wacht op duidelijkheid over zijn herstel.',
    }
  }

  if (
    hasConcern(
      concerns,
      'doubtful',
    )
  ) {
    return {
      id:
        'doubtful',

      label:
        'Opstelling afwachten',

      text:
        'De inzetbaarheid is nog twijfelachtig. Controleer het laatste teamnieuws.',
    }
  }

  return null
}

/*
|==============================================================================
| FANTASY-ADVIES
|==============================================================================
*/

function getAdviceLevel({
  score,
  confidenceScore,
  pillars,
  concerns,
}) {
  const criticalStatus =
    getCriticalStatus(
      concerns,
    )

  if (criticalStatus) {
    return {
      id:
        criticalStatus.id,

      label:
        criticalStatus.label,

      action:
        'Afwachten',

      className:
        'danger',

      priority:
        100,

      text:
        criticalStatus.text,
    }
  }

  if (
    score >= 88 &&
    pillars.availability >= 8 &&
    pillars.risk >= 7 &&
    confidenceScore >= 50
  ) {
    return {
      id:
        'must-have',

      label:
        'Must-have',

      action:
        'Sterk kopen',

      className:
        'elite',

      priority:
        95,

      text:
        'Deze speler combineert een zeer hoge totaalscore met voldoende speelzekerheid en een gunstig risicoprofiel.',
    }
  }

  if (
    score >= 80 &&
    confidenceScore >= 40
  ) {
    return {
      id:
        'strong-buy',

      label:
        'Sterke aankoop',

      action:
        'Kopen',

      className:
        'strong',

      priority:
        88,

      text:
        'Deze speler behoort momenteel tot de sterkste Fantasy-opties.',
    }
  }

  if (
    score >= 72
  ) {
    return {
      id:
        'serious-option',

      label:
        'Serieuze optie',

      action:
        'Overwegen',

      className:
        'positive',

      priority:
        76,

      text:
        'Deze speler heeft voldoende sterke eigenschappen om serieus voor je team te overwegen.',
    }
  }

  if (
    score >= 63
  ) {
    return {
      id:
        'strategy-dependent',

      label:
        'Situatieafhankelijk',

      action:
        'Alleen passend kopen',

      className:
        'situational',

      priority:
        62,

      text:
        'Deze speler kan interessant zijn wanneer zijn prijs, rol en programma goed bij je strategie aansluiten.',
    }
  }

  if (
    score >= 53
  ) {
    return {
      id:
        'watchlist',

      label:
        'Op de radar houden',

      action:
        'Volgen',

      className:
        'watchlist',

      priority:
        48,

      text:
        'Er zijn interessante kenmerken, maar nog onvoldoende redenen voor een overtuigende aankoop.',
    }
  }

  return {
    id:
      'avoid',

    label:
      'Voorlopig vermijden',

    action:
      'Niet kopen',

    className:
      'negative',

    priority:
      30,

    text:
      'De huidige combinatie van potentie, zekerheid, waarde en risico is onvoldoende aantrekkelijk.',
  }
}

/*
|==============================================================================
| ADVIESONDERBOUWING
|==============================================================================
*/

function buildAdviceReason({
  strengths,
  concerns,
  dataNotes,
}) {
  const mainStrength =
    strengths[0] ??
    null

  const mainConcern =
    concerns[0] ??
    null

  const mainDataNote =
    dataNotes[0] ??
    null

  if (
    mainStrength &&
    mainConcern
  ) {
    return (
      `${mainStrength.title} is het belangrijkste pluspunt, ` +
      `maar ${mainConcern.title.toLocaleLowerCase(
        'nl-NL',
      )} vraagt om voorzichtigheid.`
    )
  }

  if (mainStrength) {
    return (
      `${mainStrength.title} is momenteel het belangrijkste argument vóór deze speler.`
    )
  }

  if (mainConcern) {
    return (
      `${mainConcern.title} is momenteel het belangrijkste argument om terughoudend te zijn.`
    )
  }

  if (mainDataNote) {
    return (
      `${mainDataNote.title}. De beoordeling kan daardoor nog veranderen.`
    )
  }

  return (
    'Er is momenteel geen uitgesproken doorslaggevend plus- of minpunt.'
  )
}

/*
|==============================================================================
| BESLISPROFIEL
|==============================================================================
*/

function buildDecisionProfile({
  player,
  fvt,
  strengths,
  concerns,
  dataNotes,
}) {
  const score =
    toNumber(
      fvt?.score,
    ) || 0

  const confidenceScore =
    toNumber(
      fvt?.confidence?.score,
    ) || 0

  const pillars =
    fvt?.pillars ?? {
      potential:
        5,

      availability:
        5,

      fixtures:
        5,

      form:
        5,

      value:
        5,

      risk:
        5,
    }

  const advice =
    getAdviceLevel({
      score,

      confidenceScore,

      pillars,

      concerns,
    })

  const floor =
    toNumber(
      fvt?.range?.floor,
    )

  const ceiling =
    toNumber(
      fvt?.range?.ceiling,
    )

  const playerName =
    getPlayerName(
      player,
    )

  const rangeText =
    floor !== null &&
    ceiling !== null
      ? (
          `De realistische bandbreedte ligt momenteel tussen ` +
          `${Math.round(floor)} en ${Math.round(ceiling)}.`
        )
      : (
          'Er is nog geen betrouwbare bandbreedte beschikbaar.'
        )

  const confidenceText =
    confidenceScore >= 70
      ? 'De beoordeling wordt door relatief betrouwbare data ondersteund.'
      : confidenceScore >= 40
        ? 'De beoordeling heeft momenteel een gemiddelde betrouwbaarheid.'
        : 'De beoordeling is nog voorlopig door beperkte actuele data.'

  const reason =
    buildAdviceReason({
      strengths,

      concerns,

      dataNotes,
    })

  return {
    /*
     * Hoofdadvies voor badges en styling.
     */
    id:
      advice.id,

    label:
      advice.label,

    action:
      advice.action,

    className:
      advice.className,

    priority:
      advice.priority,

    /*
     * Korte uitleg bij het advies.
     */
    text:
      advice.text,

    reason,

    /*
     * Volledig automatisch eindoordeel.
     */
    verdict:
      `${playerName}: ${advice.label}. ` +
      `${advice.text} ` +
      `${reason} ` +
      `${rangeText} ` +
      `${confidenceText}`,

    rangeText,

    confidenceText,

    score:
      roundToOne(
        score,
      ),

    confidenceScore:
      Math.round(
        confidenceScore,
      ),
  }
}

/*
|==============================================================================
| PUBLIEKE FUNCTIES
|==============================================================================
*/

/*
 * Gebruik deze functie wanneer de FVT-score
 * al eerder is berekend.
 *
 * Daarmee voorkomen we dubbele berekeningen
 * in schermen die de score al nodig hadden.
 */
export function buildFvtInsights({
  player,
  fvtScore,
} = {}) {
  const safeFvtScore =
    fvtScore ?? {
      score:
        50,

      pillars: {
        potential:
          5,

        availability:
          5,

        fixtures:
          5,

        form:
          5,

        value:
          5,

        risk:
          5,
      },

      confidence: {
        score:
          0,

        label:
          'Nog geen data',
      },

      tier: {
        label:
          'Nog niet beoordeeld',
      },

      badge: {
        label:
          'Voorlopig afwachten',
      },
    }

  const stars =
    createStars(
      safeFvtScore.score,
    )

  const strengths =
    buildStrengths(
      player,
      safeFvtScore,
    )

  const concerns =
    buildConcerns(
      player,
      safeFvtScore,
    )

  const dataNotes =
    buildDataNotes(
      player,
      safeFvtScore,
    )

  const headline =
    buildHeadline(
      safeFvtScore,
    )

  const summary =
    buildSummary({
      player,

      fvt:
        safeFvtScore,

      strengths,

      concerns,
    })

  const primaryReasons =
    buildPrimaryReasons({
      strengths,

      concerns,

      dataNotes,
    })

  const decision =
    buildDecisionProfile({
      player,

      fvt:
        safeFvtScore,

      strengths,

      concerns,

      dataNotes,
    })

    return {
    stars,

    headline,

    strengths,

    concerns,

    dataNotes,

    summary,

    /*
     * Alleen de belangrijkste redenen voor
     * compacte kaarten en snelle uitleg.
     */
    primaryReasons,

    /*
     * Concreet advies voor kopen, volgen,
     * afwachten of vermijden.
     */
    decision,

    counts: {
      strengths:
        strengths.length,

      concerns:
        concerns.length,

      dataNotes:
        dataNotes.length,

      primaryReasons:
        primaryReasons
          .all
          .length,
    },
  }
}

/*
 * Gemakkelijke alles-in-één-functie.
 *
 * Deze berekent eerst de FVT Fantasy Score
 * en bouwt daarna de inzichten.
 */
export function calculateFvtInsights(
  player,
) {
  const fvtScore =
    calculateFvtScore(
      player,
    )

  const insights =
    buildFvtInsights({
      player,
      fvtScore,
    })

  return {
    ...insights,

    fvtScore,
  }
}