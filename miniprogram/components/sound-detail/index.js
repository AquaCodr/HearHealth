Component({
  properties: {
    rangeOptions: {
      type: Array,
      value: []
    },
    selectedRange: {
      type: String,
      value: '周'
    },
    statusLabel: {
      type: String,
      value: '暴露状态'
    },
    statusText: {
      type: String,
      value: '状态良好'
    },
    dateRange: {
      type: String,
      value: ''
    },
    chartBars: {
      type: Array,
      value: []
    },
    xLabels: {
      type: Array,
      value: []
    },
    metrics: {
      type: Array,
      value: []
    },
    referenceValue: {
      type: Number,
      value: 60
    },
    infoTitle: {
      type: String,
      value: '数据说明'
    },
    infoText: {
      type: String,
      value: '页面数据仅用于展示趋势，不能替代专业听力评估。'
    },
    footerText: {
      type: String,
      value: '数据仅供趋势参考'
    }
  },

  methods: {
    onSelectRange(event) {
      const range = event.currentTarget.dataset.range
      if (!range || range === this.data.selectedRange) return
      this.triggerEvent('rangechange', { range })
    },

    onShowInfo() {
      wx.showModal({
        title: this.data.infoTitle,
        content: this.data.infoText,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#0066cc'
      })
    }
  }
})
