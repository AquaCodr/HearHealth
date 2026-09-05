// 开发用种子数据生成器（演示环境专用，数据生成后可删除本云函数）
// 为 users 集合中的账号生成过去 N 天的演示数据：
//  - usage_records：每天一条（_id = openid_dateKey），含前台用耳秒数、
//    每 30s 一条的耳机/环境音量采样（均值回归随机游走，与 utils/usage-tracker.js
//    的采样规则一致）以及 hp/env 聚合字段
//  - test_records：若干条听力自测记录（带 seeded: true 标记，重跑前先清理旧种子）
//  - users.usageSeconds / testCount：按生成后的全部记录重算，保证与明细一致
// 幂等性：随机数由 openid+dateKey 确定性生成，重复运行覆盖写入相同数据；
//         默认不写“今天”，避免与前台追踪器的增量上报互相叠加。
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const DAY_MS = 24 * 3600 * 1000
const SAMPLE_SECONDS = 30       // 前台每 30s 产生一条采样，与 usage-tracker 一致
const DAY_SAMPLE_LIMIT = 300    // 单日采样明细上限，与服务端裁剪规则一致
const DEFAULT_DAYS = 30
const MAX_DAYS = 60
const MAX_USERS = 100           // 单次最多处理的用户数，防止超时
const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000]
const RELATIVE_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
const MAX_TEST_TONE_GAIN = 0.02

// ---------- 基础工具 ----------

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function clampDb(value) {
  return Math.min(120, Math.max(20, Math.round(value)))
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) {
    // 集合已存在
  }
}

// ---------- 确定性随机（同一次生成、重复运行结果一致） ----------

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 用户画像：由 openid 确定，三类典型护耳习惯 ----------

function personaOf(openid) {
  const rng = mulberry32(hashSeed(`persona:${openid}`))
  const kind = rng()
  if (kind < 0.34) {
    // 护耳型：音量低、用得少，测听阈值接近优秀
    return { hpBase: 55, hpJitter: 6, minutesBase: 40, skipProb: 0.16, testBase: 22, notch: 0 }
  }
  if (kind < 0.82) {
    // 普通型
    return { hpBase: 64, hpJitter: 9, minutesBase: 100, skipProb: 0.1, testBase: 30, notch: 6 }
  }
  // 高风险型：音量偏大、用耳偏长，4000Hz 有噪音性听损切迹
  return { hpBase: 74, hpJitter: 11, minutesBase: 170, skipProb: 0.06, testBase: 38, notch: 14 }
}

// ---------- 用量记录：模拟一天内的 1~3 段聆听会话 ----------

function generateDayRecord(openid, date, persona, rng, now) {
  if (rng() < persona.skipProb) return null // 偶尔完全休息，日历显示暂无数据

  const weekday = date.getDay()
  const weekend = weekday === 0 || weekday === 6
  const baseMinutes = persona.minutesBase * (0.55 + rng() * 1.1) * (weekend ? 1.25 : 1)
  const totalSeconds = Math.max(600, Math.min(6 * 3600, Math.round(baseMinutes * 60)))

  // 会话窗口：早高峰通勤 / 午休 / 晚间，按总时长拆段
  const sessionCount = totalSeconds < 2400 ? 1 : totalSeconds < 9000 ? 2 : 3
  const windows = [
    { start: 7.5 + rng() * 0.5, span: 2 },
    { start: 12 + rng() * 0.5, span: 1.5 },
    { start: 19 + rng() * 2, span: 4.5 }
  ]
  const weights = []
  for (let i = 0; i < sessionCount; i += 1) {
    weights.push(i === 2 ? 1.4 + rng() * 0.8 : 0.5 + rng() * 0.5)
  }
  const weightSum = weights.reduce((sum, w) => sum + w, 0)

  const sessions = []
  for (let i = 0; i < sessionCount; i += 1) {
    const duration = Math.max(180, Math.round(totalSeconds * weights[i] / weightSum))
    const durHours = duration / 3600
    const window = windows[i]
    const startHour = window.start + Math.max(0, rng() * (window.span - durHours))
    const start = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Math.floor(startHour),
      Math.round((startHour % 1) * 60)
    )
    sessions.push({ startAt: start.getTime(), duration })
  }

  // 采样：总量受单日上限约束，按会话时长比例分布，段内等间隔
  const totalSamples = Math.min(DAY_SAMPLE_LIMIT, Math.round(totalSeconds / SAMPLE_SECONDS))
  const samples = []
  const agg = {
    hpCount: 0, hpSum: 0, hpMin: null, hpMax: null,
    envCount: 0, envSum: 0, envMin: null, envMax: null
  }

  sessions.forEach(session => {
    const count = Math.max(1, Math.round(totalSamples * session.duration / totalSeconds))
    const strideMs = (session.duration / count) * 1000
    // 每段开始时音量回到该用户基准附近，段内做均值回归随机游走
    let hp = persona.hpBase + (rng() * 2 - 1) * persona.hpJitter
    for (let i = 0; i < count; i += 1) {
      hp = clampDb(hp + (rng() * 2 - 1) * 5 + (persona.hpBase - hp) * 0.12)
      const env = clampDb(hp - 4 - rng() * 10)
      samples.push({ t: Math.round(session.startAt + i * strideMs), hp, env })

      agg.hpCount += 1
      agg.hpSum += hp
      agg.hpMin = agg.hpMin === null ? hp : Math.min(agg.hpMin, hp)
      agg.hpMax = agg.hpMax === null ? hp : Math.max(agg.hpMax, hp)
      agg.envCount += 1
      agg.envSum += env
      agg.envMin = agg.envMin === null ? env : Math.min(agg.envMin, env)
      agg.envMax = agg.envMax === null ? env : Math.max(agg.envMax, env)
    }
  })

  samples.sort((a, b) => a.t - b.t)

  return {
    _id: `${openid}_${dateKeyOf(date)}`,
    openid,
    dateKey: dateKeyOf(date),
    seconds: totalSeconds,
    ...agg,
    samples: samples.slice(0, DAY_SAMPLE_LIMIT),
    createdAt: now,
    updatedAt: now
  }
}

