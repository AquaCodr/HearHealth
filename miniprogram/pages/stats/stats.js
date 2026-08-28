const usageTracker = require('../../utils/usage-tracker')

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '暂无'
  if (!minutes) return '0分'
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}小时${remainder}分` : `${hours}小时`
}

function formatCompactDuration(minutes) {
  if (!minutes) return '0分'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}分`
  return remainder ? `${hours}小时${remainder}分` : `${hours}小时`
}

function getLevel(minutes) {
  if (minutes === null || minutes === undefined) return 0
  if (minutes <= 60) return 1
  if (minutes <= 120) return 2
  if (minutes <= 180) return 3
  return 4
}

// 迷你区间图：与详情页（sound-detail）同语义，dB 值直接作为图表百分比（纵轴 0-100% 对应 0-100 dB），
// 每天一根从当日最低到最高音量的细线段，无采样日 span 为 0 不渲染
function bandToRangeBar(min, max, index) {
  if (min === null || min === undefined || max === null || max === undefined) {
    return { key: `bar-${index}`, min: 0, span: 0 }
  }
  const low = Math.round(Math.min(100, Math.max(0, min)))
  const high = Math.round(Math.min(100, Math.max(0, max)))
  return { key: `bar-${index}`, min: low, span: Math.max(high - low, 2) }
}

