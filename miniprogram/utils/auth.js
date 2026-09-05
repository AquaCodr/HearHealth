// 微信静默登录与会话管理
// 登录原理：云开发环境下云函数通过 cloud.getWXContext() 直接拿到 OPENID，
// 无需 wx.login + code2Session；本模块负责调用 userFunctions 完成建档/合并，
// 并把云端档案同步回本地 storage（资料新者胜，设置以云端为准）。
const { getUserProfile, saveUserProfile } = require('./user-profile')
const { getSettings, saveSettings } = require('./app-settings')
const {
  SESSION_KEY,
  clearAccountData,
  clearLoggedOut,
  grantConsent,
  hasConsent,
  isLoggedOut,
  markLoggedOut,
  revokeConsent
} = require('./local-data')

const SESSION_STORAGE_KEY = SESSION_KEY

let sessionCache = null
let loginPromise = null
// 会话代号：每次退出登录自增。登录请求发出后用户可能已退出，
// 回到前台的响应不能把会话和云端数据重新写回本地（issue #35）
let sessionEpoch = 0

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

// 静默登录（幂等）：同一时刻只发一次请求；已登录时直接复用会话。
// 注意：这个接口只负责「同步/复用会话」，不代表用户同意建档，
// 因此新用户建档必须走 login()（用户点按钮 + 已勾选协议），不要在页面里直接调它（issue #36）。
function ensureLogin() {
  if (loginPromise) return loginPromise

  const epoch = sessionEpoch

  loginPromise = callUser('login', {
    profile: getUserProfile(),
    settings: getSettings()
  }).then(data => {
    // 登录请求在途期间若已退出登录，丢弃这次响应，避免把云端数据重新写回本地
    if (epoch !== sessionEpoch) return null

    const user = data && data.user
    if (!user) throw new Error('登录响应缺少用户信息')

    applyServerProfile(user)
    applyServerSettings(user.settings)
    clearLoggedOut()

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
        if (epoch !== sessionEpoch) return
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

// 用户主动登录（唯一允许建档的入口）：开屏页「微信一键登录」/「我的」页补登录。
// 前置条件是已勾选同意《用户协议》与《隐私政策》并落了授权记录，
// 这样云端建档一定是用户做了明确动作之后才发生（issue #36）。
function login() {
  if (!hasConsent()) {
    return Promise.reject(new Error('请先阅读并同意《用户协议》与《隐私政策》'))
  }
  return ensureLogin()
}

// 退出登录：清掉本地会话与账号数据，云端数据完整保留，重新登录会同步回来。
// 身份由微信 OPENID 决定，本地无法真正「注销微信登录」，
// 因此额外标记 loggedOut，让 app.js 与各页面不再自动把会话补回来（issue #35）。
// 授权记录一并撤销：下次登录需要重新勾选同意，避免「一次同意、永久有效」。
// 需要连云端数据一起删除时用设置页的「注销账号」。
function logout() {
  sessionEpoch += 1
  sessionCache = null
  loginPromise = null
  markLoggedOut()
  revokeConsent()
  clearAccountData()
}

module.exports = {
  SESSION_STORAGE_KEY,
  callUser,
  ensureLogin,
  getSession,
  grantConsent,
  hasConsent,
  isLoggedIn,
  isLoggedOut,
  login,
  logout,
  revokeConsent
}
