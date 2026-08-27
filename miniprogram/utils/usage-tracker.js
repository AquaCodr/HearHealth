// 前台用时时长追踪与按天云同步
// 小程序拿不到系统级耳机使用时长，这里以「小程序前台停留时长」作为用耳代理指标：
// 前台期间每 30s 生成一条耳机/环境音量采样（随机游走），秒数与采样先落本地、
// 每 60s 及切后台时异步同步到 usage_records（每用户每天一条）。
// 本地镜像保留每天的秒数与音量聚合（供任意周期图表离线渲染），
// 采样明细只保留最近若干天以控制 storage 体积。
const { callUser } = require('./auth')

const STORAGE_KEY = 'hearHealthUsage'
const PENDING_KEY = 'hearHealthUsagePending'
const SAMPLE_INTERVAL_MS = 30 * 1000
const SYNC_INTERVAL_MS = 60 * 1000
// 单次结算的时长上限：进程被挂起后时钟偏差不会折算成超长用耳
const MAX_TICK_MS = 5 * 60 * 1000
// 本地保留采样明细的天数，更早的日期只留秒数与聚合
const LOCAL_SAMPLE_DAYS = 14
// 本地最多保留的天数（约 13 个月，覆盖「年」视图）
const LOCAL_DAY_LIMIT = 400
// 单日采样明细上限，与服务端裁剪规则一致
const DAY_SAMPLE_LIMIT = 300
// 耳机音量随机游走的基准值与步长（dB）
const HP_BASE_DB = 58
const HP_STEP_DB = 5
const ENV_GAP_MIN_DB = 4
const ENV_GAP_MAX_DB = 14

let active = false
let lastTickAt = 0
let samplerTimer = null
let lastSyncAt = 0
let lastHp = HP_BASE_DB
let lastEnv = 48
// 待同步缓冲：pending 接收新数据，inFlight 保存正在上报的快照。
// 两者都写入同一个 storage key，网络失败或进程退出时不会提前丢掉增量。
let pending = emptyBucket()
let inFlightBucket = null
let flushPromise = null
let flushRequested = false

function emptyBucket() {
  return { dateKey: '', seconds: 0, samples: [] }
}

function normalizeBucket(raw) {
  if (!raw || typeof raw !== 'object') return emptyBucket()
  return {
    dateKey: typeof raw.dateKey === 'string' ? raw.dateKey : '',
    seconds: Math.max(0, Number(raw.seconds) || 0),
    samples: Array.isArray(raw.samples) ? raw.samples : []
  }
}

function hasBucketData(bucket) {
  return Boolean(bucket && bucket.dateKey && (bucket.seconds || bucket.samples.length))
}

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// 今天（或相对今天偏移 offset 天）的日期键
function dateKeyOffset(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return dateKeyOf(date)
}

function newDayRecord() {
  return {
    seconds: 0,
    samples: [],
    hpCount: 0,
    hpSum: 0,
    hpMin: null,
    hpMax: null,
    envCount: 0,
    envSum: 0,
    envMin: null,
    envMax: null
  }
}

// 把一条采样并入某天的聚合统计；明细数组仅在保留期内追加
function applySampleToDay(day, sample) {
  day.hpCount += 1
  day.hpSum += sample.hp
  day.hpMin = day.hpMin === null ? sample.hp : Math.min(day.hpMin, sample.hp)
  day.hpMax = day.hpMax === null ? sample.hp : Math.max(day.hpMax, sample.hp)
  day.envCount += 1
  day.envSum += sample.env
  day.envMin = day.envMin === null ? sample.env : Math.min(day.envMin, sample.env)
  day.envMax = day.envMax === null ? sample.env : Math.max(day.envMax, sample.env)

  if (Array.isArray(day.samples)) {
    day.samples.push(sample)
    if (day.samples.length > DAY_SAMPLE_LIMIT) {
      day.samples = day.samples.slice(-DAY_SAMPLE_LIMIT)
    }
  }
}

function normalizeStoredDay(raw) {
  const day = newDayRecord()
  if (!raw || typeof raw !== 'object') return day
  day.seconds = Number(raw.seconds) || 0
  day.hpCount = Number(raw.hpCount) || 0
  day.hpSum = Number(raw.hpSum) || 0
  day.hpMin = raw.hpMin === null || raw.hpMin === undefined ? null : Number(raw.hpMin)
  day.hpMax = raw.hpMax === null || raw.hpMax === undefined ? null : Number(raw.hpMax)
  day.envCount = Number(raw.envCount) || 0
  day.envSum = Number(raw.envSum) || 0
  day.envMin = raw.envMin === null || raw.envMin === undefined ? null : Number(raw.envMin)
  day.envMax = raw.envMax === null || raw.envMax === undefined ? null : Number(raw.envMax)
  day.samples = Array.isArray(raw.samples)
    ? raw.samples.filter(s => s && Number.isFinite(Number(s.t)))
    : []
  return day
}

