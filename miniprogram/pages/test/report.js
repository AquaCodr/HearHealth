const LATEST_TEST_RESULT_KEY = 'latestHearingTestResult'

Page({
  data: {
    hasResult: false,
    completedAtText: '',
    totalDetectedText: '0 / 12',
    earSummaries: []
  },

  onLoad() {
    this.loadLatestResult()
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
      completedAtText: this.formatCompletedAt(result.completedAt),
      totalDetectedText: `${totalDetected} / 12`,
      earSummaries: [leftSummary, rightSummary]
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
    const detectedResults = results.filter(item => (
      item.detected && Number.isFinite(item.thresholdPercent)
    ))
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
      results: results.map(item => ({
        frequency: item.frequency,
        detected: Boolean(item.detected),
        thresholdText: item.detected && Number.isFinite(item.thresholdPercent)
          ? `${item.thresholdPercent}%`
          : '未测得'
      }))
    }
  },

  formatCompletedAt(timestamp) {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return '完成时间未知'

    const pad = value => String(value).padStart(2, '0')
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
})
