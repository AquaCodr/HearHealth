const test = require('node:test')
const assert = require('node:assert/strict')

const {
  SEARCH_PHASES,
  createThresholdSearch
} = require('../miniprogram/pages/test/threshold-search')

let pageDefinition
global.Page = definition => {
  pageDefinition = definition
}
global.wx = {}
require('../miniprogram/pages/test/process')
delete global.Page
delete global.wx

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createTestingPage() {
  const page = {
    ...pageDefinition,
    data: clone(pageDefinition.data),
    thresholdSearch: createThresholdSearch(),
    autoSequenceId: 0,
    pageVisible: true,
    nextAttemptScheduled: 0,
    nextFrequencyScheduled: 0
  }

  page.data.currentStep = 2
  page.data.currentEar = 'left'
  page.data.currentEarCode = 'L'
  page.data.currentEarName = '左耳'
  page.data.canAnswer = true
  page.data.currentResponse = ''
  page.data.currentEarCompleted = false
  page.data.responses = { left: [], right: [] }

  page.setData = function (updates, callback) {
    Object.assign(this.data, updates)
    if (callback) callback()
  }
  page.scheduleNextAttempt = function () {
    this.nextAttemptScheduled += 1
  }
  page.scheduleNextFrequency = function () {
    this.nextFrequencyScheduled += 1
  }

  return page
}

function answer(page, heard) {
  page.data.canAnswer = true
  if (heard) {
    page.recordHeard()
  } else {
    page.recordNotHeard()
  }
}

test('页面按钮从 50% 向上搜索，并在一次回测后记录阈值', () => {
  const page = createTestingPage()

  answer(page, false)
  assert.equal(page.data.currentLevelPercent, 60)
  assert.equal(page.data.searchPhase, SEARCH_PHASES.SEARCHING)

  answer(page, false)
  assert.equal(page.data.currentLevelPercent, 70)

  answer(page, true)
  assert.equal(page.data.currentLevelPercent, 70)
  assert.equal(page.data.searchPhase, SEARCH_PHASES.RETESTING)
  assert.equal(page.data.isRetesting, true)

  answer(page, true)
  assert.equal(page.data.currentResponse, 'heard')
  assert.equal(page.data.responses.left.length, 1)
  assert.equal(page.data.responses.left[0].thresholdPercent, 70)
  assert.equal(page.data.responses.left[0].attempts, 4)
  assert.equal(page.data.responses.left[0].completionReason, 'confirmed')
  assert.deepEqual(
    page.data.responses.left[0].history.map(item => item.levelPercent),
    [50, 60, 70, 70]
  )
  assert.equal(page.nextFrequencyScheduled, 1)
})

test('页面按钮在 100% 仍听不到时记录未测得', () => {
  const page = createTestingPage()
  const levels = [50, 60, 70, 80, 90, 100]

  levels.forEach(level => {
    assert.equal(page.data.currentLevelPercent, level)
    answer(page, false)
  })

  assert.equal(page.data.currentResponse, 'not-heard')
  assert.equal(page.data.responses.left.length, 1)
  assert.equal(page.data.responses.left[0].detected, false)
  assert.equal(page.data.responses.left[0].thresholdPercent, null)
  assert.equal(page.data.responses.left[0].maxTestedPercent, 100)
  assert.equal(page.nextFrequencyScheduled, 1)
})