function loadState() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'object' && stored.days) {
      const days = {}
      Object.keys(stored.days).forEach(key => {
        days[key] = normalizeStoredDay(stored.days[key])
      })
      return {
        days,
        lastHp: clampDb(Number(stored.lastHp) || HP_BASE_DB),
        lastEnv: clampDb(Number(stored.lastEnv) || 48)
      }
    }
  } catch (e) {
    // 读不到就用空状态
  }
  return { days: {}, lastHp: HP_BASE_DB, lastEnv: 48 }
}

// 落盘前裁剪：过期日期去掉明细、超出总天数限制的整条丢弃
function saveState(state) {
  const cutoffKey = dateKeyOffset(-LOCAL_SAMPLE_DAYS)
  const keys = Object.keys(state.days).sort()
  while (keys.length > LOCAL_DAY_LIMIT) {
    delete state.days[keys.shift()]
  }
  keys.forEach(key => {
    if (key < cutoffKey) {
      delete state.days[key].samples
    }
  })
  try {
    wx.setStorageSync(STORAGE_KEY, {
      days: state.days,
      lastHp: state.lastHp,
      lastEnv: state.lastEnv
    })
  } catch (e) {
    // 存储失败时仅保留内存态
  }
}

function loadPending() {
  try {
    const stored = wx.getStorageSync(PENDING_KEY)
    if (stored && typeof stored === 'object') {
      return {
        pending: normalizeBucket(stored),
        inFlight: normalizeBucket(stored.inFlight)
      }
    }
  } catch (e) {
    // 同上
  }
  return { pending: emptyBucket(), inFlight: emptyBucket() }
}

function savePending() {
  try {
    const stored = {
      dateKey: pending.dateKey,
      seconds: pending.seconds,
      samples: pending.samples
    }
    if (hasBucketData(inFlightBucket)) {
      stored.inFlight = inFlightBucket
    }
    wx.setStorageSync(PENDING_KEY, stored)
  } catch (e) {
    // 忽略写入失败
  }
}

function clampDb(value) {
  return Math.min(120, Math.max(20, Math.round(value)))
}

// Mock/demo 采样：仅维持旧统计页图表结构，不代表真实耳机或环境音量测量。
function nextSample(now) {
  lastHp = clampDb(lastHp + (Math.random() * 2 - 1) * HP_STEP_DB)
  lastEnv = clampDb(lastHp - ENV_GAP_MIN_DB - Math.random() * (ENV_GAP_MAX_DB - ENV_GAP_MIN_DB))
  return { t: now, hp: lastHp, env: lastEnv }
}

// 结算自上次心跳以来的前台秒数到待同步缓冲；跨天时先把旧一天的缓冲刷掉
function accumulate(now) {
  const delta = Math.min(Math.max(now - lastTickAt, 0), MAX_TICK_MS)
  lastTickAt = now
  if (!delta) return

  const todayKey = dateKeyOf(new Date(now))
  if (pending.dateKey && pending.dateKey !== todayKey) {
    flushPending()
  }
  pending.dateKey = todayKey
  pending.seconds += Math.round(delta / 1000)
}

// 同一时刻只允许一个增量上报。快照在云端明确成功前一直保存在 inFlight，
// 失败后由下一同步周期原样重试。
// saveUsage 目前没有 requestId/eventId；若服务端成功但响应丢失，重试仍可能重复累加。
// 严格 exactly-once 需要未来由接口增加幂等标识，本轮不改变数据库结构。
function flushPending() {
  if (flushPromise) {
    flushRequested = true
    return flushPromise
  }

  if (!hasBucketData(inFlightBucket)) {
    if (!hasBucketData(pending)) return Promise.resolve()
    inFlightBucket = pending
    pending = emptyBucket()
    savePending()
  }

  const bucket = inFlightBucket
  flushPromise = callUser('saveUsage', {
    dateKey: bucket.dateKey,
    addSeconds: bucket.seconds,
    samples: bucket.samples
  })
    .then(result => {
      const state = loadState()
      const day = state.days[bucket.dateKey] || newDayRecord()
      const serverSeconds = Number(result && result.seconds)
      day.seconds = Number.isFinite(serverSeconds)
        ? serverSeconds
        : day.seconds + bucket.seconds
      bucket.samples.forEach(sample => applySampleToDay(day, sample))
      state.days[bucket.dateKey] = day
      state.lastHp = lastHp
      state.lastEnv = lastEnv
      saveState(state)

      inFlightBucket = null
      savePending()
      return result
    })
    .catch(error => {
      // inFlight 继续落在 hearHealthUsagePending，下一周期会重试同一增量。
      savePending()
      console.error('[usage-tracker] saveUsage failed', {
        dateKey: bucket.dateKey,
        addSeconds: bucket.seconds,
        error
      })
      return null
    })
    .finally(() => {
      flushPromise = null
      if (flushRequested) {
        flushRequested = false
        flushPending()
      }
    })

  return flushPromise
}

