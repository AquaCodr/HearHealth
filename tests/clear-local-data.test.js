// issue #35：设置页曾把「清除本地数据」实现成 wx.clearStorageSync()，
// 但身份来自微信 OPENID、用耳与测试等权威数据在云端，清完后各页面会自动重新登录
// 并把云端数据同步回来，登录态与累计用耳时长看起来「没被清掉」。
// 这里锁定拆分后的语义：清缓存（可恢复）/ 退出登录（清会话）/ 注销账号（连云端一起删）。
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const projectRoot = path.resolve(__dirname, '..')

const localData = require('../miniprogram/utils/local-data')
const auth = require('../miniprogram/utils/auth')
const usageTracker = require('../miniprogram/utils/usage-tracker')

const {
  SESSION_KEY,
  LOGGED_OUT_KEY,
  SYNCED_KEYS,
  DEVICE_ONLY_KEYS
} = localData

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

test('清除缓存只清云端副本，登录会话与本机状态都不受影响', () => {
  const store = {}
  SYNCED_KEYS.forEach(key => { store[key] = { cached: true } })
  DEVICE_ONLY_KEYS.forEach(key => { store[key] = { cached: true } })
  store[SESSION_KEY] = { user: { openid: 'openid-1' } }

  installWx(store)

  localData.clearCache()

  assert.deepEqual(SYNCED_KEYS.filter(key => key in store), [])
  assert.deepEqual(DEVICE_ONLY_KEYS.filter(key => key in store), DEVICE_ONLY_KEYS)
  assert.ok(store[SESSION_KEY])
  assert.equal(localData.isLoggedOut(), false)

  delete global.wx
})

test('清除账号数据会连会话和仅本机的状态一起清掉', () => {
  const store = {}
  SYNCED_KEYS.forEach(key => { store[key] = { cached: true } })
  DEVICE_ONLY_KEYS.forEach(key => { store[key] = { cached: true } })
  store[SESSION_KEY] = { user: { openid: 'openid-1' } }

  installWx(store)

  localData.clearAccountData()

  assert.deepEqual(Object.keys(store), [])

  delete global.wx
})

test('退出登录清掉会话并标记为已登出，重新登录后标记被清除', async () => {
  const store = {
    [SESSION_KEY]: { user: { openid: 'openid-1' } }
  }
  localData.clearLoggedOut()
  trackCalls(store, type => {
    if (type === 'login') {
      return {
        user: {
          openid: 'openid-1',
          nickname: '耳朵守护者',
          avatar: '',
          bio: '关注听力健康，从每天开始',
          deviceModel: '',
          profileUpdatedAt: 0,
          settings: {},
          testCount: 0,
          usageSeconds: 0
        }
      }
    }
    return []
  })

  assert.equal(auth.isLoggedIn(), true)
  assert.equal(localData.isLoggedOut(), false)

  auth.logout()

  assert.equal(auth.isLoggedIn(), false)
  assert.equal(localData.isLoggedOut(), true)
  assert.equal(SESSION_KEY in store, false)

  await auth.ensureLogin()

  assert.equal(auth.isLoggedIn(), true)
  assert.equal(localData.isLoggedOut(), false)

  delete global.wx
})

test('退出登录后不再上报用耳时长，未确认的增量直接丢弃', async () => {
  const todayKey = usageTracker.dateKeyOffset(0)
  const store = {
    [LOGGED_OUT_KEY]: true,
    hearHealthUsagePending: { dateKey: todayKey, seconds: 120, samples: [] }
  }
  const calls = trackCalls(store, () => ({ seconds: 0 }))

  usageTracker.onAppShow()
  usageTracker.onAppHide()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(calls, [])
  assert.equal('hearHealthUsagePending' in store, false)

  delete global.wx
})

test('未退出登录时切后台仍会正常上报用耳时长', async () => {
  localData.clearLoggedOut()
  const todayKey = usageTracker.dateKeyOffset(0)
  const store = {
    [SESSION_KEY]: { user: { openid: 'openid-1' } },
    hearHealthUsagePending: { dateKey: todayKey, seconds: 120, samples: [] }
  }
  const calls = trackCalls(store, () => ({ seconds: 120 }))

  usageTracker.onAppShow()
  usageTracker.onAppHide()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(calls, ['saveUsage'])

  delete global.wx
})

test('注销账号由云函数按 OPENID 删除本账号数据，不接受客户端传入 openid', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'cloudfunctions/userFunctions/index.js'),
    'utf8'
  )

  assert.match(source, /case 'deleteAccount'/)
  assert.match(source, /async function deleteAccount\(\)/)
  assert.match(source, /cloud\.getWXContext\(\)/)
  assert.doesNotMatch(source, /event\.openid/);
  ['usage_records', 'test_records', 'user_favorites', 'points_ledger', 'users'].forEach(name => {
    assert.match(source, new RegExp(`'${name}'`))
  })
})

test('设置页改为提供清除缓存 / 退出登录 / 注销账号三个动作', () => {
  const wxml = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/profile/settings.wxml'),
    'utf8'
  )
  const js = fs.readFileSync(
    path.join(projectRoot, 'miniprogram/pages/profile/settings.js'),
    'utf8'
  )

  assert.doesNotMatch(wxml, /清除本地数据/)
  assert.doesNotMatch(js, /onClearLocalData/)
  assert.doesNotMatch(js, /wx\.clearStorageSync\(\)/)
  assert.match(wxml, /onClearCache/)
  assert.match(wxml, /onLogout/)
  assert.match(wxml, /onDeleteAccount/)
})

test('设置页退出登录会清掉会话并回到开屏页', async () => {
  const store = { [SESSION_KEY]: { user: { openid: 'openid-1' } } }
  let reLaunchedUrl = ''
  const modals = []

  global.Page = definition => {
    global.__settingsPage = definition
  }
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
    showModal(options) {
      modals.push(options)
      if (options.success) options.success({ confirm: true })
    },
    showToast() {},
    showLoading() {},
    hideLoading() {},
    reLaunch({ url }) {
      reLaunchedUrl = url
    }
  }

  require('../miniprogram/pages/profile/settings')
  const page = {
    ...global.__settingsPage,
    data: JSON.parse(JSON.stringify(global.__settingsPage.data)),
    setData(updates) {
      Object.assign(this.data, updates)
    }
  }

  page.onLogout()

  assert.equal(auth.isLoggedIn(), false)
  assert.equal(localData.isLoggedOut(), true)
  assert.equal(page.data.loggedIn, false)
  assert.equal(modals[0].title, '退出登录')

  await new Promise(resolve => setTimeout(resolve, 700))
  assert.equal(reLaunchedUrl, '/pages/splash/splash')

  delete global.Page
  delete global.wx
})
