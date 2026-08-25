const RANGE_OPTIONS = ['小时', '日', '周', '月', '6个月', '年']

const LABELS = {
  小时: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'],
  日: ['0时', '4时', '8时', '12时', '16时', '20时'],
  周: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  月: ['第1周', '第2周', '第3周', '第4周', '第5周'],
  '6个月': ['3月', '4月', '5月', '6月', '7月', '8月'],
  年: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
}

const DATE_RANGES = {
  小时: '今天 08:00–14:00',
  日: '今天',
  周: '8月17日–23日',
  月: '2026年8月',
  '6个月': '2026年3月–8月',
  年: '2026年'
}

const HEADPHONE_PAIRS = {
  小时: [[42, 66], [48, 71], [38, 69], [55, 74], [46, 68], [51, 72]],
  日: [[35, 62], [42, 70], [30, 68], [50, 76], [39, 71], [45, 65]],
  周: [[28, 72], [18, 69], [26, 70], [55, 73], [24, 67], [20, 69], [30, 64]],
  月: [[26, 71], [30, 74], [22, 69], [28, 76], [32, 70]],
  '6个月': [[24, 68], [28, 72], [26, 75], [30, 70], [25, 73], [27, 71]],
  年: [[24, 68], [25, 70], [29, 72], [27, 69], [31, 74], [30, 71], [28, 73], [26, 70], [25, 68], [27, 72], [29, 71], [28, 69]]
}

const ENVIRONMENT_PAIRS = {
  小时: [[38, 64], [40, 69], [35, 61], [42, 72], [47, 76], [39, 66]],
  日: [[32, 58], [36, 70], [31, 63], [41, 74], [44, 76], [37, 67]],
  周: [[34, 70], [28, 74], [33, 66], [25, 72], [42, 78], [26, 67], [36, 68]],
  月: [[30, 70], [32, 74], [28, 72], [35, 76], [34, 71]],
  '6个月': [[29, 68], [31, 72], [30, 74], [34, 70], [32, 76], [33, 72]],
  年: [[30, 68], [31, 69], [33, 72], [29, 70], [34, 75], [32, 72], [35, 76], [33, 73], [31, 70], [32, 72], [34, 71], [31, 69]]
}

function toBars(pairs) {
  return pairs.map(([min, max], index) => ({ key: `bar-${index}`, min, max, span: max - min }))
}

function getMetrics(type, range) {
  const rangeValues = {
    小时: ['60 dB（52分）', '58–64 dB', '62 dB · 13:42', '38–74 dB'],
    日: ['60 dB（2小时18分）', '55–65 dB', '62 dB · 13:42', '30–76 dB'],
    周: ['60 dB（13小时23分）', '56–63 dB', '62 dB · 11:57', '0–74 dB'],
    月: ['61 dB（54小时16分）', '55–66 dB', '62 dB · 8月23日', '22–76 dB'],
    '6个月': ['60 dB（326小时）', '54–65 dB', '62 dB · 8月23日', '24–75 dB'],
    年: ['59 dB（618小时）', '53–65 dB', '62 dB · 8月23日', '24–74 dB']
  }

  const environmentValues = {
    小时: ['58 dB', '76 dB', '61 dB · 13:42', '1小时18分'],
    日: ['58 dB', '76 dB', '61 dB · 13:42', '6小时12分'],
    周: ['58 dB', '76 dB', '61 dB · 14:28', '8小时42分'],
    月: ['57 dB', '78 dB', '61 dB · 8月23日', '38小时16分'],
    '6个月': ['57 dB', '80 dB', '61 dB · 8月23日', '216小时'],
    年: ['56 dB', '82 dB', '61 dB · 8月23日', '428小时']
  }

  if (type === 'headphone') {
    const values = rangeValues[range]
    return [
      { label: '暴露量', value: values[0], description: '综合音量与持续时间计算' },
      { label: '日均音量', value: values[1] },
      { label: '最新记录', value: values[2] },
      { label: '音量范围', value: values[3] },
      { label: '耳机型号', value: 'AirPods Pro' }
    ]
  }

  const values = environmentValues[range]
  return [
    { label: '平均音量', value: values[0], description: '当前时间范围的等效平均值' },
    { label: '最高音量', value: values[1] },
    { label: '最新记录', value: values[2] },
    { label: '暴露时长', value: values[3] },
    { label: '数据来源', value: '手机麦克风' },
    { label: '监测说明', value: '仅供趋势参考' }
  ]
}

function getSoundDataset(type, range) {
  const safeRange = RANGE_OPTIONS.includes(range) ? range : '周'
  const pairs = type === 'headphone' ? HEADPHONE_PAIRS[safeRange] : ENVIRONMENT_PAIRS[safeRange]
  return {
    range: safeRange,
    dateRange: DATE_RANGES[safeRange],
    xLabels: LABELS[safeRange],
    chartBars: toBars(pairs),
    metrics: getMetrics(type, safeRange)
  }
}

module.exports = {
  RANGE_OPTIONS,
  getSoundDataset
}
