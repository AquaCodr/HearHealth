// 测试历史 —— 数据来自云函数 userFunctions 的 listTestRecords（云端最多保留最近 100 条，此处取最近 50 条）
const { callUser } = require('../../utils/auth')

// 查看历史报告时，把该条记录暂存到本地，report 页（from=history）从这里读取渲染
const HISTORY_TEST_RESULT_KEY = 'historyHearingTestResult'

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function formatCompletedAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { dateText: '时间未知', timeText: '' }
  return {
    dateText: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    timeText: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

// 单耳摘要：与报告页语义一致，展示测得频率数与平均相对阈值
function summarizeEar(results) {
  const list = Array.isArray(results) ? results : []
  const detected = list.filter(item =>
    item && item.detected && Number.isFinite(item.thresholdPercent)
  )
  if (!detected.length) return '未测得'
  const average = Math.round(
    detected.reduce((sum, item) => sum + item.thresholdPercent, 0) / detected.length
  )
  return `测得 ${detected.length}/${list.length} · 均值 ${average}%`
}

function normalizeRecord(record) {
  const { dateText, timeText } = formatCompletedAt(record.completedAt)
  return {
    ...record,
    dateText,
    timeText,
    leftText: summarizeEar(record.ears && record.ears.left),
    rightText: summarizeEar(record.ears && record.ears.right)
  }
}

Page({
  data: {
    records: [],
    loading: true
  },

  onShow() {
    this.loadRecords()
  },

  loadRecords() {
    this.setData({ loading: true })
    callUser('listTestRecords', { limit: 50 })
      .then(list => {
        this.setData({
          loading: false,
          records: (list || []).map(normalizeRecord)
        })
      })
      .catch(() => {
        this.setData({ loading: false, records: [] })
      })
  },

  // 点开某条历史记录 → 暂存完整数据并进入报告页（报告页按 from=history 读取，同时带上
  // testRecordId 供 AI 解读定位云端记录）
  onTapRecord(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.records[index]
    if (!record) return

    try {
      wx.setStorageSync(HISTORY_TEST_RESULT_KEY, {
        version: record.version,
        measurement: record.measurement,
        completedAt: record.completedAt,
        relativeLevels: record.relativeLevels,
        maxTestToneGain: record.maxTestToneGain,
        ears: record.ears
      })
    } catch (error) {
      wx.showToast({ title: '暂时无法查看该报告', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/test/report?from=history&testRecordId=${encodeURIComponent(record._id || '')}`
    })
  },

  onStartTest() {
    wx.navigateTo({ url: '/pages/test/guide' })
  }
})