Page({
  data: {
    weekdays: WEEKDAYS,
    displayYear: 2026,
    displayMonthIndex: 7,
    monthTitle: '',
    calendarDays: [],
    canGoNext: false,
    selectedDay: null,
    selectedDateText: '',
    selectedDuration: '',
    monthAverage: '',
    monthTotal: '',
    headphoneMiniBars: [],
    environmentMiniBars: [],
    headphoneStatus: '',
    environmentStatus: '',
    headphoneMeta: '',
    environmentMeta: ''
  },

  onLoad() {
    const today = new Date()
    this.today = today
    // 已加载的按天用量缓存（dateKey -> 记录），由 loadUsage 填充
    this.usageCache = {}
    this.updateMonth(today.getFullYear(), today.getMonth(), today.getDate())
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    // 回到统计页时刷新一次，今天的时长会随前台追踪持续增长；
    // 标签页可能驻留过夜，日期变了要重置“今天”并切回当前月
    if (this.today) {
      const now = new Date()
      const monthChanged = now.getFullYear() !== this.today.getFullYear()
        || now.getMonth() !== this.today.getMonth()
      this.today = now
      if (monthChanged) {
        this.updateMonth(now.getFullYear(), now.getMonth(), now.getDate())
      } else {
        this.rebuildCalendar()
        this.renderMiniInsights()
        this.loadUsage()
      }
    }
  },

  // 拉取展示月份 + 最近 7 天的用量（本地优先渲染，再异步合并云端），驱动日历与迷你图
  loadUsage() {
    const today = this.today
    const monthStart = new Date(this.data.displayYear, this.data.displayMonthIndex, 1)
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
    const rangeStart = monthStart < weekStart ? monthStart : weekStart
    const fromKey = dateKeyOf(rangeStart)
    const toKey = dateKeyOf(today)

    const render = (days) => {
      ;(days || []).forEach(record => {
        this.usageCache[record.dateKey] = record
      })
      this.rebuildCalendar()
      this.renderMiniInsights()
    }

    render(usageTracker.getDays(fromKey, toKey))
    usageTracker.refreshRange(fromKey, toKey).then(render)
  },

  getDayMinutes(year, monthIndex, day) {
    const record = this.usageCache[dateKeyOf(new Date(year, monthIndex, day))]
    if (!record || !record.seconds) return null
    return Math.round(record.seconds / 60)
  },

  // 由用量缓存重建当前月的日历与汇总（结构沿用原实现）
  rebuildCalendar() {
    const { displayYear: year, displayMonthIndex: monthIndex } = this.data
    const today = this.today || new Date()
    const firstWeekday = new Date(year, monthIndex, 1).getDay()
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const calendarDays = []
    const minuteValues = []

    for (let index = 0; index < firstWeekday; index += 1) {
      calendarDays.push({ key: `blank-${index}`, isBlank: true })
    }

    const isCurrentMonth = year === today.getFullYear() && monthIndex === today.getMonth()
    const selectedDay = this.data.selectedDay
      ? Math.min(this.data.selectedDay, daysInMonth)
      : Math.min(today.getDate(), daysInMonth)

    for (let day = 1; day <= daysInMonth; day += 1) {
      const minutes = this.getDayMinutes(year, monthIndex, day)
      const hasData = minutes !== null
      if (hasData) minuteValues.push(minutes)
      const isToday = isCurrentMonth && day === today.getDate()
      const isSelected = day === selectedDay
      const durationLabel = hasData ? formatDuration(minutes) : '--'

      calendarDays.push({
        key: `day-${day}`,
        day,
        minutes,
        hasData,
        isToday,
        isSelected,
        level: getLevel(minutes),
        durationLabel,
        ariaLabel: `${monthIndex + 1}月${day}日，${hasData ? `用耳${durationLabel}` : '暂无数据'}${isToday ? '，今天' : ''}`
      })
    }

    // 始终补齐 6 周（42 格），避免切换月份时日历和下方卡片上下跳动。
    while (calendarDays.length < 42) {
      calendarDays.push({
        key: `trailing-blank-${calendarDays.length}`,
        isBlank: true
      })
    }

    const totalMinutes = minuteValues.reduce((sum, value) => sum + value, 0)
    const averageMinutes = minuteValues.length ? Math.round(totalMinutes / minuteValues.length) : 0
    const selectedItem = calendarDays.find(item => item.day === selectedDay)

    this.setData({
      calendarDays,
      selectedDay,
      selectedDateText: `${monthIndex + 1}月${selectedDay}日`,
      selectedDuration: selectedItem && selectedItem.hasData ? `用耳 ${formatDuration(selectedItem.minutes)}` : '暂无用耳数据',
      monthAverage: formatCompactDuration(averageMinutes),
      monthTotal: formatCompactDuration(totalMinutes)
    })
  },

  // 「听力数据」两张卡片的迷你柱状图与摘要文案：来自最近 7 天的音量聚合与用耳秒数
  renderMiniInsights() {
    const today = this.today
    const keys = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
      keys.push(dateKeyOf(date))
    }
    const records = keys.map(key => this.usageCache[key]).filter(Boolean)

    const headphoneMiniBars = []
    const environmentMiniBars = []
    let hpSum = 0
    let hpCount = 0
    let envSum = 0
    let envCount = 0
    let envPeak = null
    let totalSeconds = 0

    keys.forEach((key, index) => {
      const record = this.usageCache[key]
      const hasHp = record && record.hpCount
      const hasEnv = record && record.envCount
      headphoneMiniBars.push(bandToRangeBar(hasHp ? record.hpMin : null, hasHp ? record.hpMax : null, index))
      environmentMiniBars.push(bandToRangeBar(hasEnv ? record.envMin : null, hasEnv ? record.envMax : null, index))

      if (record) {
        hpSum += record.hpSum || 0
        hpCount += record.hpCount || 0
        envSum += record.envSum || 0
        envCount += record.envCount || 0
        totalSeconds += record.seconds || 0
        envPeak = envPeak === null
          ? record.envMax
          : (record.envMax === null ? envPeak : Math.max(envPeak, record.envMax))
      }
    })

    const hasSamples = hpCount > 0
    const hpOverall = hasSamples ? Math.round(hpSum / hpCount) : null
    const envOverall = envCount ? Math.round(envSum / envCount) : null

    this.setData({
      headphoneMiniBars,
      environmentMiniBars,
      headphoneStatus: hasSamples ? '七日暴露良好' : '暂无足够数据',
      environmentStatus: envCount ? '七日暴露良好' : '暂无足够数据',
      headphoneMeta: hasSamples
        ? `平均 ${hpOverall} dB · 使用 ${formatCompactDuration(Math.round(totalSeconds / 60))}`
        : '开始使用后生成音量记录',
      environmentMeta: envCount
        ? `平均 ${envOverall} dB · 峰值 ${envPeak} dB`
        : '开始使用后生成环境音量记录'
    })
  },

  updateMonth(year, monthIndex, preferredDay) {
    const today = this.today || new Date()
    const currentMonthValue = today.getFullYear() * 12 + today.getMonth()
    const displayedMonthValue = year * 12 + monthIndex

    this.setData({
      displayYear: year,
      displayMonthIndex: monthIndex,
      monthTitle: `${year}年${monthIndex + 1}月`,
      canGoNext: displayedMonthValue < currentMonthValue,
      // 换月时默认选中今天（历史月份选 1 号）
      selectedDay: year === today.getFullYear() && monthIndex === today.getMonth()
        ? today.getDate()
        : 1
    })
    this.rebuildCalendar()
    this.renderMiniInsights()
    this.loadUsage()
  },

  onPreviousMonth() {
    let year = this.data.displayYear
    let monthIndex = this.data.displayMonthIndex - 1
    if (monthIndex < 0) {
      year -= 1
      monthIndex = 11
    }
    this.updateMonth(year, monthIndex, 1)
  },

  onNextMonth() {
    if (!this.data.canGoNext) return
    let year = this.data.displayYear
    let monthIndex = this.data.displayMonthIndex + 1
    if (monthIndex > 11) {
      year += 1
      monthIndex = 0
    }
    this.updateMonth(year, monthIndex, 1)
  },

  onSelectDay(event) {
    const day = Number(event.currentTarget.dataset.day)
    if (!day) return

    const calendarDays = this.data.calendarDays.map(item => ({
      ...item,
      isSelected: item.day === day
    }))
    const selectedItem = calendarDays.find(item => item.day === day)

    this.setData({
      calendarDays,
      selectedDay: day,
      selectedDateText: `${this.data.displayMonthIndex + 1}月${day}日`,
      selectedDuration: selectedItem && selectedItem.hasData ? `用耳 ${formatDuration(selectedItem.minutes)}` : '暂无用耳数据'
    })
  },

  onOpenHeadphoneStats() {
    wx.navigateTo({ url: '/pages/stats/earphone-stats' })
  },

  onOpenEnvironmentStats() {
    wx.navigateTo({ url: '/pages/stats/env-stats' })
  }
})
