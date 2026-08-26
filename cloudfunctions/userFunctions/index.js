const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 与 miniprogram/utils/user-profile.js、app-settings.js 保持一致的字段规则
const MAX_NICKNAME_LENGTH = 20
const MAX_BIO_LENGTH = 40
const MAX_DEVICE_MODEL_LENGTH = 40
const MAX_AVATAR_LENGTH = 500
const DEFAULT_NICKNAME = '耳朵守护者'
const DEFAULT_BIO = '关注听力健康，从每天开始'
const DEFAULT_SETTINGS = {
  reminderThreshold: 2,
  healthReminder: true,
  testReminder: true,
  communityMessage: true
}
const REMINDER_THRESHOLDS = [1, 2, 3, 4]
// 测试记录保留上限：超出后按 completedAt 清理最旧的，控制单用户存储规模
const TEST_RECORD_LIMIT = 100
// 用量记录（每用户每天一条，dateKey = YYYY-MM-DD）：前台用耳秒数 + 定期音量采样
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_SECONDS_PER_DAY = 86400
// 单日保留的采样明细上限（30s 一个采样约对应 2.5 小时明细），超出的旧采样被裁掉，
// 但由采样汇总出的 min/max/avg 聚合字段始终完整，长周期图表不受影响
const USAGE_SAMPLE_LIMIT = 300
const DB_VALUE_FLOOR = 20
const DB_VALUE_CEIL = 120

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) {
    // 集合已存在
  }
}

function isValidDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value)
}

function clampDb(value) {
  return Math.min(DB_VALUE_CEIL, Math.max(DB_VALUE_FLOOR, Math.round(Number(value))))
}

// 采样规范化：仅保留 t/hp/env 三个数值字段，按时间排序并裁剪到上限
function normalizeUsageSamples(input) {
  if (!Array.isArray(input)) return []
  const samples = input
    .filter(s => s && Number.isFinite(Number(s.t)) && Number.isFinite(Number(s.hp)) && Number.isFinite(Number(s.env)))
    .map(s => ({ t: Math.round(Number(s.t)), hp: clampDb(s.hp), env: clampDb(s.env) }))
    .sort((a, b) => a.t - b.t)
  return samples.slice(-USAGE_SAMPLE_LIMIT)
}

// 由采样明细汇总出音量聚合（供周/月/年等长周期图表使用，不依赖被裁剪的明细）
function summarizeSamples(samples) {
  const summary = {
    hpCount: 0, hpSum: 0, hpMin: null, hpMax: null,
    envCount: 0, envSum: 0, envMin: null, envMax: null
  }
  samples.forEach(s => {
    summary.hpCount += 1
    summary.hpSum += s.hp
    summary.hpMin = summary.hpMin === null ? s.hp : Math.min(summary.hpMin, s.hp)
    summary.hpMax = summary.hpMax === null ? s.hp : Math.max(summary.hpMax, s.hp)
    summary.envCount += 1
    summary.envSum += s.env
    summary.envMin = summary.envMin === null ? s.env : Math.min(summary.envMin, s.env)
    summary.envMax = summary.envMax === null ? s.env : Math.max(summary.envMax, s.env)
  })
  return summary
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

// 资料规范化：空值回落到默认，长度截断与前端校验对齐
function normalizeProfile(input) {
  const source = input && typeof input === 'object' ? input : {}
  const nickname = normalizeText(source.nickname, MAX_NICKNAME_LENGTH) || DEFAULT_NICKNAME
  const avatar = normalizeText(source.avatar, MAX_AVATAR_LENGTH)
  const bio = normalizeText(source.bio, MAX_BIO_LENGTH) || DEFAULT_BIO
  const deviceModel = normalizeText(source.deviceModel, MAX_DEVICE_MODEL_LENGTH)
  return { nickname, avatar, bio, deviceModel }
}

function normalizeSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  const reminderThreshold = Number(source.reminderThreshold)
  const pickBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

  return {
    reminderThreshold: REMINDER_THRESHOLDS.includes(reminderThreshold)
      ? reminderThreshold
      : DEFAULT_SETTINGS.reminderThreshold,
    healthReminder: pickBool(source.healthReminder, DEFAULT_SETTINGS.healthReminder),
    testReminder: pickBool(source.testReminder, DEFAULT_SETTINGS.testReminder),
    communityMessage: pickBool(source.communityMessage, DEFAULT_SETTINGS.communityMessage)
  }
}

