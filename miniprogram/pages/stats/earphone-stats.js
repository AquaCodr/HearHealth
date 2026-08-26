const { RANGE_OPTIONS, buildDataset } = require('./sound-data')
const { getUserProfile } = require('../../utils/user-profile')
const usageTracker = require('../../utils/usage-tracker')

Page({
  data: {
    rangeOptions: RANGE_OPTIONS,
    selectedRange: '周',
    statusText: '',
    dateRange: '',
    chartBars: [],
    xLabels: [],
    metrics: []
  },

  onLoad() {
    // 先用本地缓存立即渲染，再拉取今年以来的云端记录刷新（覆盖「年」视图）
    this.applyRange(this.data.selectedRange)
    const yearStart = `${new Date().getFullYear()}-01-01`
    usageTracker.refreshRange(yearStart, usageTracker.dateKeyOffset(0))
      .then(days => {
        this.days = days
        this.applyRange(this.data.selectedRange)
      })
  },

  onRangeChange(event) {
    this.applyRange(event.detail.range)
  },

  applyRange(range) {
    const dataset = buildDataset('headphone', range, {
      days: this.days || [],
      deviceModel: getUserProfile().deviceModel
    })
    this.setData({
      selectedRange: dataset.range,
      statusText: dataset.statusText,
      dateRange: dataset.dateRange,
      chartBars: dataset.chartBars,
      xLabels: dataset.xLabels,
      metrics: dataset.metrics
    })
  }
})
