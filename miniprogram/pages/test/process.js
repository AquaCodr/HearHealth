const { callUser, isLoggedIn } = require('../../utils/auth')
const {
  RELATIVE_LEVELS,
  START_LEVEL_PERCENT,
  SEARCH_PHASES,
  createThresholdSearch,
  answerThresholdSearch
} = require('./threshold-search')

const TONE_DURATION_SECONDS = 1
const TONE_FADE_SECONDS = 0.05
const MAX_TEST_TONE_GAIN = 0.02
const TONE_START_TIMEOUT_MS = 1500
const FREQUENCY_COUNTDOWN_SECONDS = 3
const NEXT_ATTEMPT_DELAY_MS = 900
const NEXT_FREQUENCY_DELAY_MS = 1400
const BAR_FUSE_DELAY_MS = 420
const REPORT_SAVE_TIMEOUT_MS = 8000
const START_LEVEL_INDEX = RELATIVE_LEVELS.indexOf(START_LEVEL_PERCENT)
const LATEST_TEST_RESULT_KEY = 'latestHearingTestResult'

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('save test record timeout')), timeoutMs)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

Page({
  data: {
    currentStep: 1,
    totalSteps: 3,
    steps: [
      { label: '准备', status: 'active' },
      { label: '左耳', status: 'pending' },
      { label: '右耳', status: 'pending' }
    ],
    currentEar: '',
    currentEarCode: '',
    currentEarName: '',
    currentEarCompleted: false,
    currentThresholdCount: 0,
    currentEarResults: [],
    currentFrequency: 125,
    currentFrequencyIndex: 0,
    nextFrequencyValue: 250,
    currentLevelIndex: START_LEVEL_INDEX,
    currentLevelPercent: START_LEVEL_PERCENT,
    isAtMaxLevel: false,
    searchPhase: SEARCH_PHASES.SEARCHING,
    candidateThresholdPercent: null,
    isRetesting: false,
    leftEarCompleted: false,
    rightEarCompleted: false,
    leftThresholdCount: 0,
    rightThresholdCount: 0,
    isTonePlaying: false,
    canAnswer: false,
    currentResponse: '',
    autoPhase: 'idle',
    countdownSeconds: 0,
    toneError: false,
    toneStatusText: '开始后自动播放测试音',
    barFused: false,
    responses: {
      left: [],
      right: []
    },
    frequencies: [
      { value: 125, status: 'active' },
      { value: 250, status: 'pending' },
      { value: 500, status: 'pending' },
      { value: 1000, status: 'pending' },
      { value: 2000, status: 'pending' },
      { value: 4000, status: 'pending' }
    ],
    preparationItems: [
      '耳机左右佩戴正确',
      '保持安静，不说话',
      '测试中不调整音量'
    ]
  },

  onLoad(options) {
    this.audioContext = null
    this.activeOscillator = null
    this.activeGain = null
    this.activeMerger = null
    this.toneRequestId = 0
    this.toneStartTimer = null
    this.toneTimer = null
    this.countdownTimer = null
    this.nextAttemptTimer = null
    this.nextFrequencyTimer = null
    this.autoSequenceId = 0
    this.pageVisible = true
    this.resumeAutomaticAction = ''
    this.thresholdSearch = createThresholdSearch()

    // 引导页向导已完成环境/耳机/音量确认时携带 autostart，跳过准备步骤直接开测。
    if (options && options.autostart === '1') {
      // 进度条先以融合态（一条蓝条）出现，再裂开为三段，衔接引导页的融合动画。
      this.barFuseTimer = setTimeout(() => this.setData({ barFused: false }), BAR_FUSE_DELAY_MS)
      this.setData({ barFused: true })
      this.startLeftEar()
    }
  },

  onShow() {
    this.pageVisible = true
    this.reportOpening = false
    const resumeAction = this.resumeAutomaticAction
    this.resumeAutomaticAction = ''

    if (resumeAction === 'next-frequency') {
      this.nextFrequency()
    } else if (resumeAction === 'current-frequency') {
      this.startFrequencyCountdown()
    }
  },

  onHide() {
    this.pageVisible = false
    const shouldRestartCurrentFrequency = this.isAutomaticTestAvailable()
    const shouldAdvanceFrequency = Boolean(
      this.data.currentResponse && !this.data.currentEarCompleted
    )
    this.resumeAutomaticAction = shouldAdvanceFrequency
      ? 'next-frequency'
      : shouldRestartCurrentFrequency
        ? 'current-frequency'
        : ''
    this.cancelAutomaticTimers()
    this.stopTone(false)
    if (shouldRestartCurrentFrequency) {
      this.setData({
        isTonePlaying: false,
        canAnswer: false,
        autoPhase: 'paused',
        toneStatusText: '测试已暂停，返回页面后将重新倒计时'
      })
    }
  },

  onUnload() {
    if (this.barFuseTimer) {
      clearTimeout(this.barFuseTimer)
      this.barFuseTimer = null
    }
    this.destroyAudioContext()
  },

  startLeftEar() {
    this.primeAudioContext()
    this.thresholdSearch = createThresholdSearch()
    this.setData({
      currentStep: 2,
      currentEar: 'left',
      currentEarCode: 'L',
      currentEarName: '左耳',
      currentEarCompleted: false,
      currentThresholdCount: 0,
      currentEarResults: [],
      currentFrequency: this.data.frequencies[0].value,
      currentFrequencyIndex: 0,
      nextFrequencyValue: this.data.frequencies[1].value,
      ...this.getThresholdSearchData(this.thresholdSearch),
      leftEarCompleted: false,
      rightEarCompleted: false,
      leftThresholdCount: 0,
      rightThresholdCount: 0,
      canAnswer: false,
      currentResponse: '',
      autoPhase: 'countdown',
      countdownSeconds: FREQUENCY_COUNTDOWN_SECONDS,
      toneError: false,
      toneStatusText: `${FREQUENCY_COUNTDOWN_SECONDS} 秒后自动播放 125 Hz`,
      responses: {
        left: [],
        right: []
      },
      frequencies: this.data.frequencies.map((item, index) => ({
        value: item.value,
        status: index === 0 ? 'active' : 'pending'
      })),
      steps: [
        { label: '准备', status: 'complete' },
        { label: '左耳', status: 'active' },
        { label: '右耳', status: 'pending' }
      ]
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      this.startFrequencyCountdown()
    })
  },

  startRightEar() {
    if (this.data.currentStep !== 2 || !this.data.leftEarCompleted) return

    this.primeAudioContext()
    this.cancelAutomaticTimers()
    this.stopTone(false)
    this.thresholdSearch = createThresholdSearch()
    this.setData({
      currentStep: 3,
      currentEar: 'right',
      currentEarCode: 'R',
      currentEarName: '右耳',
      currentEarCompleted: false,
      currentThresholdCount: 0,
      currentEarResults: [],
      currentFrequency: this.data.frequencies[0].value,
      currentFrequencyIndex: 0,
      nextFrequencyValue: this.data.frequencies[1].value,
      ...this.getThresholdSearchData(this.thresholdSearch),
      rightEarCompleted: false,
      rightThresholdCount: 0,
      canAnswer: false,
      currentResponse: '',
      autoPhase: 'countdown',
      countdownSeconds: FREQUENCY_COUNTDOWN_SECONDS,
      toneError: false,
      toneStatusText: `${FREQUENCY_COUNTDOWN_SECONDS} 秒后自动播放 125 Hz`,
      responses: {
        left: this.data.responses.left.slice(),
        right: []
      },
      frequencies: this.data.frequencies.map((item, index) => ({
        value: item.value,
        status: index === 0 ? 'active' : 'pending'
      })),
      steps: [
        { label: '准备', status: 'complete' },
        { label: '左耳', status: 'complete' },
        { label: '右耳', status: 'active' }
      ]
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      this.startFrequencyCountdown()
    })
  },

  isAutomaticTestAvailable() {
    const isTestingEar = this.data.currentStep === 2 || this.data.currentStep === 3
    return Boolean(
      isTestingEar &&
      !this.data.currentEarCompleted &&
      !this.data.currentResponse &&
      !this.data.toneError
    )
  },

  getThresholdSearchData(search) {
    const currentLevelIndex = RELATIVE_LEVELS.indexOf(search.currentLevelPercent)
    return {
      currentLevelIndex,
      currentLevelPercent: search.currentLevelPercent,
      isAtMaxLevel: currentLevelIndex === RELATIVE_LEVELS.length - 1,
      searchPhase: search.phase,
      candidateThresholdPercent: search.candidateThresholdPercent,
      isRetesting: search.phase === SEARCH_PHASES.RETESTING
    }
  },

  primeAudioContext() {
    if (typeof wx.createWebAudioContext !== 'function') return

    try {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = wx.createWebAudioContext()
      }
      if (this.audioContext.state === 'suspended' && typeof this.audioContext.resume === 'function') {
        const resumeResult = this.audioContext.resume()
        if (resumeResult && typeof resumeResult.catch === 'function') {
          resumeResult.catch(() => {})
        }
      }
    } catch (error) {
      // 正式播放时会再次初始化，并向用户展示明确错误。
    }
  },

  cancelAutomaticTimers() {
    this.autoSequenceId += 1

    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer)
      this.countdownTimer = null
    }
    if (this.nextAttemptTimer) {
      clearTimeout(this.nextAttemptTimer)
      this.nextAttemptTimer = null
    }
    if (this.nextFrequencyTimer) {
      clearTimeout(this.nextFrequencyTimer)
      this.nextFrequencyTimer = null
    }
  },

  startFrequencyCountdown() {
    if (!this.pageVisible || !this.isAutomaticTestAvailable()) return

    this.cancelAutomaticTimers()
    this.stopTone(false)
    const sequenceId = this.autoSequenceId
    let remaining = FREQUENCY_COUNTDOWN_SECONDS

    const tick = () => {
      if (
        sequenceId !== this.autoSequenceId ||
        !this.pageVisible ||
        !this.isAutomaticTestAvailable()
      ) return

      if (remaining === 0) {
        this.countdownTimer = null
        this.setData({ countdownSeconds: 0 }, () => this.playTone())
        return
      }

      this.setData({
        autoPhase: 'countdown',
        countdownSeconds: remaining,
        canAnswer: false,
        toneError: false,
        toneStatusText: `${remaining} 秒后自动播放 ${this.data.currentFrequency} Hz`
      })
      remaining -= 1
      this.countdownTimer = setTimeout(tick, 1000)
    }

    tick()
  },

  playTone() {
    const isTestingEar = this.data.currentStep === 2 || this.data.currentStep === 3
    if (!isTestingEar || this.data.currentEarCompleted || this.data.isTonePlaying || this.data.currentResponse) return

    if (typeof wx.createWebAudioContext !== 'function') {
      this.handleToneError('当前微信版本不支持测试音')
      return
    }

    const requestId = ++this.toneRequestId

    this.setData({
      isTonePlaying: true,
      canAnswer: false,
      autoPhase: 'playing',
      toneError: false,
      toneStatusText: `${this.data.currentFrequency} Hz · ${this.data.currentLevelPercent}%`
    })
    this.prepareTone(requestId)
  },

  prepareTone(requestId) {
    if (requestId !== this.toneRequestId || !this.data.isTonePlaying) return

    try {
      const needsNewContext = !this.audioContext || this.audioContext.state === 'closed'
      if (needsNewContext) {
        this.audioContext = wx.createWebAudioContext()
      }

      const context = this.audioContext
      if (!context) {
        throw new Error('audio context unavailable')
      }

      this.clearToneStartTimer()
      this.toneStartTimer = setTimeout(() => {
        if (requestId === this.toneRequestId && this.data.isTonePlaying && !this.activeOscillator) {
          this.handleToneError('音频启动超时，请重新尝试')
        }
      }, TONE_START_TIMEOUT_MS)

      // 只在首次创建或确实暂停时恢复；重复等待运行中的上下文会让部分客户端卡在“播放中”。
      if ((needsNewContext || context.state === 'suspended') && typeof context.resume === 'function') {
        const resumeResult = context.resume()
        if (resumeResult && typeof resumeResult.then === 'function') {
          resumeResult
            .then(() => this.startToneNodes(requestId))
            .catch(() => {
              if (requestId === this.toneRequestId) {
                this.handleToneError('无法启动音频，请重试')
              }
            })
          return
        }
      }

      this.startToneNodes(requestId)
    } catch (error) {
      this.handleToneError('无法播放测试音，请重试')
    }
  },

  clearToneStartTimer() {
    if (!this.toneStartTimer) return

    clearTimeout(this.toneStartTimer)
    this.toneStartTimer = null
  },

  startToneNodes(requestId) {
    if (requestId !== this.toneRequestId) return

    if (!this.audioContext || !this.data.isTonePlaying) {
      this.clearToneStartTimer()
      return
    }

    this.clearToneStartTimer()

    try {
      const context = this.audioContext
      if (typeof context.createChannelMerger !== 'function') {
        throw new Error('channel merger unavailable')
      }

      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const merger = context.createChannelMerger(2)
      const channelIndex = this.data.currentEar === 'right' ? 1 : 0
      const toneGain = MAX_TEST_TONE_GAIN * (this.data.currentLevelPercent / 100)
      const now = context.currentTime
      const stopAt = now + TONE_DURATION_SECONDS

      this.activeOscillator = oscillator
      this.activeGain = gain
      this.activeMerger = merger

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(this.data.currentFrequency, now)

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(toneGain, now + TONE_FADE_SECONDS)
      gain.gain.setValueAtTime(toneGain, stopAt - TONE_FADE_SECONDS)
      gain.gain.linearRampToValueAtTime(0, stopAt)

      oscillator.connect(gain)
      gain.connect(merger, 0, channelIndex)
      merger.connect(context.destination)

      oscillator.onended = () => this.finishTone(oscillator, true)
      oscillator.start(now)
      oscillator.stop(stopAt)

      if (requestId === this.toneRequestId && !this.data.currentResponse) {
        this.setData({ canAnswer: true })
      }

      this.toneTimer = setTimeout(() => {
        this.finishTone(oscillator, true)
      }, (TONE_DURATION_SECONDS * 1000) + 200)
    } catch (error) {
      this.handleToneError(`当前设备不支持${this.data.currentEarName}声道测试`)
    }
  },

  finishTone(oscillator, completed, updateState = true) {
    if (oscillator !== this.activeOscillator) return

    this.clearToneStartTimer()

    if (this.toneTimer) {
      clearTimeout(this.toneTimer)
      this.toneTimer = null
    }

    oscillator.onended = null
    this.disconnectToneNodes()

    if (!updateState) return

    this.setData({
      isTonePlaying: false,
      canAnswer: completed && !this.data.currentResponse,
      autoPhase: completed ? 'waiting' : 'paused',
      toneStatusText: completed
        ? this.getToneAnswerPrompt()
        : '测试音已暂停'
    })
  },

  getToneAnswerPrompt() {
    if (this.data.searchPhase === SEARCH_PHASES.RETESTING) {
      return `正在回测 ${this.data.currentLevelPercent}% · 请选择真实听感`
    }
    if (this.data.searchPhase === SEARCH_PHASES.FALLBACK) {
      return `${this.data.currentLevelPercent}% 保守确认 · 请选择真实听感`
    }
    return `${this.data.currentLevelPercent}% 播放完成 · 请选择真实听感`
  },

  scheduleNextAttempt() {
    if (!this.isAutomaticTestAvailable()) return

    if (this.nextAttemptTimer) clearTimeout(this.nextAttemptTimer)
    const sequenceId = this.autoSequenceId
    this.nextAttemptTimer = setTimeout(() => {
      this.nextAttemptTimer = null
      if (
        sequenceId !== this.autoSequenceId ||
        !this.pageVisible ||
        !this.isAutomaticTestAvailable()
      ) return

      this.setData({
        canAnswer: false,
        autoPhase: 'playing'
      }, () => this.playTone())
    }, NEXT_ATTEMPT_DELAY_MS)
  },

  stopTone(updateState = true) {
    this.clearToneStartTimer()
    this.toneRequestId += 1

    const oscillator = this.activeOscillator
    if (oscillator) {
      oscillator.onended = null
      try {
        oscillator.stop()
      } catch (error) {
        // 已停止的音源再次 stop 会抛错，继续执行资源清理即可。
      }
      this.finishTone(oscillator, false, updateState)
      return
    }

    if (updateState && this.data.isTonePlaying) {
      this.setData({
        isTonePlaying: false,
        canAnswer: false,
        autoPhase: 'paused',
        toneStatusText: '测试音已暂停'
      })
    }
  },

  disconnectToneNodes() {
    const nodes = [this.activeOscillator, this.activeGain, this.activeMerger]
    nodes.forEach(node => {
      if (!node || typeof node.disconnect !== 'function') return
      try {
        node.disconnect()
      } catch (error) {
        // 节点可能已经由运行时断开，无需重复处理。
      }
    })

    this.activeOscillator = null
    this.activeGain = null
    this.activeMerger = null
  },

  handleToneError(message) {
    this.cancelAutomaticTimers()
    this.stopTone(false)
    this.setData({
      isTonePlaying: false,
      canAnswer: false,
      autoPhase: 'error',
      toneError: true,
      toneStatusText: message
    })
    wx.showToast({ title: message, icon: 'none' })
  },

  retryAutomaticTone() {
    if (!this.data.toneError || this.data.currentResponse || this.data.currentEarCompleted) return

    this.primeAudioContext()
    this.setData({ toneError: false }, () => this.startFrequencyCountdown())
  },

  recordHeard() {
    this.recordThresholdAnswer(true)
  },

  recordNotHeard() {
    this.recordThresholdAnswer(false)
  },

  recordThresholdAnswer(heard) {
    if (!this.data.canAnswer || this.data.currentResponse || this.data.toneError) return

    const previousLevelPercent = this.data.currentLevelPercent
    this.cancelAutomaticTimers()
    this.stopTone(false)

    const currentSearch = this.thresholdSearch || createThresholdSearch()
    const nextSearch = answerThresholdSearch(currentSearch, heard)
    this.thresholdSearch = nextSearch

    if (nextSearch.phase === SEARCH_PHASES.COMPLETE) {
      this.completeCurrentFrequency(nextSearch)
      return
    }

    this.setData({
      ...this.getThresholdSearchData(nextSearch),
      isTonePlaying: false,
      canAnswer: false,
      autoPhase: 'adjusting',
      countdownSeconds: 0,
      toneStatusText: this.getAdjustmentStatus(previousLevelPercent, heard, nextSearch)
    }, () => this.scheduleNextAttempt())
  },

  getAdjustmentStatus(previousLevelPercent, heard, search) {
    if (search.phase === SEARCH_PHASES.RETESTING) {
      return `候选阈值 ${search.candidateThresholdPercent}% · 即将回测一次`
    }
    if (search.phase === SEARCH_PHASES.FALLBACK) {
      return `回测未通过 · 即将提高至 ${search.currentLevelPercent}%`
    }

    const direction = search.currentLevelPercent > previousLevelPercent ? '提高' : '降低'
    const responseText = heard ? '已听到' : '未听到'
    return `${responseText} · 即将${direction}至 ${search.currentLevelPercent}%`
  },

  completeCurrentFrequency(searchResult) {
    if (this.data.currentResponse || this.data.currentEarCompleted) return

    const ear = this.data.currentEar
    if (ear !== 'left' && ear !== 'right') return
    if (!searchResult || searchResult.phase !== SEARCH_PHASES.COMPLETE) return

    this.cancelAutomaticTimers()
    this.stopTone(false)
    const detected = searchResult.detected
    const responseValue = detected ? 'heard' : 'not-heard'

    const responses = {
      left: this.data.responses.left.slice(),
      right: this.data.responses.right.slice()
    }
    responses[ear].push({
      frequency: this.data.currentFrequency,
      detected,
      thresholdPercent: detected ? searchResult.thresholdPercent : null,
      maxTestedPercent: searchResult.maxTestedPercent,
      attempts: searchResult.attempts,
      completionReason: searchResult.completionReason,
      history: searchResult.history.map(item => ({ ...item })),
      answeredAt: Date.now()
    })

    const isLastFrequency = this.data.currentFrequencyIndex === this.data.frequencies.length - 1
    const thresholdCount = responses[ear].filter(item => item.detected).length
    const completedFrequencies = isLastFrequency
      ? this.data.frequencies.map(item => ({ value: item.value, status: 'complete' }))
      : this.data.frequencies
    const completedSteps = ear === 'left'
      ? [
          { label: '准备', status: 'complete' },
          { label: '左耳', status: 'complete' },
          { label: '右耳', status: 'pending' }
        ]
      : [
          { label: '准备', status: 'complete' },
          { label: '左耳', status: 'complete' },
          { label: '右耳', status: 'complete' }
        ]

    this.setData({
      ...this.getThresholdSearchData(searchResult),
      responses,
      currentResponse: responseValue,
      isTonePlaying: false,
      canAnswer: false,
      autoPhase: 'recorded',
      countdownSeconds: 0,
      toneError: false,
      currentEarCompleted: isLastFrequency,
      currentThresholdCount: thresholdCount,
      currentEarResults: responses[ear].slice(),
      leftEarCompleted: ear === 'left' && isLastFrequency
        ? true
        : this.data.leftEarCompleted,
      rightEarCompleted: ear === 'right' && isLastFrequency
        ? true
        : this.data.rightEarCompleted,
      leftThresholdCount: ear === 'left' ? thresholdCount : this.data.leftThresholdCount,
      rightThresholdCount: ear === 'right' ? thresholdCount : this.data.rightThresholdCount,
      frequencies: completedFrequencies,
      steps: isLastFrequency ? completedSteps : this.data.steps,
      toneStatusText: isLastFrequency
        ? `${this.data.currentEarName}测试完成`
        : detected
          ? `已记录 · 下一频率 ${this.data.nextFrequencyValue} Hz`
          : `未测得 · 下一频率 ${this.data.nextFrequencyValue} Hz`
    }, () => {
      if (!isLastFrequency) this.scheduleNextFrequency()
    })
  },

  scheduleNextFrequency() {
    const sequenceId = this.autoSequenceId
    this.nextFrequencyTimer = setTimeout(() => {
      this.nextFrequencyTimer = null
      if (sequenceId !== this.autoSequenceId || !this.pageVisible) return
      this.nextFrequency()
    }, NEXT_FREQUENCY_DELAY_MS)
  },

  nextFrequency() {
    if (!this.data.currentResponse || this.data.currentEarCompleted) return

    const nextIndex = this.data.currentFrequencyIndex + 1
    if (nextIndex >= this.data.frequencies.length) return

    const frequencies = this.data.frequencies.map((item, index) => ({
      value: item.value,
      status: index < nextIndex
        ? 'complete'
        : index === nextIndex
          ? 'active'
          : 'pending'
    }))
    const followingFrequency = frequencies[nextIndex + 1]
    this.thresholdSearch = createThresholdSearch()

    this.setData({
      currentFrequencyIndex: nextIndex,
      currentFrequency: frequencies[nextIndex].value,
      nextFrequencyValue: followingFrequency ? followingFrequency.value : 0,
      ...this.getThresholdSearchData(this.thresholdSearch),
      frequencies,
      canAnswer: false,
      currentResponse: '',
      autoPhase: 'countdown',
      countdownSeconds: FREQUENCY_COUNTDOWN_SECONDS,
      toneError: false,
      toneStatusText: `${FREQUENCY_COUNTDOWN_SECONDS} 秒后自动播放 ${frequencies[nextIndex].value} Hz`
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 200 })
      this.startFrequencyCountdown()
    })
  },

  viewReport() {
    if (!this.data.leftEarCompleted || !this.data.rightEarCompleted || this.reportOpening) return

    const result = {
      version: 2,
      measurement: 'relative-gain-threshold',
      algorithm: 'bidirectional-single-retest',
      completedAt: Date.now(),
      relativeLevels: RELATIVE_LEVELS.slice(),
      maxTestToneGain: MAX_TEST_TONE_GAIN,
      ears: {
        left: this.data.responses.left.map(item => ({ ...item })),
        right: this.data.responses.right.map(item => ({ ...item }))
      }
    }

    try {
      wx.setStorageSync(LATEST_TEST_RESULT_KEY, result)
    } catch (error) {
      wx.showToast({ title: '保存测试结果失败，请重试', icon: 'none' })
      return
    }

    this.reportOpening = true

    // 游客模式：测试记录只落本机，不往云端写 OPENID 维度的数据，
    // AI 解读依赖云端记录，登录后完成测试即可恢复（issue #36）
    if (!isLoggedIn()) {
      this.openReport('/pages/test/report?aiUnavailable=guest-mode')
      return
    }

    wx.showLoading({ title: '正在保存报告', mask: true })

    // AI 只接受云端 testRecordId；保存失败或超时仍进入基础报告，不让 AI 阻断原流程。
    withTimeout(callUser('saveTestRecord', { result }), REPORT_SAVE_TIMEOUT_MS)
      .then(saved => {
        const testRecordId = saved && typeof saved._id === 'string' ? saved._id.trim() : ''
        if (!testRecordId) throw new Error('missing test record id')
        this.openReport(`/pages/test/report?testRecordId=${encodeURIComponent(testRecordId)}`)
      })
      .catch(error => {
        console.error('[hearing-test] saveTestRecord failed', {
          code: error && error.code ? error.code : 'SAVE_TEST_RECORD_FAILED'
        })
        this.openReport('/pages/test/report?aiUnavailable=record-sync-failed')
      })
  },

  openReport(url) {
    wx.hideLoading()
    wx.navigateTo({
      url,
      fail: () => {
        this.reportOpening = false
        wx.showToast({ title: '暂时无法打开报告', icon: 'none' })
      }
    })
  },

  destroyAudioContext() {
    this.cancelAutomaticTimers()
    this.stopTone(false)

    const context = this.audioContext
    this.audioContext = null
    if (!context || typeof context.close !== 'function') return

    try {
      const closeResult = context.close()
      if (closeResult && typeof closeResult.catch === 'function') {
        closeResult.catch(() => {})
      }
    } catch (error) {
      // 页面销毁时只需确保不再持有音频上下文。
    }
  }
})
