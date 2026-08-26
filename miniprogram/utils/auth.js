// 微信静默登录与会话管理
// 登录原理：云开发环境下云函数通过 cloud.getWXContext() 直接拿到 OPENID，
// 无需 wx.login + code2Session；本模块负责调用 userFunctions 完成建档/合并，
// 并把云端档案同步回本地 storage（资料新者胜，设置以云端为准）。
const { getUserProfile, saveUserProfile } = require('./user-profile')
const { getSettings, saveSettings } = require('./app-settings')

const SESSION_STORAGE_KEY = 'hearHealthSession'

let sessionCache = null
let loginPromise = null

function callUser(type, data = {}) {
  return wx.cloud.callFunction({
    name: 'userFunctions',
    data: { type, ...data }
  }).then(res => {
    const r = res.result || {}
    if (r.success === false) {
      throw new Error(r.errMsg || '请求失败')
    }
    return r.data
  })
}

function readStoredSession() {
  try {
    const stored = wx.getStorageSync(SESSION_STORAGE_KEY)
    return stored && stored.user ? stored : null
  } catch (e) {
    return null
  }
}

// 同步读取当前会话（可能为 null），不发起网络请求
function getSession() {
  if (sessionCache) return sessionCache
  sessionCache = readStoredSession()
  return sessionCache
}

function isLoggedIn() {
  const session = getSession()
  return Boolean(session && session.user && session.user.openid)
}

function storeSession(session) {
  sessionCache = session
  try {
    wx.setStorageSync(SESSION_STORAGE_KEY, session)
  } catch (e) {
    // 存储失败时仅保留内存态
  }
}

// 云端资料与本地不一致时，用云端覆盖本地（云端更新的场景）
function applyServerProfile(user) {
  if (!user) return
  const localProfile = getUserProfile()
  if ((user.profileUpdatedAt || 0) > (localProfile.updatedAt || 0)) {
    saveUserProfile({
      nickname: user.nickname,
      avatar: user.avatar || localProfile.avatar,
      bio: user.bio,
      deviceModel: user.deviceModel || ''
    })
  }
}

// 设置以云端为准：有会话且设置不同则回落到本地存储
function applyServerSettings(settings) {
  if (!settings) return
  const localSettings = getSettings()
  if (
    localSettings.reminderThreshold !== settings.reminderThreshold ||
    localSettings.healthReminder !== settings.healthReminder ||
    localSettings.testReminder !== settings.testReminder ||
    localSettings.communityMessage !== settings.communityMessage
  ) {
    saveSettings({ ...localSettings, ...settings })
  }
}

// 收藏合并（只增不删的并集收敛）：本地独有 → 补传云端；云端独有 → 落地本地。
// 不做删除传播：多端场景下“本地没有”无法区分“本机取消收藏”与“别端新收藏”，误删代价更高。
function mergeFavorites(localFavs, serverFavs) {
  const local = Array.isArray(localFavs) ? localFavs : []
  const server = Array.isArray(serverFavs) ? serverFavs : []

  local.forEach(id => {
    if (id && !server.includes(id)) {
      callUser('addFavorite', { skillId: id }).catch(() => {})
    }
  })

  const known = {}
  const merged = []
  local.concat(server).forEach(id => {
    if (id && !known[id]) {
      known[id] = true
      merged.push(id)
    }
  })

  try {
    wx.setStorageSync('skill_favs', merged)
  } catch (e) {
    // 忽略本地写入失败
  }
  return merged
}

// 静默登录（幂等）：同一时刻只发一次请求；已登录时直接复用会话
function ensureLogin() {
  if (loginPromise) return loginPromise

  loginPromise = callUser('login', {
    profile: getUserProfile(),
    settings: getSettings()
  }).then(data => {
    const user = data && data.user
    if (!user) throw new Error('登录响应缺少用户信息')

    applyServerProfile(user)
    applyServerSettings(user.settings)

    let localFavs = []
    try {
      localFavs = wx.getStorageSync('skill_favs') || []
    } catch (e) {
      localFavs = []
    }
    mergeFavorites(localFavs, [])
    // 云端收藏异步拉取后二次合并（补拉其他设备产生的收藏）
    callUser('listFavorites')
      .then(favs => {
        let latestLocal = []
        try {
          latestLocal = wx.getStorageSync('skill_favs') || []
        } catch (e) {
          latestLocal = []
        }
        mergeFavorites(latestLocal, favs)
      })
      .catch(() => {})

    const session = { user, loggedInAt: Date.now() }
    storeSession(session)
    loginPromise = null
    return session
  }).catch(error => {
    // 打印完整错误便于排查：云函数未部署、集合权限、服务端异常等都会在这里暴露
    console.error('[auth] 静默登录失败：', error)
    loginPromise = null
    throw error
  })

  return loginPromise
}

module.exports = {
  SESSION_STORAGE_KEY,
  callUser,
  ensureLogin,
  getSession,
  isLoggedIn
}
