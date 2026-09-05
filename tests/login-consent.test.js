// issue #36：登录定位从「自动静默登录」改为「用户明确授权后建档」。
// 这里锁定四件事：
// 1. 未勾选《用户协议》/《隐私政策》时不允许发起建档请求；
// 2. 游客进入「我的」不会被静默登录建档；
// 3. 游客阶段的用耳数据只留本机，登录后才补报；
// 4. 退出登录会一并撤销授权，下次登录需要重新确认。
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const projectRoot = path.resolve(__dirname, '..')

const localData = require('../miniprogram/utils/local-data')
const auth = require('../miniprogram/utils/auth')
const usageTracker = require('../miniprogram/utils/usage-tracker')

const { CONSENT_KEY, SESSION_KEY } = localData

// splash 页模块在同一进程内只加载一次，Page 定义在用例间共享
let splashPageDefinition

function installWx(store, callFunction) {
  global.wx = {
    getStorageSync(key) {
      return key in store ? store[key] : ''
    },
    setStorageSync(key, value) {
      store[key] = value
    },
    removeStorageSync(key) {
      delete store[key]
    },
    cloud: { callFunction }
  }
}

function trackCalls(store, resolver) {
  const calls = []
  installWx(store, ({ data }) => {
    calls.push(data.type)
    return Promise.resolve({ result: { success: true, data: resolver(data.type) } })
  })
  return calls
}

// 还原到「游客」状态：清掉会话与授权记录（登出会写 LOGGED_OUT 标记，也要清掉）
function resetToGuest() {
  const store = {}
  installWx(store, () => ({}))
  auth.logout()
  localData.clearLoggedOut()
  return store
}

const loginResponse = () => ({
  user: {
    openid: 'openid-1',
    nickname: '耳朵守护者',
    avatar: '',
    bio: '关注听力健康，从每天开始',
    deviceModel: '',
    profileUpdatedAt: 0,
    settings: {},
    testCount: 0,
    usageSeconds: 0,
    pointsBalance: 0
  }
})

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0))

test('未勾选协议时 login() 直接拒绝，不发起建档请求', async () => {
  const store = resetToGuest()
  const calls = trackCalls(store, () => ({}))

  await assert.rejects(auth.login(), /用户协议/)

  assert.deepEqual(calls, [])
  assert.equal(auth.isLoggedIn(), false)
  assert.equal(SESSION_KEY in store, false)

  delete global.wx
})

test('勾选协议并主动登录后建档，会话与授权记录生效', async () => {
  const store = resetToGuest()
  const calls = trackCalls(store, type => {
    if (type === 'login') return loginResponse()
    if (type === 'listFavorites') return []
    return {}
  })

  auth.grantConsent()
  await auth.login()

  assert.equal(auth.isLoggedIn(), true)
  assert.equal(auth.hasConsent(), true)
  assert.equal(calls.includes('login'), true)
  assert.ok(store[SESSION_KEY])
  assert.ok(store[CONSENT_KEY].agreedAt > 0)

  delete global.wx
})

test('游客进入「我的」不会被静默登录建档', async () => {
  const store = resetToGuest()
  const calls = trackCalls(store, () => ({}))
  let profilePage

  global.Page = definition => {
    profilePage = definition
  }

  require('../miniprogram/pages/profile/profile')

  const page = {
    ...profilePage,
    data: JSON.parse(JSON.stringify(profilePage.data)),
    setData(updates) {
      Object.assign(this.data, updates)
    }
  }

  page.onShow()
  await flushMicrotasks()

  assert.equal(page.data.loggedIn, false)
  assert.equal(calls.includes('login'), false)
  assert.equal(auth.isLoggedIn(), false)

  delete global.Page
  delete global.wx
})

test('开屏页未勾选协议时点击登录只提示，不发起请求', () => {
  const store = resetToGuest()
  const calls = trackCalls(store, () => ({}))

  global.Page = definition => {
    splashPageDefinition = definition
  }

  require('../miniprogram/pages/splash/splash')

  const page = {
    ...splashPageDefinition,
    data: JSON.parse(JSON.stringify(splashPageDefinition.data)),
    setData(updates) {
      Object.assign(this.data, updates)
    }
  }

  page.performLogin()

  assert.equal(page.data.errorMsg.includes('用户协议'), true)
  assert.deepEqual(calls, [])

  delete global.Page
  delete global.wx
})

test('游客阶段的用耳数据只留本机，登录后补报', async () => {
  const store = resetToGuest()
  const calls = trackCalls(store, type => {
    if (type === 'login') return loginResponse()
    if (type === 'listFavorites') return []
    if (type === 'saveUsage') return { seconds: 120 }
    return []
  })

  const todayKey = usageTracker.dateKeyOffset(0)
  store.hearHealthUsagePending = { dateKey: todayKey, seconds: 120, samples: [] }

  // 游客：不上报，缓冲保留
  usageTracker.onAppShow()
  usageTracker.onAppHide()
  await flushMicrotasks()

  assert.deepEqual(calls, [])
  assert.equal('hearHealthUsagePending' in store, true)

  // 登录后的下一个同步周期把留存的增量补报
  auth.grantConsent()
  await auth.login()

  usageTracker.onAppShow()
  usageTracker.onAppHide()
  await flushMicrotasks()

  assert.equal(calls.includes('saveUsage'), true)

  delete global.wx
})

test('游客与退出登录状态下统计页不读云端用量', async () => {
  const store = resetToGuest()
  const calls = trackCalls(store, () => [])

  usageTracker.onAppShow()
  usageTracker.onAppHide()
  await flushMicrotasks()

  const days = await usageTracker.refreshRange(usageTracker.dateKeyOffset(-6), usageTracker.dateKeyOffset(0))

  assert.deepEqual(calls, [])
  assert.deepEqual(days, [])

  delete global.wx
})

test('退出登录会一并撤销授权记录', async () => {
  const store = resetToGuest()
  trackCalls(store, type => {
    if (type === 'login') return loginResponse()
    if (type === 'listFavorites') return []
    return {}
  })

  auth.grantConsent()
  await auth.login()
  assert.equal(auth.hasConsent(), true)

  auth.logout()

  assert.equal(auth.isLoggedIn(), false)
  assert.equal(auth.hasConsent(), false)
  assert.equal(CONSENT_KEY in store, false)

  delete global.wx
})

test('已登录用户停留在开屏页时不再展示登录入口', async () => {
  const store = resetToGuest()
  trackCalls(store, type => {
    if (type === 'login') return loginResponse()
    if (type === 'listFavorites') return []
    return {}
  })

  auth.grantConsent()
  await auth.login()

  global.Page = definition => {
    splashPageDefinition = definition
  }
  // enterApp 依赖的运行时 API：测试环境里给空实现即可
  global.getCurrentPages = () => []
  global.wx.switchTab = () => {}

  require('../miniprogram/pages/splash/splash')

  const page = {
    ...splashPageDefinition,
    data: JSON.parse(JSON.stringify(splashPageDefinition.data)),
    setData(updates) {
      Object.assign(this.data, updates)
    }
  }

  page.onLoad({})

  assert.equal(page.data.loggedIn, true)

  // 等 enterApp 里 MIN_SPLASH_MS 的进入定时器走完（mock 掉的 switchTab 会被调用），再清理全局对象
  await new Promise(resolve => setTimeout(resolve, 2200))

  delete global.getCurrentPages
  delete global.Page
  delete global.wx
})
