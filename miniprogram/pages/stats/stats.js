const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const AUGUST_2026_MINUTES = [
  45, 70, 85, 140, 95, 50, 185,
  75, 60, 130, 65, 150, 80, 200,
  55, 90, 160, 70, 120, 190, 75,
  60, 125, 105
]

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '暂无'
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

function getMockMinutes(year, monthIndex, day, today) {
  const date = new Date(year, monthIndex, day)
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (date > todayOnly) return null

  if (year === 2026 && monthIndex === 7 && day <= AUGUST_2026_MINUTES.length) {
    return AUGUST_2026_MINUTES[day - 1]
  }

  const generated = ((day * 37 + (monthIndex + 1) * 19 + year) % 166) + 25
  return day % 7 === 0 ? Math.max(20, generated - 35) : generated
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
    headphoneMiniBars: [62, 48, 70, 58, 76, 53, 66],
    environmentMiniBars: [52, 68, 45, 72, 82, 58, 61]
  },

  onLoad() {
    const today = new Date()
    this.today = today
    this.updateMonth(today.getFullYear(), today.getMonth(), today.getDate())
  },

  updateMonth(year, monthIndex, preferredDay) {
    const today = this.today || new Date()
    const firstWeekday = new Date(year, monthIndex, 1).getDay()
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const calendarDays = []
    const minuteValues = []

    for (let index = 0; index < firstWeekday; index += 1) {
      calendarDays.push({ key: `blank-${index}`, isBlank: true })
    }

    const isCurrentMonth = year === today.getFullYear() && monthIndex === today.getMonth()
    const selectedDay = Math.min(preferredDay || 1, daysInMonth)

    for (let day = 1; day <= daysInMonth; day += 1) {
      const minutes = getMockMinutes(year, monthIndex, day, today)
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

    const totalMinutes = minuteValues.reduce((sum, value) => sum + value, 0)
    const averageMinutes = minuteValues.length ? Math.round(totalMinutes / minuteValues.length) : 0
    const selectedItem = calendarDays.find(item => item.day === selectedDay)
    const currentMonthValue = today.getFullYear() * 12 + today.getMonth()
    const displayedMonthValue = year * 12 + monthIndex

    this.setData({
      displayYear: year,
      displayMonthIndex: monthIndex,
      monthTitle: `${year}年${monthIndex + 1}月`,
      calendarDays,
      canGoNext: displayedMonthValue < currentMonthValue,
      selectedDay,
      selectedDateText: `${monthIndex + 1}月${selectedDay}日`,
      selectedDuration: selectedItem && selectedItem.hasData ? `用耳 ${formatDuration(selectedItem.minutes)}` : '暂无用耳数据',
      monthAverage: formatCompactDuration(averageMinutes),
      monthTotal: formatCompactDuration(totalMinutes)
    })
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
    const today = this.today || new Date()
    const preferredDay = year === today.getFullYear() && monthIndex === today.getMonth() ? today.getDate() : 1
    this.updateMonth(year, monthIndex, preferredDay)
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
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  }
})
