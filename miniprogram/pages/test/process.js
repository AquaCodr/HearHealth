const TONE_DURATION_SECONDS = 1
const TONE_FADE_SECONDS = 0.05
const MAX_TEST_TONE_GAIN = 0.02
const TONE_START_TIMEOUT_MS = 1500
const RELATIVE_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

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
    currentLevelIndex: 0,
    currentLevelPercent: RELATIVE_LEVELS[0],
    isAtMaxLevel: false,
    leftEarCompleted: false,
    rightEarCompleted: false,
    leftThresholdCount: 0,
    rightThresholdCount: 0,
    isTonePlaying: false,
    hasPlayedTone: false,
    canAnswer: false,
    currentResponse: '',
    toneStatusText: '点击播放测试音后仔细聆听',
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
      '确认耳机左右方向佩戴正确',
      '保持坐姿稳定，测试时不要说话',
      '将设备音量固定在舒适位置，测试中不要调整'
    ]
  },

  onLoad() {
    this.audioContext = null
    this.activeOscillator = null
    this.activeGain = null
    this.activeMerger = null
    this.toneRequestId = 0
    this.toneStartTimer = null
    this.toneTimer = null
  },

  onHide() {
    this.stopTone()
  },

  onUnload() {
    this.destroyAudioContext()
  },

  startLeftEar() {
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
      currentLevelIndex: 0,
      currentLevelPercent: RELATIVE_LEVELS[0],
      isAtMaxLevel: false,
      leftEarCompleted: false,
      rightEarCompleted: false,
      leftThresholdCount: 0,
      rightThresholdCount: 0,
      hasPlayedTone: false,
      canAnswer: false,
      currentResponse: '',
      toneStatusText: '点击播放测试音后仔细聆听',
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
    })
  },

  startRightEar() {
    if (this.data.currentStep !== 2 || !this.data.leftEarCompleted) return

    this.stopTone(false)
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
      currentLevelIndex: 0,
      currentLevelPercent: RELATIVE_LEVELS[0],
      isAtMaxLevel: false,
      rightEarCompleted: false,
      rightThresholdCount: 0,
      hasPlayedTone: false,
      canAnswer: false,
      currentResponse: '',
      toneStatusText: '点击播放测试音后仔细聆听',
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
    })
  },

  playTone() {
    const isTestingEar = this.data.currentStep === 2 || this.data.currentStep === 3
    if (!isTestingEar || this.data.currentEarCompleted || this.data.isTonePlaying || this.data.currentResponse) return

    if (typeof wx.createWebAudioContext !== 'function') {
      wx.showToast({ title: '当前微信版本不支持测试音', icon: 'none' })
      return
    }

    const requestId = ++this.toneRequestId

    this.setData({
      isTonePlaying: true,
      canAnswer: false,
      toneStatusText: `正在播放 ${this.data.currentFrequency} Hz · 相对强度 ${this.data.currentLevelPercent}%…`
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
          this.handleToneError('音频启动超时，请重新播放')
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
      hasPlayedTone: completed || this.data.hasPlayedTone,
      canAnswer: completed && !this.data.currentResponse,
      toneStatusText: completed
        ? '播放完成，请选择你的真实听感'
        : '测试音已停止，可以重新播放'
    })
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
        toneStatusText: '测试音已停止，可以重新播放'
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
    this.stopTone()
    this.setData({
      isTonePlaying: false,
      canAnswer: false,
      toneStatusText: message
    })
    wx.showToast({ title: message, icon: 'none' })
  },

  recordResponse(e) {
    if (!this.data.canAnswer || this.data.isTonePlaying || this.data.currentResponse) return

    const responseValue = e.currentTarget.dataset.response
    if (responseValue !== 'heard' && responseValue !== 'not-heard') return

    const ear = this.data.currentEar
    if (ear !== 'left' && ear !== 'right') return

    const heard = responseValue === 'heard'
    const isAtMaxLevel = this.data.currentLevelIndex === RELATIVE_LEVELS.length - 1
    if (!heard && !isAtMaxLevel) {
      const nextLevelIndex = this.data.currentLevelIndex + 1
      const nextLevelPercent = RELATIVE_LEVELS[nextLevelIndex]

      this.setData({
        currentLevelIndex: nextLevelIndex,
        currentLevelPercent: nextLevelPercent,
        isAtMaxLevel: nextLevelIndex === RELATIVE_LEVELS.length - 1,
        hasPlayedTone: false,
        canAnswer: false,
        currentResponse: '',
        toneStatusText: `未听到，已提升至 ${nextLevelPercent}%，请再次播放`
      })
      return
    }

    const responses = {
      left: this.data.responses.left.slice(),
      right: this.data.responses.right.slice()
    }
    responses[ear].push({
      frequency: this.data.currentFrequency,
      detected: heard,
      thresholdPercent: heard ? this.data.currentLevelPercent : null,
      maxTestedPercent: this.data.currentLevelPercent,
      attempts: this.data.currentLevelIndex + 1,
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
      responses,
      currentResponse: responseValue,
      canAnswer: false,
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
        ? `${this.data.currentEarName}六个频率阈值测试已完成`
        : heard
          ? `已记录相对阈值：${this.data.currentLevelPercent}%`
          : '达到测试上限仍未听到，已记录本频率结果'
    })
  },

  nextFrequency() {
    if (!this.data.currentResponse || this.data.currentEarCompleted || this.data.isTonePlaying) return

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

    this.setData({
      currentFrequencyIndex: nextIndex,
      currentFrequency: frequencies[nextIndex].value,
      nextFrequencyValue: followingFrequency ? followingFrequency.value : 0,
      currentLevelIndex: 0,
      currentLevelPercent: RELATIVE_LEVELS[0],
      isAtMaxLevel: false,
      frequencies,
      hasPlayedTone: false,
      canAnswer: false,
      currentResponse: '',
      toneStatusText: '点击播放测试音后仔细聆听'
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    })
  },

  viewReport() {
    if (!this.data.leftEarCompleted || !this.data.rightEarCompleted) return

    wx.navigateTo({
      url: '/pages/test/report'
    })
  },

  destroyAudioContext() {
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
