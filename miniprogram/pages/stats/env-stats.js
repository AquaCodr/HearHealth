const { RANGE_OPTIONS, getSoundDataset } = require('./sound-data')

Page({
  data: {
    rangeOptions: RANGE_OPTIONS,
    selectedRange: '周',
    dateRange: '',
    chartBars: [],
    xLabels: [],
    metrics: []
  },

  onLoad() {
    this.applyRange('周')
  },

  onRangeChange(event) {
    this.applyRange(event.detail.range)
  },

  applyRange(range) {
    const dataset = getSoundDataset('environment', range)
    this.setData({
      selectedRange: dataset.range,
      dateRange: dataset.dateRange,
      chartBars: dataset.chartBars,
      xLabels: dataset.xLabels,
      metrics: dataset.metrics
    })
  }
})