// 对外输出的用户视图（不含 _id 等内部字段）
function toUserView(doc) {
  if (!doc) return null
  return {
    openid: doc.openid || '',
    nickname: doc.nickname || DEFAULT_NICKNAME,
    avatar: doc.avatar || '',
    bio: doc.bio || DEFAULT_BIO,
    deviceModel: doc.deviceModel || '',
    profileUpdatedAt: doc.profileUpdatedAt || 0,
    settings: normalizeSettings(doc.settings),
    testCount: doc.testCount || 0,
    usageSeconds: doc.usageSeconds || 0,
    createdAt: doc.createdAt || null,
    lastLoginAt: doc.lastLoginAt || null
  }
}

async function getUserDoc(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  return res.data[0] || null
}

// 集合刚由 createCollection 创建时立即查询可能瞬时失败（创建是异步生效的），
// 首次登录正好命中这个窗口，等待后重试一次
async function getUserDocWithRetry(openid) {
  try {
    return await getUserDoc(openid)
  } catch (e) {
    await new Promise(resolve => setTimeout(resolve, 300))
    return getUserDoc(openid)
  }
}

// 新用户兜底建档（直接调 updateProfile / updateSettings 但 users 里还没有记录时）
async function createUser(openid, profile, settings) {
  const now = new Date()
  const userData = {
    openid,
    ...normalizeProfile(profile),
    profileUpdatedAt: now.getTime(),
    settings: normalizeSettings(settings),
    testCount: 0,
    usageSeconds: 0,
    createdAt: now,
    lastLoginAt: now
  }
  const addRes = await db.collection('users').add({ data: userData })
  return { _id: addRes._id, ...userData }
}

// 登录：按 OPENID 幂等创建用户；资料按 updatedAt 新者胜合并，设置以云端为准（首次用本地播种）
async function login(event) {
  await ensureCollection('users')
  await ensureCollection('test_records')
  await ensureCollection('user_favorites')
  await ensureCollection('usage_records')

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const clientProfileInput = event.profile || {}
  const clientSettingsInput = event.settings || {}

  let doc = await getUserDocWithRetry(OPENID)
  const now = new Date()

  if (!doc) {
    // 新用户：优先采用本地已有资料（老用户升级场景），否则走默认值
    const profile = normalizeProfile(clientProfileInput)
    const userData = {
      openid: OPENID,
      ...profile,
      profileUpdatedAt: Number(clientProfileInput.updatedAt) || now.getTime(),
      settings: normalizeSettings(clientSettingsInput),
      testCount: 0,
      usageSeconds: 0,
      createdAt: now,
      lastLoginAt: now
    }
    const addRes = await db.collection('users').add({ data: userData })
    doc = { _id: addRes._id, ...userData }
    return { success: true, data: { user: toUserView(doc), profileSource: 'client', created: true } }
  }

  // 老用户：更新登录时间；客户端资料更新时才覆盖
  const updateData = { lastLoginAt: now }
  let profileSource = 'server'
  const clientUpdatedAt = Number(clientProfileInput.updatedAt) || 0
  if (clientUpdatedAt > (doc.profileUpdatedAt || 0)) {
    Object.assign(updateData, normalizeProfile(clientProfileInput), { profileUpdatedAt: clientUpdatedAt })
    profileSource = 'client'
  } else if (!doc.profileUpdatedAt && Object.keys(clientProfileInput).length) {
    // 兼容无时间戳的旧文档：有本地资料就采纳一次并补时间戳
    Object.assign(updateData, normalizeProfile(clientProfileInput), { profileUpdatedAt: now.getTime() })
    profileSource = 'client'
  }
  await db.collection('users').doc(doc._id).update({ data: updateData })

  doc = { ...doc, ...updateData }
  return { success: true, data: { user: toUserView(doc), profileSource, created: false } }
}

// 更新资料（头像/昵称/签名/耳机型号）
async function updateProfile(event) {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const profile = normalizeProfile(event.profile || {})
  const profileUpdatedAt = Number(event.profile && event.profile.updatedAt) || Date.now()
  const doc = await getUserDoc(OPENID)
  if (!doc) {
    doc = await createUser(OPENID, profile, {})
    return { success: true, data: { user: toUserView(doc) } }
  }

  const updateData = { ...profile, profileUpdatedAt }
  await db.collection('users').doc(doc._id).update({ data: updateData })
  return { success: true, data: { user: toUserView({ ...doc, ...updateData }) } }
}