function onSamplerTick() {
  const now = Date.now()
  accumulate(now)
  pending.samples.push(nextSample(now))
  savePending()

  // 周期性上报，进程意外被杀时最多丢一个同步周期的数据
  if (now - lastSyncAt >= SYNC_INTERVAL_MS) {
    lastSyncAt = now
    flushPending()
  }
}

// App onShow：恢复上次未同步完的缓冲并开始计时
function onAppShow() {
  if (active) return
  active = true

  const restored = loadPending()
  pending = restored.pending
  inFlightBucket = hasBucketData(restored.inFlight) ? restored.inFlight : null
  const state = loadState()
  lastHp = state.lastHp
  lastEnv = state.lastEnv

  lastTickAt = Date.now()
  lastSyncAt = Date.now()
  if (samplerTimer) clearInterval(samplerTimer)
  samplerTimer = setInterval(onSamplerTick, SAMPLE_INTERVAL_MS)
}

// App onHide：结算剩余时长、停表并把缓冲落地上报
function onAppHide() {
  if (!active) return
  active = false

  accumulate(Date.now())
  if (samplerTimer) {
    clearInterval(samplerTimer)
    samplerTimer = null
  }
  flushPending()
}

// 输出给页面的某天视图（聚合字段平铺，samples 可能已被裁剪为空）
function toDayView(dateKey, day) {
  return {
    dateKey,
    seconds: day.seconds,
    samples: Array.isArray(day.samples) ? day.samples : [],
    hpCount: day.hpCount,
    hpSum: day.hpSum,
    hpMin: day.hpMin,
    hpMax: day.hpMax,
    envCount: day.envCount,
    envSum: day.envSum,
    envMin: day.envMin,
    envMax: day.envMax
  }
}

// 将尚未得到云端确认的增量叠加到只读视图，不写回已确认的本地镜像。
function overlayBucket(days, bucket, fromDate, toDate) {
  if (!hasBucketData(bucket) || bucket.dateKey < fromDate || bucket.dateKey > toDate) return
  const day = days[bucket.dateKey] || newDayRecord()
  day.seconds += bucket.seconds
  bucket.samples.forEach(sample => applySampleToDay(day, sample))
  days[bucket.dateKey] = day
}

// 读取本地区间内的按天记录（升序）：云端已确认镜像 + 本地未同步增量。
function getDays(fromDate, toDate) {
  const state = loadState()
  const days = {}
  Object.keys(state.days).forEach(key => {
    days[key] = normalizeStoredDay(state.days[key])
  })
  overlayBucket(days, inFlightBucket, fromDate, toDate)
  overlayBucket(days, pending, fromDate, toDate)

  return Object.keys(days)
    .sort()
    .filter(key => key >= fromDate && key <= toDate)
    .map(key => toDayView(key, days[key]))
}

// 云端拉取区间记录并覆盖本地的“已确认镜像”；getDays 再叠加未同步增量。
// 若已有 flush，先等它完成，避免 listUsage 与增量确认交错造成瞬时重复显示。
function refreshRange(fromDate, toDate) {
  const waitForFlush = flushPromise
    ? flushPromise.catch(() => null)
    : Promise.resolve()

  return waitForFlush
    .then(() => callUser('listUsage', { fromDate, toDate }))
    .then(records => {
      const list = Array.isArray(records) ? records : []
      const state = loadState()

      list.forEach(record => {
        if (!record || !record.dateKey) return
        const day = normalizeStoredDay({
          ...record,
          samples: (record.samples || []).slice(-DAY_SAMPLE_LIMIT)
        })
        state.days[record.dateKey] = day
      })

      state.lastHp = lastHp
      state.lastEnv = lastEnv
      saveState(state)
      return getDays(fromDate, toDate)
    })
    .catch(error => {
      console.error('[usage-tracker] listUsage failed', {
        fromDate,
        toDate,
        error
      })
      return getDays(fromDate, toDate)
    })
}

module.exports = {
  SAMPLE_INTERVAL_MS,
  SYNC_INTERVAL_MS,
  dateKeyOf,
  dateKeyOffset,
  getDays,
  refreshRange,
  onAppShow,
  onAppHide
}
