import { runManagerOptimizerCore } from '../services/optimizer/managerOptimizer.js'
import { compactOptimizerResult } from '../services/optimizer/optimizerTransport.js'

const PROGRESS_INTERVAL_MS = 250

export function createUiResult(result) {
  if (!result || typeof result !== 'object') return result

  const transferResult = result.transferPlannerResult
  const seasonResult = result.seasonPlannerResult
  const {
    validOptions: _validOptions,
    blockedOptions: _blockedOptions,
    ...compactTransferResult
  } = transferResult?.result ?? {}
  const compactStatistics = seasonResult?.result?.statistics
    ? {
        ...seasonResult.result.statistics,
        generations: (seasonResult.result.statistics.generations ?? []).map(
          ({ stateProfiles: _stateProfiles, ...generation }) => generation,
        ),
      }
    : null
  const compactPlannerState = (state) => state ? {
    id: state.id,
    round: state.round,
    bank: state.bank,
    freeTransfers: state.freeTransfers,
    chipState: state.chipState,
    cumulativeExpectedPoints: state.cumulativeExpectedPoints,
    cumulativeTransferPointsCost: state.cumulativeTransferPointsCost,
    cumulativeChipIncrementalPoints: state.cumulativeChipIncrementalPoints,
    cumulativeNetExpectedPoints: state.cumulativeNetExpectedPoints,
    terminalFreeTransferValue: state.terminalFreeTransferValue,
    terminalScore: state.terminalScore,
  } : null

  return {
    ...result,
    transferPlannerResult: transferResult?.result
      ? {
          ...transferResult,
          result: compactTransferResult,
        }
      : transferResult,
    seasonPlannerResult: seasonResult?.result
      ? {
          valid: seasonResult.valid,
          errors: seasonResult.errors ?? [],
          warnings: seasonResult.warnings ?? [],
          result: {
            plannerType: seasonResult.result.plannerType,
            period: seasonResult.result.period,
            config: seasonResult.result.config,
            bestPath: (seasonResult.result.bestPath ?? []).map((step) => ({
              round: step.round,
              action: step.action,
              resultingState: compactPlannerState(step.resultingState),
            })),
            bestTerminalState: compactPlannerState(seasonResult.result.bestTerminalState),
            statistics: compactStatistics,
          },
        }
      : seasonResult,
  }
}

if (typeof self !== 'undefined') self.addEventListener('message', (event) => {
  const message = event.data
  if (message?.type !== 'run-manager-optimizer') return

  const { jobId, request, players, databaseSummary, sentAt } = message
  const startedAt = Date.now()
  const workerStartupMs = Number.isFinite(Number(sentAt))
    ? Math.max(0, startedAt - Number(sentAt))
    : null
  let lastProgressAt = 0
  let lastPhase = null
  let progressEvents = 0

  const postProgress = (progress) => {
    const now = Date.now()
    const phaseChanged = progress.phase !== lastPhase
    const isTerminal = progress.phase === 'completed'
    if (!phaseChanged && !isTerminal && now - lastProgressAt < PROGRESS_INTERVAL_MS) return

    lastProgressAt = now
    lastPhase = progress.phase
    progressEvents += 1
    self.postMessage({
      type: 'manager-optimizer-progress',
      jobId,
      progress: {
        ...progress,
        elapsedMs: progress.elapsedMs ?? now - startedAt,
      },
    })
  }

  try {
    const result = runManagerOptimizerCore({
      request,
      players,
      databaseSummary,
      onProgress: postProgress,
    })

    if (!result?.valid) {
      self.postMessage({
        type: 'manager-optimizer-error',
        jobId,
        errors: result?.errors ?? ['De optimizer heeft geen geldig resultaat opgeleverd.'],
        warnings: result?.warnings ?? [],
        phase: lastPhase ?? 'request-validation',
      })
      return
    }

    const uiResult = compactOptimizerResult(createUiResult(result))
    const resultBytes = new TextEncoder().encode(JSON.stringify(uiResult)).byteLength
    uiResult.workerMeta = {
      workerStartupMs,
      workerElapsedMs: Date.now() - startedAt,
      progressEvents,
      resultBytes,
    }
    self.postMessage({
      type: 'manager-optimizer-result',
      jobId,
      result: uiResult,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('FVT Manager Workerexception:', error)
    self.postMessage({
      type: 'manager-optimizer-error',
      jobId,
      errors: ['De achtergrondberekening is onverwacht gestopt. Probeer opnieuw.'],
      warnings: [],
      phase: lastPhase ?? 'worker-execution',
    })
  }
})
