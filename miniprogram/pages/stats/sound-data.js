// 音量详情页数据构建：不再使用写死的演示数值，
// 而是由按天的用量记录（前台时长追踪产生的秒数与定期音量采样，见 utils/usage-tracker.js）
// 动态聚合出 小时/日/周/月/6个月/年 各区间的柱状带与指标。
// 柱状带直接以 dB 值作为图表百分比（组件纵轴 0-100 对应 0-100 dB）。
const RANGE_OPTIONS = ['小时', '日', '周', '月', '6个月', '年']

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatCompactDuration(minutes) {
  if (!minutes) return '0分'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}分`
  return remainder ? `${hours}小时${remainder}分` : `${hours}小时`
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, value))
}

// 某类型（headphone/environment）在一天记录上的聚合字段访问
function dayValues(day, type) {
  const prefix = type === 'headphone' ? 'hp' : 'env'
  return {
    min: day[`${prefix}Min`],
    max: day[`${prefix}Max`],
    sum: day[`${prefix}Sum`] || 0,
    count: day[`${prefix}Count`] || 0
  }
}

function sampleValue(sample, type) {
  return type === 'headphone' ? sample.hp : sample.env
}

// 一组采样合并成音量带；空集合返回 null（渲染为占位空柱）
function bandOfSamples(samples, type) {
  if (!samples || !samples.length) return null
  let min = null
  let max = null
  samples.forEach(sample => {
    const value = sampleValue(sample, type)
    min = min === null ? value : Math.min(min, value)
    max = max === null ? value : Math.max(max, value)
  })
  return { min, max }
}

// 多天的聚合字段合并成一条音量带（长周期视图不依赖被裁剪的采样明细）
function bandOfDayList(records, type) {
  const bands = (records || []).map(record => {
    const values = dayValues(record, type)
    return values.count ? { min: values.min, max: values.max } : null
  }).filter(Boolean)
  if (!bands.length) return null
  return {
    min: Math.min(...bands.map(b => b.min)),
    max: Math.max(...bands.map(b => b.max))
  }
}

function bandToBar(band, index) {
  if (!band) return { key: `bar-${index}`, min: 0, span: 0 }
  const min = Math.round(clampPercent(band.min))
  const max = Math.round(clampPercent(band.max))
  return { key: `bar-${index}`, min, span: Math.max(max - min, 2) }
}

// 区间汇总：平均音量、总体范围、日均音量的波动范围、累计用耳时长
function summarize(type, records) {
  let sum = 0
  let count = 0
  let min = null
  let max = null
  let totalSeconds = 0
  const dailyAverages = []

  ;(records || []).forEach(record => {
    const values = dayValues(record, type)
    totalSeconds += record.seconds || 0
    if (!values.count) return
    sum += values.sum
    count += values.count
    dailyAverages.push(Math.round(values.sum / values.count))
    min = min === null ? values.min : Math.min(min, values.min)
    max = max === null ? values.max : Math.max(max, values.max)
  })

  return {
    hasData: count > 0,
    average: count ? Math.round(sum / count) : null,
    min,
    max,
    dailyAverageMin: dailyAverages.length ? Math.min(...dailyAverages) : null,
    dailyAverageMax: dailyAverages.length ? Math.max(...dailyAverages) : null,
    totalMinutes: Math.round(totalSeconds / 60)
  }
}

function latestSample(samples, type) {
  if (!samples || !samples.length) return null
  return samples.reduce((latest, sample) => (!latest || sample.t > latest.t ? sample : latest), null)
}

function formatSampleTime(timestamp, now) {
  const date = new Date(timestamp)
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  return isToday ? clock : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
}

function buildMetrics(type, summary, samples, now, deviceModel) {
  const latest = latestSample(samples, type)

  if (type === 'headphone') {
    return [
      {
        label: '暴露量',
        value: summary.hasData ? `${summary.average} dB（${formatCompactDuration(summary.totalMinutes)}）` : '暂无',
        description: '综合音量与持续时间计算'
      },
      {
        label: '日均音量',
        value: summary.dailyAverageMin !== null
          ? `${summary.dailyAverageMin}–${summary.dailyAverageMax} dB`
          : '暂无'
      },
      {
        label: '最新记录',
        value: latest ? `${sampleValue(latest, type)} dB · ${formatSampleTime(latest.t, now)}` : '暂无'
      },
      {
        label: '音量范围',
        value: summary.min !== null ? `${summary.min}–${summary.max} dB` : '暂无'
      },
      { label: '耳机型号', value: deviceModel || '未设置' }
    ]
  }

  return [
    {
      label: '平均音量',
      value: summary.hasData ? `${summary.average} dB` : '暂无',
      description: '当前时间范围的等效平均值'
    },
    { label: '最高音量', value: summary.max !== null ? `${summary.max} dB` : '暂无' },
    {
      label: '最新记录',
      value: latest ? `${sampleValue(latest, type)} dB · ${formatSampleTime(latest.t, now)}` : '暂无'
    },
    { label: '暴露时长', value: formatCompactDuration(summary.totalMinutes) },
    { label: '数据来源', value: '应用内采样' },
    { label: '监测说明', value: '仅供趋势参考' }
  ]
}

// 各区间共用：由标签、音量带列表与参与统计的记录组装最终数据集
function assemble(type, range, labels, bands, records, now, deviceModel, dateRange) {
  const samples = []
  ;(records || []).forEach(record => {
    ;(record.samples || []).forEach(sample => samples.push(sample))
  })
  const summary = summarize(type, records)

  return {
    range,
    dateRange,
    xLabels: labels,
    chartBars: labels.map((_, index) => bandToBar(bands[index], index)),
    statusText: !summary.hasData
      ? '数据待积累'
      : summary.average > 70
        ? '音量偏高，注意休息'
        : '状态良好',
    metrics: buildMetrics(type, summary, samples, now, deviceModel)
  }
}

function buildDataset(type, range, ctx) {
  const safeType = type === 'environment' ? 'environment' : 'headphone'
  const safeRange = RANGE_OPTIONS.includes(range) ? range : '周'
  const now = new Date()

  const byKey = {}
  ;((ctx && ctx.days) || []).forEach(day => {
    if (day && day.dateKey) byKey[day.dateKey] = day
  })
  const deviceModel = (ctx && ctx.deviceModel) || ''

  const year = now.getFullYear()
  const month = now.getMonth()
  const todayMidnight = new Date(year, month, now.getDate()).getTime()

  if (safeRange === '小时' || safeRange === '日') {
    // 小时：今天实际有采样的时刻；日：今天按 4 小时分桶
    const today = byKey[dateKeyOf(now)]
    const samples = (today && today.samples) || []

    let labels = []
    let bands = []
    if (safeRange === '小时') {
      const buckets = {}
      samples.forEach(sample => {
        const hour = new Date(sample.t).getHours()
        ;(buckets[hour] = buckets[hour] || []).push(sample)
      })
      labels = Object.keys(buckets).map(Number).sort((a, b) => a - b).map(hour => `${pad2(hour)}:00`)
      bands = Object.keys(buckets).map(Number).sort((a, b) => a - b).map(hour => bandOfSamples(buckets[hour], safeType))
    } else {
      labels = ['0时', '4时', '8时', '12时', '16时', '20时']
      const buckets = Array.from({ length: 6 }, () => [])
      samples.forEach(sample => {
        buckets[Math.floor(new Date(sample.t).getHours() / 4)].push(sample)
      })
      bands = buckets.map(list => bandOfSamples(list, safeType))
    }

    return assemble(safeType, safeRange, labels, bands, today ? [today] : [], now, deviceModel, '今天')
  }

  if (safeRange === '周') {
    // 本周一到周日（未来日期留空柱）
    const mondayOffset = (now.getDay() + 6) % 7
    const monday = new Date(year, month, now.getDate() - mondayOffset)
    const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const bands = []
    const records = []
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
      if (day.getTime() > todayMidnight) {
        bands.push(null)
        continue
      }
      const record = byKey[dateKeyOf(day)]
      records.push(record)
      bands.push(record ? bandOfDayList([record], safeType) : null)
    }
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
    const dateRange = `${monday.getMonth() + 1}月${monday.getDate()}日–${sunday.getMonth() + 1}月${sunday.getDate()}日`
    return assemble(safeType, safeRange, labels, bands, records.filter(Boolean), now, deviceModel, dateRange)
  }

  if (safeRange === '月') {
    // 展示月的自然周（每 7 天一周，末周补齐）
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const weekCount = Math.ceil(daysInMonth / 7)
    const labels = []
    const bands = []
    const records = []
    for (let week = 0; week < weekCount; week += 1) {
      labels.push(`第${week + 1}周`)
      const startDay = week * 7 + 1
      const endDay = Math.min((week + 1) * 7, daysInMonth)
      const weekRecords = []
      for (let day = startDay; day <= endDay; day += 1) {
        const record = byKey[dateKeyOf(new Date(year, month, day))]
        if (record) weekRecords.push(record)
      }
      records.push(...weekRecords)
      bands.push(bandOfDayList(weekRecords, safeType))
    }
    return assemble(safeType, safeRange, labels, bands, records, now, deviceModel, `${year}年${month + 1}月`)
  }

  // 6个月 / 年：按自然月聚合
  const monthOffsets = safeRange === '6个月'
    ? [5, 4, 3, 2, 1, 0]
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const labels = []
  const bands = []
  const records = []
  const monthMeta = []

  monthOffsets.forEach(offset => {
    const cursor = safeRange === '6个月'
      ? new Date(year, month - offset, 1)
      : new Date(year, offset, 1)
    const prefix = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
    const monthRecords = Object.keys(byKey)
      .filter(key => key.startsWith(prefix))
      .map(key => byKey[key])
    labels.push(`${cursor.getMonth() + 1}月`)
    monthMeta.push(cursor)
    records.push(...monthRecords)
    bands.push(bandOfDayList(monthRecords, safeType))
  })

  const first = monthMeta[0]
  const last = monthMeta[monthMeta.length - 1]
  const dateRange = safeRange === '6个月'
    ? `${first.getFullYear()}年${first.getMonth() + 1}月–${last.getFullYear()}年${last.getMonth() + 1}月`
    : `${year}年`
  return assemble(safeType, safeRange, labels, bands, records, now, deviceModel, dateRange)
}

module.exports = {
  RANGE_OPTIONS,
  buildDataset
}
