const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const projectRoot = path.resolve(__dirname, '..')
const shopRoute = 'pages/profile/points-shop'
const localData = require('../miniprogram/utils/local-data')
const auth = require('../miniprogram/utils/auth')
const { SESSION_KEY } = localData
let shopPageDefinition

test('积分商城页面已注册到小程序路由', () => {
  const appConfig = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'miniprogram/app.json'), 'utf8')
  )

  assert.equal(appConfig.pages.includes(shopRoute), true)
})

test('个人中心积分商城入口跳转到已注册页面', () => {
  let profilePage
  let navigatedUrl = ''

  global.wx = {
    getStorageSync() {
      return null
    },
    navigateTo({ url }) {
      navigatedUrl = url
    }
  }
  global.Page = definition => {
    profilePage = definition
  }

  require('../miniprogram/pages/profile/profile')

  const menuItems = profilePage.data.menuGroups.flatMap(group => group.items)
  const shopItem = menuItems.find(item => item.id === 'points-shop')

  assert.ok(shopItem)
  assert.equal(shopItem.url, `/${shopRoute}`)

  profilePage.onMenuTap({
    currentTarget: {
      dataset: { url: shopItem.url }
    }
  })
  assert.equal(navigatedUrl, `/${shopRoute}`)

  delete global.Page
  delete global.wx
})

test('积分商城首期展示三种奖励分类和零积分占位余额', () => {
  global.Page = definition => {
    shopPageDefinition = definition
  }
  require('../miniprogram/pages/profile/points-shop')

  assert.equal(shopPageDefinition.data.pointsBalance, 0)
  assert.deepEqual(
    shopPageDefinition.data.rewardCategories.map(item => item.id),
    ['badges', 'coupons', 'souvenirs']
  )

  delete global.Page
})

test('积分商城从当前用户云端账户读取余额和流水', async () => {
  const calls = []
  const store = {
    // issue #36：积分账户是云端账号数据，只有已登录（会话在本地）才会读取
    [SESSION_KEY]: { user: { openid: 'test-openid' } }
  }
  const defaultSettings = {
    reminderThreshold: 2,
    healthReminder: true,
    testReminder: true,
    communityMessage: true
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
    cloud: {
      callFunction({ data }) {
        calls.push(data.type)
        if (data.type === 'login') {
          return Promise.resolve({
            result: {
              success: true,
              data: {
                user: {
                  openid: 'test-openid',
                  nickname: '测试用户',
                  bio: '关注听力健康，从每天开始',
                  avatar: '',
                  deviceModel: '',
                  profileUpdatedAt: 0,
                  settings: defaultSettings,
                  testCount: 0,
                  usageSeconds: 0,
                  pointsBalance: 125
                }
              }
            }
          })
        }
        if (data.type === 'listFavorites') {
          return Promise.resolve({ result: { success: true, data: [] } })
        }
        if (data.type === 'getPointsSummary') {
          return Promise.resolve({
            result: {
              success: true,
              data: {
                balance: 125,
                entries: [{
                  id: 'ledger-1',
                  title: '护耳妙招被采纳',
                  points: 100,
                  createdAt: new Date(2026, 8, 1, 9, 30).getTime()
                }]
              }
            }
          })
        }
        throw new Error(`unexpected cloud call: ${data.type}`)
      }
    }
  }

  const page = {
    ...shopPageDefinition,
    data: JSON.parse(JSON.stringify(shopPageDefinition.data)),
    setData(updates) {
      Object.assign(this.data, updates)
    }
  }

  await page.loadPointsSummary()

  assert.equal(page.data.pointsBalance, 125)
  assert.equal(page.data.pointsLoading, false)
  assert.equal(page.data.pointsError, '')
  assert.equal(page.data.needLogin, false)
  assert.equal(page.data.pointsEntries[0].pointsText, '+100')
  assert.equal(page.data.pointsEntries[0].direction, 'credit')
  assert.equal(calls.includes('getPointsSummary'), true)

  delete global.wx
})

test('游客打开积分商城只展示登录引导，不触发登录建档', async () => {
  const store = {}
  const calls = []

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
    cloud: {
      callFunction({ data }) {
        calls.push(data.type)
        return Promise.resolve({ result: { success: true, data: {} } })
      }
    }
  }

  // 清掉上一个用例留在 auth 模块里的会话缓存，回到游客态
  auth.logout()
  localData.clearLoggedOut()

  const page = {
    ...shopPageDefinition,
    data: JSON.parse(JSON.stringify(shopPageDefinition.data)),
    setData(updates) {
      Object.assign(this.data, updates)
    }
  }

  await page.loadPointsSummary()

  assert.equal(page.data.needLogin, true)
  assert.equal(page.data.pointsLoading, false)
  assert.equal(page.data.pointsError, '')
  assert.deepEqual(calls, [])

  delete global.wx
})

test('云函数只开放积分查询，不开放客户端直接加积分', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'cloudfunctions/userFunctions/index.js'),
    'utf8'
  )

  assert.match(source, /case 'getPointsSummary'/)
  assert.doesNotMatch(source, /case 'grantPoints'/)
  assert.doesNotMatch(source, /case 'addPoints'/)
})
