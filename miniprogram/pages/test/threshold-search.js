const RELATIVE_LEVELS = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
const START_LEVEL_PERCENT = 50
const LEVEL_STEP_PERCENT = 10

const SEARCH_PHASES = Object.freeze({
  SEARCHING: 'searching',
  RETESTING: 'retesting',
  FALLBACK: 'fallback',
  COMPLETE: 'complete'
})

function createThresholdSearch() {
  return {
    phase: SEARCH_PHASES.SEARCHING,
    currentLevelPercent: START_LEVEL_PERCENT,
    candidateThresholdPercent: null,
    detected: null,
    thresholdPercent: null,
    completionReason: '',
    attempts: 0,
    maxTestedPercent: START_LEVEL_PERCENT,
    history: []
  }
}

function answerThresholdSearch(state, heard) {
  validateState(state)
  if (typeof heard !== 'boolean') {
    throw new TypeError('heard must be a boolean')
  }
  if (state.phase === SEARCH_PHASES.COMPLETE) return state

  const response = {
    levelPercent: state.currentLevelPercent,
    heard,
    phase: state.phase
  }
  const history = state.history.concat(response)
  const baseState = {
    ...state,
    attempts: history.length,
    maxTestedPercent: Math.max(state.maxTestedPercent, state.currentLevelPercent),
    history
  }

  if (state.phase === SEARCH_PHASES.RETESTING) {
    return handleRetestResponse(baseState, heard)
  }
  if (state.phase === SEARCH_PHASES.FALLBACK) {
    return handleFallbackResponse(baseState, heard)
  }
  return handleSearchResponse(baseState, heard)
}

function handleSearchResponse(state, heard) {
  const level = state.currentLevelPercent
  const previous = state.history[state.history.length - 2]

  if (heard) {
    const reachedLowerBoundary = level === RELATIVE_LEVELS[0]
    const followedLowerMiss = Boolean(
      previous &&
      !previous.heard &&
      previous.levelPercent === level - LEVEL_STEP_PERCENT
    )

    if (reachedLowerBoundary || followedLowerMiss) {
      return startRetest(state, level)
    }

    return moveToLevel(state, level - LEVEL_STEP_PERCENT)
  }

  const reachedUpperBoundary = level === RELATIVE_LEVELS[RELATIVE_LEVELS.length - 1]
  if (reachedUpperBoundary) {
    return completeWithoutThreshold(state, 'max-not-heard')
  }

  const followedHigherHit = Boolean(
    previous &&
    previous.heard &&
    previous.levelPercent === level + LEVEL_STEP_PERCENT
  )
  if (followedHigherHit) {
    return startRetest(state, previous.levelPercent)
  }

  return moveToLevel(state, level + LEVEL_STEP_PERCENT)
}

function handleRetestResponse(state, heard) {
  const candidate = state.candidateThresholdPercent
  if (heard) {
    return completeWithThreshold(state, candidate, 'confirmed')
  }

  const maxLevel = RELATIVE_LEVELS[RELATIVE_LEVELS.length - 1]
  if (candidate === maxLevel) {
    return completeWithoutThreshold(state, 'retest-failed-at-max')
  }

  return {
    ...moveToLevel(state, candidate + LEVEL_STEP_PERCENT),
    phase: SEARCH_PHASES.FALLBACK
  }
}

function handleFallbackResponse(state, heard) {
  const level = state.currentLevelPercent
  if (heard) {
    return completeWithThreshold(state, level, 'fallback-heard')
  }

  const maxLevel = RELATIVE_LEVELS[RELATIVE_LEVELS.length - 1]
  if (level === maxLevel) {
    return completeWithoutThreshold(state, 'max-not-heard')
  }

  return moveToLevel(state, level + LEVEL_STEP_PERCENT)
}

function startRetest(state, candidateThresholdPercent) {
  return {
    ...moveToLevel(state, candidateThresholdPercent),
    phase: SEARCH_PHASES.RETESTING,
    candidateThresholdPercent
  }
}

function moveToLevel(state, currentLevelPercent) {
  return {
    ...state,
    currentLevelPercent
  }
}

function completeWithThreshold(state, thresholdPercent, completionReason) {
  return {
    ...state,
    phase: SEARCH_PHASES.COMPLETE,
    currentLevelPercent: thresholdPercent,
    detected: true,
    thresholdPercent,
    completionReason
  }
}

function completeWithoutThreshold(state, completionReason) {
  return {
    ...state,
    phase: SEARCH_PHASES.COMPLETE,
    detected: false,
    thresholdPercent: null,
    completionReason
  }
}

function validateState(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state must be an object')
  }
  if (!Object.values(SEARCH_PHASES).includes(state.phase)) {
    throw new TypeError('state has an invalid phase')
  }
  if (!RELATIVE_LEVELS.includes(state.currentLevelPercent)) {
    throw new TypeError('state has an invalid level')
  }
  if (!Array.isArray(state.history)) {
    throw new TypeError('state history must be an array')
  }
}

module.exports = {
  RELATIVE_LEVELS,
  START_LEVEL_PERCENT,
  LEVEL_STEP_PERCENT,
  SEARCH_PHASES,
  createThresholdSearch,
  answerThresholdSearch
}