// 更新设置（嵌入 users 文档）
async function updateSettings(event) {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const settings = normalizeSettings(event.settings || {})
  const doc = await getUserDoc(OPENID)
  if (!doc) {
    doc = await createUser(OPENID, {}, settings)
    return { success: true, data: { user: toUserView(doc) } }
  }

  await db.collection('users').doc(doc._id).update({ data: { settings } })
  return { success: true, data: { user: toUserView({ ...doc, settings }) } }
}

// 统计单耳测得频点数
function countDetected(records) {
  return Array.isArray(records)
    ? records.filter(r => r && r.detected && Number.isFinite(r.thresholdPercent)).length
    : 0
}

// 保存一次听力测试结果（每次测试一条记录）
async function saveTestRecord(event) {
  await ensureCollection('test_records')
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const result = event.result || {}
  if (result.measurement !== 'relative-gain-threshold' || !result.ears) {
    return { success: false, errMsg: 'invalid test result' }
  }

  const completedMs = Number(result.completedAt) || Date.now()
  const record = {
    openid: OPENID,
    version: Number(result.version) || 1,
    measurement: result.measurement,
    completedAt: new Date(completedMs),
    relativeLevels: Array.isArray(result.relativeLevels) ? result.relativeLevels : [],
    maxTestToneGain: Number(result.maxTestToneGain) || 0,
    ears: {
      left: Array.isArray(result.ears.left) ? result.ears.left.slice(0, 6) : [],
      right: Array.isArray(result.ears.right) ? result.ears.right.slice(0, 6) : []
    },
    detectedLeft: countDetected(result.ears.left),
    detectedRight: countDetected(result.ears.right),
    createTime: new Date()
  }

  const addRes = await db.collection('test_records').add({ data: record })

  // 同步用户身上的测试次数计数
  const doc = await getUserDoc(OPENID)
  if (doc) {
    await db.collection('users').doc(doc._id).update({
      data: { testCount: _.inc(1) }
    }).catch(() => {})
  }

  // 超出保留上限时清理最旧记录
  try {
    const countRes = await db.collection('test_records').where({ openid: OPENID }).count()
    if (countRes.total > TEST_RECORD_LIMIT) {
      const stale = await db.collection('test_records')
        .where({ openid: OPENID })
        .orderBy('completedAt', 'asc')
        .limit(countRes.total - TEST_RECORD_LIMIT)
        .get()
      await Promise.all(stale.data.map(r =>
        db.collection('test_records').doc(r._id).remove().catch(() => {})
      ))
    }
  } catch (e) {
    // 清理失败不影响保存结果
  }

  return { success: true, data: { _id: addRes._id, detectedLeft: record.detectedLeft, detectedRight: record.detectedRight } }
}

// 最新一条测试记录（report 页在本地无数据时兜底拉取）
async function getLatestTestRecord() {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: true, data: null }

  const res = await db.collection('test_records')
    .where({ openid: OPENID })
    .orderBy('completedAt', 'desc')
    .limit(1)
    .get()

  if (!res.data.length) return { success: true, data: null }
  const r = res.data[0]
  // 还原成与本地 latestHearingTestResult 相同的结构，复用 report 页渲染逻辑
  return {
    success: true,
    data: {
      version: r.version,
      measurement: r.measurement,
      completedAt: r.completedAt ? new Date(r.completedAt).getTime() : Date.now(),
      relativeLevels: r.relativeLevels || [],
      maxTestToneGain: r.maxTestToneGain,
      ears: r.ears || { left: [], right: [] }
    }
  }
}

// 测试记录列表（轻量字段，供统计/历史使用）
async function listTestRecords(event) {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: true, data: [] }

  const limit = Math.min(Number(event.limit) || 20, 50)
  const res = await db.collection('test_records')
    .where({ openid: OPENID })
    .orderBy('completedAt', 'desc')
    .limit(limit)
    .field({ openid: false })
    .get()
  return { success: true, data: res.data }
}

// 收藏：先查后插，避免重复
async function addFavorite(event) {
  await ensureCollection('user_favorites')
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const skillId = normalizeText(event.skillId, 64)
  if (!skillId) return { success: false, errMsg: 'invalid skillId' }

  const exists = await db.collection('user_favorites')
    .where({ openid: OPENID, skillId })
    .count()
  if (exists.total > 0) return { success: true, data: { duplicated: true } }

  const res = await db.collection('user_favorites').add({
    data: { openid: OPENID, skillId, createTime: new Date() }
  })
  return { success: true, data: { _id: res._id } }
}