// ---------- 听力自测记录：铺满整月，阈值随时间轻微改善 ----------

function clampLevel(value) {
  return Math.min(90, Math.max(10, Math.round(value / 10) * 10))
}

function buildEarResults(persona, shift, notchNow, rng, completedMs) {
  return FREQUENCIES.map((frequency, index) => {
    // 高频段（2000/4000Hz）对噪音暴露更敏感，4000Hz 是噪音性听损切迹
    const freqShift = frequency >= 4000 ? notchNow : frequency >= 2000 ? notchNow / 2 : 0
    const detected = rng() > 0.06
    const answeredAt = completedMs - (12 - index) * 25 * 1000
    if (!detected) {
      return {
        frequency,
        detected: false,
        thresholdPercent: null,
        maxTestedPercent: 100,
        attempts: 10,
        answeredAt
      }
    }
    const level = clampLevel(persona.testBase + shift + freqShift + (rng() * 12 - 5))
    return {
      frequency,
      detected: true,
      thresholdPercent: level,
      maxTestedPercent: level,
      attempts: level / 10,
      answeredAt
    }
  })
}

function generateTestRecords(openid, days, persona, rng, today) {
  const count = 3 + Math.floor(rng() * 4) // 3~6 条
  const records = []
  let prevOffset = days + 1

  for (let i = 0; i < count; i += 1) {
    const progress = count === 1 ? 1 : i / (count - 1)
    // 从整月前铺到 1~2 天前，保证逐条递减不重复
    let offset = Math.round(days * (1 - progress) - rng() * 1.5)
    offset = Math.min(prevOffset - 1, Math.max(1, offset))
    prevOffset = offset

    const hour = 9 + rng() * 13
    const completedMs = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offset,
      Math.floor(hour),
      Math.round((hour % 1) * 60)
    ).getTime()

    // 演示叙事：坚持护耳一个月，整体阈值与高频切迹随时间小幅改善
    const shift = -Math.round(progress * 5)
    const notchNow = Math.round(persona.notch * (1 - progress * 0.3))

    const left = buildEarResults(persona, shift, notchNow, rng, completedMs)
    const right = buildEarResults(persona, shift + (rng() * 4 - 2), notchNow, rng, completedMs)

    records.push({
      openid,
      version: 1,
      measurement: 'relative-gain-threshold',
      completedAt: new Date(completedMs),
      relativeLevels: RELATIVE_LEVELS.slice(),
      maxTestToneGain: MAX_TEST_TONE_GAIN,
      ears: { left, right },
      detectedLeft: left.filter(item => item.detected).length,
      detectedRight: right.filter(item => item.detected).length,
      createTime: new Date(completedMs),
      seeded: true
    })
  }

  return records
}

