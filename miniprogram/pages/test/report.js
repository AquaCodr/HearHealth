const LATEST_TEST_RESULT_KEY = 'latestHearingTestResult'
const COMMUNITY_SHARE_DRAFT_KEY = 'hearingReportShareDraft'

Page({
  data: {
    hasResult: false,
    chartDrawFailed: false,
    completedAtText: '',
    totalDetectedText: '0 / 12',
    earSummaries: [],
    navigating: false
  },

  onLoad() {
    this.chartReady = false
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
    let result
    try {
      result = wx.getStorageSync(LATEST_TEST_RESULT_KEY)
    } catch (error) {
      result = null
    }

    if (!this.isValidResult(result)) return

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
    })
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
