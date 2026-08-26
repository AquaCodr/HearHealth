const REFERENCE_TONE_FREQUENCY = 1000
const REFERENCE_TONE_DURATION_SECONDS = 2
const REFERENCE_TONE_GAIN = 0.02
const REFERENCE_TONE_FADE_SECONDS = 0.05
const NOISE_SAMPLE_RATE = 44100
const NOISE_FRAME_SIZE_KB = 2
const NOISE_UPDATE_INTERVAL_MS = 150
const NOISE_DB_FLOOR = -60
const QUIET_MAX_PERCENT = 25
const MODERATE_MAX_PERCENT = 55
const NOISE_LABELS = { quiet: '安静', moderate: '一般', loud: '嘈杂' }
const MERGE_DELAY_MS = 380
const PROCESS_PAGE_URL = '/pages/test/process?autostart=1'

Page({
  data: {
    mode: 'intro',
    prepStep: 1,
    prepDots: [1, 2, 3, 4],
    navigating: false,
    micReady: false,
    micDenied: false,
    micError: false,
    noiseLevel: 0,
    noiseLabel: '检测中…',
    noiseClass: 'unknown',
    tonePlaying: false,
    merging: false
  },

  onLoad() {
    this.recorderManager = null
    this.isMonitoring = false
    this.lastNoiseUpdate = 0
    this.smoothedNoiseLevel = 0
    this.toneAudioContext = null
    this.activeToneOscillator = null
    this.activeToneGain = null
    this.mergeTimer = null
  },

  onShow() {
    if (this.data.mode === 'prep' && this.data.prepStep === 1) {
      this.startNoiseMonitor()
    }
  },

  onHide() {
    // 切后台时释放麦克风与参考音，返回后由 onShow 按需重启。
    this.stopNoiseMonitor()
    this.stopReferenceTone()
    if (this.data.merging) {
      this.leaveToProcess()
    }
  },

  onUnload() {
    this.clearMergeTimer()
    this.stopNoiseMonitor()
    this.stopReferenceTone()

    const context = this.toneAudioContext
    this.toneAudioContext = null
    if (!context || typeof context.close !== 'function') return

    try {
      const closeResult = context.close()
      if (closeResult && typeof closeResult.catch === 'function') {
        closeResult.catch(() => {})
      }
    } catch (error) {
      // 页面销毁时只需确保不再持有音频上下文。
    }
  },

  startTest() {
    if (this.data.navigating) return

    this.setData({ mode: 'prep', prepStep: 1 }, () => this.startNoiseMonitor())
  },

  confirmNoise() {
    this.stopNoiseMonitor()
    this.setData({ prepStep: 2 })
  },

  confirmHeadset() {
    this.setData({ prepStep: 3 })
  },

  confirmVolume() {
    this.stopReferenceTone()
    this.setData({ prepStep: 4 })
  },

  prevStep() {
    const target = this.data.prepStep - 1
    if (target < 1) {
      this.backToIntro()
      return
    }

    this.stopReferenceTone()
    if (target === 1) this.startNoiseMonitor()
    this.setData({ prepStep: target })
  },

  backToIntro() {
    this.stopNoiseMonitor()
    this.stopReferenceTone()
    this.setData({ mode: 'intro', prepStep: 1 })
  },

  beginTest() {
    if (this.data.navigating) return

    this.stopNoiseMonitor()
    this.stopReferenceTone()
    this.setData({ navigating: true, merging: true })
    // 进度条先融合成一条，与测试页的裂开进场动画衔接。
    this.mergeTimer = setTimeout(() => this.leaveToProcess(), MERGE_DELAY_MS)
  },

  leaveToProcess() {
    this.clearMergeTimer()
    wx.redirectTo({
      url: PROCESS_PAGE_URL,
      fail: () => {
        this.setData({ navigating: false, merging: false })
        wx.showToast({ title: '暂时无法进入测试', icon: 'none' })
      }
    })
  },

  clearMergeTimer() {
    if (!this.mergeTimer) return

    clearTimeout(this.mergeTimer)
    this.mergeTimer = null
  },

  /* ========== 环境音检测 ========== */

  initRecorder() {
    if (this.recorderManager) return

    const manager = wx.getRecorderManager()
    manager.onFrameRecorded(res => this.handleNoiseFrame(res.frameBuffer))
    manager.onError(res => {
      if (!this.isMonitoring) return

      this.isMonitoring = false
      const message = (res && res.errMsg) || ''
      this.setData({
        micReady: false,
        micDenied: /auth|deny/i.test(message),
        micError: true
      })
    })
    this.recorderManager = manager
  },

  startNoiseMonitor() {
    this.initRecorder()
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.lastNoiseUpdate = 0
    this.smoothedNoiseLevel = 0
    this.setData({
      micReady: false,
      micDenied: false,
      micError: false,
      noiseLevel: 0,
      noiseLabel: '检测中…',
      noiseClass: 'unknown'
    })
    try {
      this.recorderManager.start({
        format: 'PCM',
        sampleRate: NOISE_SAMPLE_RATE,
        numberOfChannels: 1,
        frameSize: NOISE_FRAME_SIZE_KB
      })
    } catch (error) {
      this.isMonitoring = false
      this.setData({ micError: true })
    }
  },

  stopNoiseMonitor() {
    if (!this.isMonitoring) {
      this.isMonitoring = false
      return
    }

    this.isMonitoring = false
    try {
      this.recorderManager.stop()
    } catch (error) {
      // 重复 stop 或未在录音时忽略即可。
    }
  },

  handleNoiseFrame(frameBuffer) {
    if (!this.isMonitoring || !frameBuffer) return
    if (this.data.mode !== 'prep' || this.data.prepStep !== 1) return

    const samples = new Int16Array(frameBuffer)
    if (!samples.length) return

    let sumSquares = 0
    for (let i = 0; i < samples.length; i += 1) {
      sumSquares += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sumSquares / samples.length)
    const dbfs = rms > 0 ? 20 * Math.log10(rms / 32768) : NOISE_DB_FLOOR
    const instant = Math.min(100, Math.max(0, ((dbfs - NOISE_DB_FLOOR) / -NOISE_DB_FLOOR) * 100))

    // 平滑处理：上升快、下降慢，让音量条更接近听感。
    const previous = this.smoothedNoiseLevel
    const ratio = instant > previous ? 0.5 : 0.2
    this.smoothedNoiseLevel = previous + (instant - previous) * ratio

    const now = Date.now()
    if (this.lastNoiseUpdate && now - this.lastNoiseUpdate < NOISE_UPDATE_INTERVAL_MS) return
    this.lastNoiseUpdate = now
    this.applyNoiseLevel(this.smoothedNoiseLevel)
  },

  applyNoiseLevel(level) {
    const percent = Math.round(level)
    const noiseClass = percent < QUIET_MAX_PERCENT
      ? 'quiet'
      : percent < MODERATE_MAX_PERCENT
        ? 'moderate'
        : 'loud'

    this.setData({
      micReady: true,
      noiseLevel: percent,
      noiseClass,
      noiseLabel: NOISE_LABELS[noiseClass]
    })
  },

  openMicSetting() {
    wx.openSetting({
      success: res => {
        if (res.authSetting && res.authSetting['scope.record']) {
          this.setData({ micDenied: false, micError: false }, () => this.startNoiseMonitor())
        }
      }
    })
  },

  /* ========== 参考音试听 ========== */

  playReferenceTone() {
    if (this.data.tonePlaying) return

    if (typeof wx.createWebAudioContext !== 'function') {
      wx.showToast({ title: '当前微信版本不支持试听', icon: 'none' })
      return
    }

    try {
      if (!this.toneAudioContext || this.toneAudioContext.state === 'closed') {
        this.toneAudioContext = wx.createWebAudioContext()
      }
      const context = this.toneAudioContext
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        const resumeResult = context.resume()
        if (resumeResult && typeof resumeResult.catch === 'function') {
          resumeResult.catch(() => {})
        }
      }

      const now = context.currentTime
      const stopAt = now + REFERENCE_TONE_DURATION_SECONDS
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(REFERENCE_TONE_FREQUENCY, now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(REFERENCE_TONE_GAIN, now + REFERENCE_TONE_FADE_SECONDS)
      gain.gain.setValueAtTime(REFERENCE_TONE_GAIN, stopAt - REFERENCE_TONE_FADE_SECONDS)
      gain.gain.linearRampToValueAtTime(0, stopAt)

      oscillator.connect(gain)
      gain.connect(context.destination)

      oscillator.onended = () => {
        oscillator.onended = null
        this.disconnectToneNodes(oscillator, gain)
        if (this.activeToneOscillator === oscillator) {
          this.activeToneOscillator = null
          this.activeToneGain = null
          this.setData({ tonePlaying: false })
        }
      }

      this.activeToneOscillator = oscillator
      this.activeToneGain = gain
      this.setData({ tonePlaying: true })
      oscillator.start(now)
      oscillator.stop(stopAt)
    } catch (error) {
      this.setData({ tonePlaying: false })
      wx.showToast({ title: '无法播放参考音', icon: 'none' })
    }
  },

  stopReferenceTone() {
    const oscillator = this.activeToneOscillator
    if (!oscillator) return

    this.activeToneOscillator = null
    const gain = this.activeToneGain
    this.activeToneGain = null

    try {
      oscillator.onended = null
      oscillator.stop()
    } catch (error) {
      // 已停止的音源再次 stop 会抛错，继续清理即可。
    }
    this.disconnectToneNodes(oscillator, gain)

    if (this.data.tonePlaying) {
      this.setData({ tonePlaying: false })
    }
  },

  disconnectToneNodes(oscillator, gain) {
    ;[oscillator, gain].forEach(node => {
      if (!node || typeof node.disconnect !== 'function') return
      try {
        node.disconnect()
      } catch (error) {
        // 节点可能已经由运行时断开，无需重复处理。
      }
    })
  }
})