async function removeFavorite(event) {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const skillId = normalizeText(event.skillId, 64)
  if (!skillId) return { success: false, errMsg: 'invalid skillId' }

  await db.collection('user_favorites').where({ openid: OPENID, skillId }).remove()
  return { success: true }
}

async function listFavorites() {
  await ensureCollection('user_favorites')
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: true, data: [] }

  const res = await db.collection('user_favorites')
    .where({ openid: OPENID })
    .limit(200)
    .get()
  return { success: true, data: res.data.map(f => f.skillId) }
}

// 追加一天的前台用量（秒数 + 音量采样）。文档 _id 用 `${openid}_${dateKey}` 确定性生成：
// 并发重复上报会落到同一条记录上做累加，而不是插出重复文档。
// 采样明细合并后重算聚合字段，保证长周期统计与被裁剪的明细解耦。
async function saveUsage(event) {
  await ensureCollection('usage_records')
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, errMsg: 'missing openid' }

  const dateKey = event.dateKey
  if (!isValidDateKey(dateKey)) return { success: false, errMsg: 'invalid dateKey' }

  const addSeconds = Math.min(
    MAX_SECONDS_PER_DAY,
    Math.max(0, Math.round(Number(event.addSeconds) || 0))
  )
  const newSamples = normalizeUsageSamples(event.samples)
  if (!addSeconds && !newSamples.length) {
    return { success: true, data: { dateKey, skipped: true } }
  }

  const collection = db.collection('usage_records')
  const docId = `${OPENID}_${dateKey}`
  let doc = null
  try {
    doc = (await collection.doc(docId).get()).data
  } catch (e) {
    doc = null
  }

  const mergedSamples = normalizeUsageSamples(((doc && doc.samples) || []).concat(newSamples))
  const seconds = ((doc && doc.seconds) || 0) + addSeconds
  const summary = summarizeSamples(mergedSamples)
  const now = new Date()

  if (!doc) {
    await collection.add({
      data: {
        _id: docId,
        openid: OPENID,
        dateKey,
        seconds,
        ...summary,
        samples: mergedSamples,
        createdAt: now,
        updatedAt: now
      }
    })
  } else {
    await collection.doc(docId).update({
      data: { seconds, ...summary, samples: mergedSamples, updatedAt: now }
    })
  }

  // 累计用耳挂在 users 上供“我的”页展示；失败不影响本次保存
  getUserDoc(OPENID)
    .then(d => d && db.collection('users').doc(d._id).update({
      data: { usageSeconds: _.inc(addSeconds) }
    }))
    .catch(() => {})

  return { success: true, data: { dateKey, seconds } }
}

// 按日期区间拉取用量记录（闭区间），统计页日历、首页周视图与音量详情页共用
async function listUsage(event) {
  await ensureCollection('usage_records')
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: true, data: [] }

  const fromDate = event.fromDate
  const toDate = event.toDate
  if (!isValidDateKey(fromDate) || !isValidDateKey(toDate) || fromDate > toDate) {
    return { success: true, data: [] }
  }

  const res = await db.collection('usage_records')
    .where({ openid: OPENID, dateKey: _.gte(fromDate).and(_.lte(toDate)) })
    .orderBy('dateKey', 'asc')
    .limit(400)
    .field({ openid: false })
    .get()
  return { success: true, data: res.data.map(r => ({ ...r, samples: r.samples || [] })) }
}

// 云函数入口：按 event.type 分发，统一返回 { success, data }
exports.main = async (event) => {
  try {
    switch (event.type) {
      case 'login':
        return await login(event)
      case 'updateProfile':
        return await updateProfile(event)
      case 'updateSettings':
        return await updateSettings(event)
      case 'saveTestRecord':
        return await saveTestRecord(event)
      case 'getLatestTestRecord':
        return await getLatestTestRecord()
      case 'listTestRecords':
        return await listTestRecords(event)
      case 'addFavorite':
        return await addFavorite(event)
      case 'removeFavorite':
        return await removeFavorite(event)
      case 'listFavorites':
        return await listFavorites()
      case 'saveUsage':
        return await saveUsage(event)
      case 'listUsage':
        return await listUsage(event)
      default:
        return { success: false, errMsg: `unknown type: ${event.type}` }
    }
  } catch (e) {
    return { success: false, errMsg: e.message || String(e) }
  }
}
