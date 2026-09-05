const test = require('node:test')
const assert = require('node:assert/strict')

const {
  SEARCH_PHASES,
  START_LEVEL_PERCENT,
  createThresholdSearch,
  answerThresholdSearch
} = require('../miniprogram/pages/test/threshold-search')

function answerSequence(answers) {
  return answers.reduce(
    (state, heard) => answerThresholdSearch(state, heard),
    createThresholdSearch()
  )
}

test('每个频率从 50% 开始', () => {
  const state = createThresholdSearch()

  assert.equal(state.currentLevelPercent, START_LEVEL_PERCENT)
  assert.equal(state.phase, SEARCH_PHASES.SEARCHING)
  assert.equal(state.attempts, 0)
})

test('连续听到时向下搜索，并用一次回测确认候选阈值', () => {
  let state = createThresholdSearch()

  state = answerThresholdSearch(state, true)
  assert.equal(state.currentLevelPercent, 40)

  state = answerThresholdSearch(state, true)
  assert.equal(state.currentLevelPercent, 30)

  state = answerThresholdSearch(state, false)
  assert.equal(state.phase, SEARCH_PHASES.RETESTING)
  assert.equal(state.currentLevelPercent, 40)
  assert.equal(state.candidateThresholdPercent, 40)

  state = answerThresholdSearch(state, true)
  assert.equal(state.phase, SEARCH_PHASES.COMPLETE)
  assert.equal(state.detected, true)
  assert.equal(state.thresholdPercent, 40)
  assert.equal(state.completionReason, 'confirmed')
  assert.equal(state.attempts, 4)
})

test('连续听不到时向上搜索，并回测首次听到的候选阈值', () => {
  const state = answerSequence([false, false, true, true])

  assert.equal(state.phase, SEARCH_PHASES.COMPLETE)
  assert.equal(state.detected, true)
  assert.equal(state.thresholdPercent, 70)
  assert.deepEqual(
    state.history.map(item => item.levelPercent),
    [50, 60, 70, 70]
  )
})

test('候选阈值回测失败时只进行一次回测，并向上寻找保守结果', () => {
  let state = answerSequence([true, true, false, false])

  assert.equal(state.phase, SEARCH_PHASES.FALLBACK)
  assert.equal(state.currentLevelPercent, 50)
  assert.equal(state.candidateThresholdPercent, 40)

  state = answerThresholdSearch(state, true)
  assert.equal(state.phase, SEARCH_PHASES.COMPLETE)
  assert.equal(state.thresholdPercent, 50)
  assert.equal(state.completionReason, 'fallback-heard')
  assert.deepEqual(
    state.history.map(item => item.levelPercent),
    [50, 40, 30, 40, 50]
  )
})

test('10% 可以作为候选阈值并回测一次', () => {
  const state = answerSequence([true, true, true, true, true, true])

  assert.equal(state.phase, SEARCH_PHASES.COMPLETE)
  assert.equal(state.thresholdPercent, 10)
  assert.deepEqual(
    state.history.map(item => item.levelPercent),
    [50, 40, 30, 20, 10, 10]
  )
})

test('100% 仍听不到时记录为未测得', () => {
  const state = answerSequence([false, false, false, false, false, false])

  assert.equal(state.phase, SEARCH_PHASES.COMPLETE)
  assert.equal(state.detected, false)
  assert.equal(state.thresholdPercent, null)
  assert.equal(state.maxTestedPercent, 100)
  assert.equal(state.completionReason, 'max-not-heard')
})

test('100% 候选阈值回测失败时记录为未测得', () => {
  const state = answerSequence([false, false, false, false, false, true, false])

  assert.equal(state.phase, SEARCH_PHASES.COMPLETE)
  assert.equal(state.detected, false)
  assert.equal(state.thresholdPercent, null)
  assert.equal(state.completionReason, 'retest-failed-at-max')
})

test('不会修改传入的状态和历史记录', () => {
  const initial = createThresholdSearch()
  const next = answerThresholdSearch(initial, true)

  assert.equal(initial.currentLevelPercent, 50)
  assert.equal(initial.history.length, 0)
  assert.equal(next.currentLevelPercent, 40)
  assert.equal(next.history.length, 1)
})