// ---------- 汇总重算：users 上的累计字段与明细保持一致 ----------

async function recomputeAggregates(openid) {
  let usageSeconds = 0
  let skip = 0
  // usage_records 每用户每天一条，分页取 seconds 求和
  for (;;) {
    const res = await db.collection('usage_records')
      .where({ openid })
      .skip(skip)
      .limit(100)
      .field({ seconds: true })
      .get()
    usageSeconds += res.data.reduce((sum, doc) => sum + (doc.seconds || 0), 0)
    if (res.data.length < 100) break
    skip += 100
  }

  const countRes = await db.collection('test_records').where({ openid }).count()
  return { usageSeconds, testCount: countRes.total }
}

// ---------- 单用户播种 ----------

async function seedUser(user, options) {
  const openid = user.openid
  const persona = personaOf(openid)
  const now = new Date()
  const today = options.today
  const usage = db.collection('usage_records')

  // 1. 用量记录：从 N 天前写到昨天（默认跳过今天，避免与真实增量上报叠加）
  const docs = []
  const startBack = options.includeToday ? 0 : 1
  for (let back = options.days; back >= startBack; back -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
    const rng = mulberry32(hashSeed(`${openid}:${dateKeyOf(date)}`))
    const doc = generateDayRecord(openid, date, persona, rng, now)
    if (doc) docs.push(doc)
  }

  // preserveExistingDays=true 时只补缺失的日期，不覆盖已有真实记录
  const toWrite = []
  for (const doc of docs) {
    if (options.preserveExistingDays) {
      const exists = await usage.doc(doc._id).get()
        .then(res => Boolean(res.data))
        .catch(() => false)
      if (exists) continue
    }
    toWrite.push(doc)
  }

  // 分批覆盖写入（doc(id).set：存在则整体替换，不存在则创建）
  for (let i = 0; i < toWrite.length; i += 10) {
    await Promise.all(
      toWrite.slice(i, i + 10).map(doc => usage.doc(doc._id).set({ data: doc }))
    )
  }

  // 2. 听力自测记录：先清掉旧种子再插入本次生成的
  await db.collection('test_records').where({ openid, seeded: true }).remove()
  const tests = generateTestRecords(openid, options.days, persona, mulberry32(hashSeed(`tests:${openid}`)), today)
  await Promise.all(
    tests.map(record => db.collection('test_records').add({ data: record }))
  )

  // 3. 重算用户累计字段
  const aggregates = await recomputeAggregates(openid)
  await db.collection('users').doc(user._id).update({
    data: { usageSeconds: aggregates.usageSeconds, testCount: aggregates.testCount }
  }).catch(() => {})

  return {
    openid,
    nickname: user.nickname || '',
    daysSeeded: toWrite.length,
    daysBlank: docs.length - toWrite.length + (options.days + 1 - startBack - docs.length),
    testsSeeded: tests.length,
    usageSeconds: aggregates.usageSeconds,
    testCount: aggregates.testCount
  }
}

// ---------- 入口 ----------

exports.main = async (event) => {
  const input = event || {}
  const days = Math.min(MAX_DAYS, Math.max(1, Number(input.days) || DEFAULT_DAYS))
  const includeToday = Boolean(input.includeToday)
  const preserveExistingDays = Boolean(input.preserveExistingDays)
  const onlyOpenids = Array.isArray(input.openids)
    ? input.openids.filter(item => typeof item === 'string')
    : null

  await ensureCollection('users')
  await ensureCollection('usage_records')
  await ensureCollection('test_records')

  // 分页取全部用户（上限 MAX_USERS，防止超时；账号多时可传 openids 分批跑）
  const users = []
  for (let skip = 0; skip < MAX_USERS; skip += 100) {
    const res = await db.collection('users').skip(skip).limit(100).get()
    users.push(...res.data.filter(item => item.openid))
    if (res.data.length < 100) break
  }

  const targets = onlyOpenids
    ? users.filter(item => onlyOpenids.includes(item.openid))
    : users

  const options = { days, includeToday, preserveExistingDays, today: new Date() }
  const results = []
  // 逐个用户处理（单用户内部已并发），整体控制在云函数时限内
  for (const user of targets) {
    results.push(await seedUser(user, options))
  }

  return {
    success: true,
    data: {
      userCount: targets.length,
      days,
      includeToday,
      results
    }
  }
}
