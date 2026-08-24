const TONE_DURATION_SECONDS = 1
const TONE_FADE_SECONDS = 0.05
const SAFE_TONE_GAIN = 0.02

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
    currentFrequency: 125,
    currentFrequencyIndex: 0,
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
      '设备音量处于舒适、较低的水平'
    ]
  },

  onLoad() {
    this.audioContext = null
    this.activeOscillator = null
    this.activeGain = null
    this.activeMerger = null
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
      currentFrequency: this.data.frequencies[0].value,
      currentFrequencyIndex: 0,
      hasPlayedTone: false,
      canAnswer: false,
      currentResponse: '',
      toneStatusText: '点击播放测试音后仔细聆听',
      steps: [
        { label: '准备', status: 'complete' },
        { label: '左耳', status: 'active' },
        { label: '右耳', status: 'pending' }
      ]
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    })
  },

  playTone() {
    if (this.data.currentStep !== 2 || this.data.isTonePlaying || this.data.currentResponse) return

    if (typeof wx.createWebAudioContext !== 'function') {
      wx.showToast({ title: '当前微信版本不支持测试音', icon: 'none' })
      return
    }

    this.setData({
      isTonePlaying: true,
      canAnswer: false,
      toneStatusText: `正在播放 ${this.data.currentFrequency} Hz 测试音…`
    })

    try {
      if (!this.audioContext) {
        this.audioContext = wx.createWebAudioContext()
      }

      const resumeResult = this.audioContext.resume()
      if (resumeResult && typeof resumeResult.then === 'function') {
        resumeResult
          .then(() => this.startToneNodes())
          .catch(() => this.handleToneError('无法启动音频，请重试'))
        return
      }

      this.startToneNodes()
    } catch (error) {
      this.handleToneError('无法播放测试音，请重试')
    }
  },

  startToneNodes() {
    if (!this.audioContext || !this.data.isTonePlaying) return

    try {
      const context = this.audioContext
      if (typeof context.createChannelMerger !== 'function') {
        throw new Error('channel merger unavailable')
      }

      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const merger = context.createChannelMerger(2)
      const now = context.currentTime
      const stopAt = now + TONE_DURATION_SECONDS

      this.activeOscillator = oscillator
      this.activeGain = gain
      this.activeMerger = merger

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(this.data.currentFrequency, now)

      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(SAFE_TONE_GAIN, now + TONE_FADE_SECONDS)
      gain.gain.setValueAtTime(SAFE_TONE_GAIN, stopAt - TONE_FADE_SECONDS)
      gain.gain.linearRampToValueAtTime(0, stopAt)

      oscillator.connect(gain)
      gain.connect(merger, 0, 0)
      merger.connect(context.destination)

      oscillator.onended = () => this.finishTone(oscillator, true)
      oscillator.start(now)
      oscillator.stop(stopAt)

      this.toneTimer = setTimeout(() => {
        this.finishTone(oscillator, true)
      }, (TONE_DURATION_SECONDS * 1000) + 200)
    } catch (error) {
      this.handleToneError('当前设备不支持左声道测试')
    }
  },

  finishTone(oscillator, completed, updateState = true) {
    if (oscillator !== this.activeOscillator) return

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

    const responses = {
      left: this.data.responses.left.slice(),
      right: this.data.responses.right.slice()
    }
    responses[ear].push({
      frequency: this.data.currentFrequency,
      heard: responseValue === 'heard',
      answeredAt: Date.now()
    })

    this.setData({
      responses,
      currentResponse: responseValue,
      canAnswer: false,
      toneStatusText: responseValue === 'heard'
        ? '已记录：听到了'
        : '已记录：没听到'
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
