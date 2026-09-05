const { callUser, isLoggedIn } = require('../../utils/auth')

// 积分属于账号数据：游客先走登录入口，不在本页静默建档（issue #36）
const LOGIN_URL = '/pages/splash/splash?redirect=/pages/profile/points-shop'

function formatEntryTime(timestamp) {
  if (!Number(timestamp)) return '时间未知'
  const date = new Date(Number(timestamp) || 0)
  if (Number.isNaN(date.getTime())) return '时间未知'

  const pad = value => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeEntries(input) {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => {
    const points = Math.round(Number(item && item.points) || 0)
    return {
      id: (item && item.id) || `entry-${index}`,
      title: (item && item.title) || '积分变动',
      points,
      pointsText: `${points > 0 ? '+' : ''}${points}`,
      direction: points >= 0 ? 'credit' : 'debit',
      timeText: formatEntryTime(item && item.createdAt)
    }
  })
}

Page({
  data: {
    pointsBalance: 0,
    pointsLoading: true,
    pointsError: '',
    pointsEntries: [],
    needLogin: false,
    rewardCategories: [
      {
        id: 'badges',
        mark: '章',
        title: '纪念奖章',
        description: '记录护耳成长与社区贡献'
      },
      {
        id: 'coupons',
        mark: '券',
        title: '优惠券',
        description: '兑换合作服务与护耳用品优惠'
      },
      {
        id: 'souvenirs',
        mark: '礼',
        title: '实体纪念',
        description: '兑换限定贴纸、徽章等纪念品'
      }
    ]
  },

  onShow() {
    this.loadPointsSummary()
  },

  onPullDownRefresh() {
    this.loadPointsSummary().then(() => {
      if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh()
    })
  },

  async loadPointsSummary() {
    if (this.pointsRequest) return this.pointsRequest

    this.setData({ pointsLoading: true, pointsError: '' })
    this.pointsRequest = (async () => {
      try {
        // 未登录不触发登录/建档：积分账户在云端，游客只看到登录引导（issue #36）
        if (!isLoggedIn()) {
          this.setData({
            pointsLoading: false,
            pointsError: '',
            needLogin: true,
            pointsBalance: 0,
            pointsEntries: []
          })
          return
        }

        this.setData({ needLogin: false })
        const summary = await callUser('getPointsSummary', { limit: 20 })
        this.setData({
          pointsBalance: Math.max(0, Math.round(Number(summary && summary.balance) || 0)),
          pointsEntries: normalizeEntries(summary && summary.entries),
          pointsLoading: false,
          pointsError: ''
        })
      } catch (error) {
        this.setData({
          pointsLoading: false,
          pointsError: '积分账户暂时无法连接，请稍后重试'
        })
      } finally {
        this.pointsRequest = null
      }
    })()

    return this.pointsRequest
  },

  retryPoints() {
    this.loadPointsSummary()
  },

  onGoLogin() {
    wx.navigateTo({ url: LOGIN_URL })
  }
})
