const LATEST_TEST_RESULT_KEY = 'latestHearingTestResult'
// 测试历史页查看某条旧记录时，会把完整结果暂存在这个 key（见 pages/profile/test-history.js）
const HISTORY_TEST_RESULT_KEY = 'historyHearingTestResult'
const COMMUNITY_SHARE_DRAFT_KEY = 'hearingReportShareDraft'
const AI_FIXED_DISCLAIMER = 'AI 解读仅用于听力健康教育和初步筛查结果解释，不构成医学诊断，也不能替代专业听力检查或医生建议。'
const { callUser } = require('../../utils/auth')
const { analyzeHearingTest } = require('../../utils/ai')

function readTestRecordId(value) {
  if (typeof value !== 'string') return ''
  try {
    return decodeURIComponent(value).trim()
  } catch (error) {
    return ''
  }
}

Page({
  data: {
    hasResult: false,
    chartDrawFailed: false,
    completedAtText: '',
    totalDetectedText: '0 / 12',
    earSummaries: [],
    navigating: false,
    aiStatus: 'idle',
    aiAnalysis: null,
    aiErrorMessage: '',
    aiCanRetry: false,
    aiFixedDisclaimer: AI_FIXED_DISCLAIMER
  },

  onLoad(options) {
    this.chartReady = false
    this.testRecordId = readTestRecordId(options && options.testRecordId)
    this.aiUnavailableReason = options && options.aiUnavailable
    // from=history：来自测试历史页，渲染指定的历史记录而不是最新一条
    this.fromHistory = Boolean(options && options.from === 'history')
    this.aiStarted = false
    this.loadLatestResult()
  },

  onReady() {
    this.chartReady = true
    if (this.data.hasResult) this.drawThresholdChart()
  },

  onShow() {
    if (this.data.navigating) this.setData({ navigating: false })
  },

  loadLatestResult() {
    // 历史模式：读取测试历史页暂存的指定记录；数据缺失时展示空态，不回退到最新记录
    if (this.fromHistory) {
      let record
      try {
        record = wx.getStorageSync(HISTORY_TEST_RESULT_KEY)
      } catch (error) {
        record = null
      }
      if (this.isValidResult(record)) this.renderResult(record)
      return
    }

    let result
    try {
      result = wx.getStorageSync(LATEST_TEST_RESULT_KEY)
    } catch (error) {
      result = null
    }

    if (this.isValidResult(result)) {
      this.renderResult(result)
      return
    }

    // 本地无有效结果时从云端兜底拉取（换设备场景）
    callUser('getLatestTestRecord')
      .then(cloudResult => {
        if (!this.isValidResult(cloudResult)) return
        try {
          wx.setStorageSync(LATEST_TEST_RESULT_KEY, cloudResult)
        } catch (error) {
          // 本地缓存失败不影响展示
        }
        this.renderResult(cloudResult)
      })
      .catch(() => {})
  },

  renderResult(result) {
    const leftSummary = this.buildEarSummary('left', 'L', '左耳', result.ears.left)
    const rightSummary = this.buildEarSummary('right', 'R', '右耳', result.ears.right)
    const totalDetected = leftSummary.detectedCount + rightSummary.detectedCount

    this.setData({
      hasResult: true,
      chartDrawFailed: false,
      completedAtText: this.formatCompletedAt(result.completedAt),
      totalDetectedText: `${totalDetected} / 12`,
      earSummaries: [leftSummary, rightSummary]
    }, () => {
      if (this.chartReady) this.drawThresholdChart()
      this.startAiAnalysis()
    })
  },

  startAiAnalysis() {
    if (this.aiStarted || !this.data.hasResult) return
    this.aiStarted = true

    if (!this.testRecordId) {
      const reason = this.aiUnavailableReason
      this.setData({
        aiStatus: 'error',
        aiAnalysis: null,
        aiErrorMessage: reason === 'record-sync-failed'
          ? '测试记录暂未同步到云端，暂时无法生成 AI 解读'
          : reason === 'guest-mode'
            ? '游客模式下测试记录仅保存在本机，登录后完成测试即可生成 AI 解读'
            : '这份报告没有可用的云端记录标识，暂时无法生成 AI 解读',
        aiCanRetry: false
      })
      return
    }

    this.requestAiAnalysis()
  },

  requestAiAnalysis() {
    if (!this.testRecordId || this.data.aiStatus === 'loading') return
    this.setData({
      aiStatus: 'loading',
      aiAnalysis: null,
      aiErrorMessage: '',
      aiCanRetry: false
    })

    analyzeHearingTest(this.testRecordId)
      .then(result => {
        if (!result || !result.analysis) throw new Error('missing analysis')
        this.setData({
          aiStatus: 'success',
          aiAnalysis: this.prepareAnalysisForView(result.analysis),
          aiErrorMessage: '',
          aiCanRetry: false
        })
      })
      .catch(error => {
        console.warn('[report] AI analysis failed', {
          code: error && error.code ? error.code : 'AI_REQUEST_FAILED'
        })
        this.setData({
          aiStatus: 'error',
          aiAnalysis: null,
          aiErrorMessage: this.getAiErrorMessage(error && error.code),
          aiCanRetry: true
        })
      })
  },

  retryAiAnalysis() {
    this.requestAiAnalysis()
  },

  getAiErrorMessage(code) {
    switch (code) {
      case 'CONFIG_MISSING':
        return 'AI 服务尚未完成配置，基础听力报告仍可正常查看'
      case 'RECORD_NOT_FOUND':
        return '没有找到对应的云端测试记录，暂时无法生成 AI 解读'
      case 'MODEL_INVALID_RESPONSE':
        return 'AI 返回内容未通过安全校验，请稍后重试'
      case 'CACHE_ERROR':
        return 'AI 分析缓存暂时不可用，请稍后重试'
      default:
        return 'AI 解读暂时不可用，请稍后重试'
    }
  },

  prepareAnalysisForView(analysis) {
    const labels = {
      routine: '日常建议',
      monitor: '持续关注',
      'professional-check': '建议专业检查'
    }
    return {
      overview: this.cleanAiDisplayText(analysis.overview),
      findings: (Array.isArray(analysis.findings) ? analysis.findings : [])
        .map(item => ({
          title: this.cleanAiDisplayText(item && item.title),
          explanation: this.cleanAiDisplayText(item && item.explanation)
        }))
        .filter(item => item.title || item.explanation),
      earComparison: {
        summary: this.cleanAiDisplayText(analysis.earComparison && analysis.earComparison.summary),
        caution: this.cleanAiDisplayText(analysis.earComparison && analysis.earComparison.caution)
      },
      recommendations: (Array.isArray(analysis.recommendations) ? analysis.recommendations : []).map(item => ({
        priority: item.priority,
        priorityLabel: labels[item.priority] || '健康建议',
        text: this.cleanAiDisplayText(item.text),
        reason: this.cleanAiDisplayText(item.reason)
      })).filter(item => item.text || item.reason),
      redFlags: this.cleanAiDisplayList(analysis.redFlags),
      limitations: this.cleanAiDisplayList(analysis.limitations)
    }
  },

  cleanAiDisplayText(value) {
    if (typeof value !== 'string') return ''
    return value
      .replace(/\bdata(?:\.[A-Za-z_$][\w$]*)+\b/gi, '')
      .replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, '')
      .replace(/\b[a-z]{2,}(?:[A-Z][A-Za-z0-9]*)+\b/g, '')
      .replace(/\b(?:routine|monitor|professional-check|relative-gain-threshold)\b/gi, '')
      .replace(/^\s*[:：,，;；|/\\–—-]+\s*/g, '')
      .replace(/\s*[:：,，;；|/\\–—-]+\s*$/g, '')
      .trim()
  },

  cleanAiDisplayList(value) {
    if (!Array.isArray(value)) return []
    return value.map(this.cleanAiDisplayText).filter(Boolean)
  },

  isValidResult(result) {
    return Boolean(
      result &&
      result.measurement === 'relative-gain-threshold' &&
      result.ears &&
      Array.isArray(result.ears.left) &&
      result.ears.left.length === 6 &&
      Array.isArray(result.ears.right) &&
      result.ears.right.length === 6
    )
  },

  buildEarSummary(key, code, name, results) {
    const detectedResults = results.filter(item => this.isValidThreshold(item))
    const detectedCount = detectedResults.length
    const averageThreshold = detectedCount
      ? Math.round(
          detectedResults.reduce((total, item) => total + item.thresholdPercent, 0) /
          detectedCount
        )
      : null

    return {
      key,
      code,
      name,
      detectedCount,
      detectedText: `${detectedCount} / 6`,
      averageText: averageThreshold === null ? '—' : `${averageThreshold}%`,
      results: results.map(item => {
        const detected = this.isValidThreshold(item)
        return {
          frequency: item.frequency,
          detected,
          thresholdPercent: detected ? item.thresholdPercent : null,
          thresholdText: detected ? `${item.thresholdPercent}%` : '未测得'
        }
      })
    }
  },

  isValidThreshold(result) {
    return Boolean(
      result &&
      result.detected &&
      Number.isFinite(result.thresholdPercent) &&
      result.thresholdPercent >= 10 &&
      result.thresholdPercent <= 100
    )
  },

  formatCompletedAt(timestamp) {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return '完成时间未知'

    const pad = value => String(value).padStart(2, '0')
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },

  drawThresholdChart() {
    const query = this.createSelectorQuery()
    query
      .select('#thresholdChart')
      .fields({ node: true, size: true })
      .exec(result => {
        const canvasInfo = result && result[0]
        if (!canvasInfo || !canvasInfo.node || !canvasInfo.width || !canvasInfo.height) {
          this.setData({ chartDrawFailed: true })
          return
        }

        try {
          this.renderThresholdChart(
            canvasInfo.node,
            canvasInfo.width,
            canvasInfo.height
          )
        } catch (error) {
          this.setData({ chartDrawFailed: true })
        }
      })
  },

  renderThresholdChart(canvas, width, height) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d context unavailable')

    const pixelRatio = this.getDevicePixelRatio()
    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio
    context.scale(pixelRatio, pixelRatio)
    context.clearRect(0, 0, width, height)

    const plot = {
      left: 44,
      right: width - 12,
      top: 12,
      bottom: height - 34
    }
    const frequencies = [125, 250, 500, 1000, 2000, 4000]
    const gridLevels = [10, 30, 50, 70, 90, 100]
    const xForIndex = index => (
      plot.left + ((plot.right - plot.left) * index / (frequencies.length - 1))
    )
    const yForLevel = level => (
      plot.top + ((plot.bottom - plot.top) * (level - 10) / 90)
    )

    this.drawChartGrid(context, plot, frequencies, gridLevels, xForIndex, yForLevel)
    this.drawChartSeries(context, this.data.earSummaries[0].results, '#0066cc', xForIndex, yForLevel)
    this.drawChartSeries(context, this.data.earSummaries[1].results, '#34c759', xForIndex, yForLevel)
  },

  drawChartGrid(context, plot, frequencies, levels, xForIndex, yForLevel) {
    context.font = '10px sans-serif'
    context.textBaseline = 'middle'
    context.lineWidth = 1

    levels.forEach(level => {
      const y = yForLevel(level)
      context.beginPath()
      context.moveTo(plot.left, y)
      context.lineTo(plot.right, y)
      context.strokeStyle = '#f0f0f0'
      context.stroke()

      context.fillStyle = '#7a7a7a'
      context.textAlign = 'right'
      context.fillText(`${level}%`, plot.left - 6, y)
    })

    frequencies.forEach((frequency, index) => {
      const x = xForIndex(index)
      context.beginPath()
      context.moveTo(x, plot.top)
      context.lineTo(x, plot.bottom)
      context.strokeStyle = '#f0f0f0'
      context.stroke()

      context.fillStyle = '#7a7a7a'
      context.textAlign = 'center'
      context.textBaseline = 'top'
      const label = frequency >= 1000 ? `${frequency / 1000}k` : String(frequency)
      context.fillText(label, x, plot.bottom + 8)
    })
  },

  drawChartSeries(context, results, color, xForIndex, yForLevel) {
    let previousPoint = null

    results.forEach((result, index) => {
      const hasPoint = result.detected && Number.isFinite(result.thresholdPercent)
      if (!hasPoint) {
        previousPoint = null
        return
      }

      const point = {
        x: xForIndex(index),
        y: yForLevel(result.thresholdPercent)
      }

      if (previousPoint) {
        context.beginPath()
        context.moveTo(previousPoint.x, previousPoint.y)
        context.lineTo(point.x, point.y)
        context.strokeStyle = color
        context.lineWidth = 2
        context.stroke()
      }

      context.beginPath()
      context.arc(point.x, point.y, 4, 0, Math.PI * 2)
      context.fillStyle = color
      context.fill()
      context.strokeStyle = '#ffffff'
      context.lineWidth = 2
      context.stroke()

      previousPoint = point
    })
  },

  getDevicePixelRatio() {
    try {
      if (typeof wx.getWindowInfo === 'function') {
        return wx.getWindowInfo().pixelRatio || 1
      }
    } catch (error) {
      // 无法读取设备像素比时使用 1，图表内容仍可正常展示。
    }
    return 1
  },

  startTest() {
    if (this.data.navigating) return

    this.setData({ navigating: true })
    wx.reLaunch({
      url: '/pages/test/guide',
      fail: () => this.handleNavigationFailure('暂时无法开始测试')
    })
  },

  shareToCommunity() {
    if (!this.data.hasResult || this.data.navigating) return

    const draft = this.buildCommunityShareDraft()
    try {
      wx.setStorageSync(COMMUNITY_SHARE_DRAFT_KEY, draft)
    } catch (error) {
      wx.showToast({ title: '生成分享内容失败，请重试', icon: 'none' })
      return
    }

    this.setData({ navigating: true })
    wx.navigateTo({
      url: '/pages/community/publish?source=hearing-report',
      fail: () => this.handleNavigationFailure('暂时无法进入发布页')
    })
  },

  buildCommunityShareDraft() {
    const lines = this.data.earSummaries.map(summary => {
      const details = summary.results
        .map(result => `${result.frequency}Hz ${result.thresholdText}`)
        .join('、')
      return `${summary.name}：平均相对阈值 ${summary.averageText}，测得 ${summary.detectedText}\n${details}`
    })
    const content = [
      '我完成了一次听力相对阈值筛查。',
      ...lines,
      '说明：百分比是固定设备音量下的小程序相对测试值，不是真实分贝，也不代表医学诊断。'
    ].join('\n\n')

    return {
      source: 'hearing-report',
      tag: 'report',
      content: content.slice(0, 500),
      createdAt: Date.now()
    }
  },

  returnHome() {
    if (this.data.navigating) return

    this.setData({ navigating: true })
    wx.switchTab({
      url: '/pages/home/home',
      fail: () => this.handleNavigationFailure('暂时无法返回首页')
    })
  },

  handleNavigationFailure(message) {
    this.setData({ navigating: false })
    wx.showToast({ title: message, icon: 'none' })
  }
})
