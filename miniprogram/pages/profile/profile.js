const { callCommunity } = require('../community/util')
const { DEFAULT_BIO, getUserProfile } = require('../../utils/user-profile')
const { getSession, isLoggedIn } = require('../../utils/auth')

// 从本页去开屏页补登录后回跳到「我的」（tab 页）
const LOGIN_URL = '/pages/splash/splash?redirect=/pages/profile/profile'
const initialUserProfile = getUserProfile()
const initialUser = (getSession() || {}).user || {}

// 累计用耳展示：满 1 小时按小时取整，不足 1 小时按分钟
function formatTotalUsage(seconds) {
  const total = Number(seconds) || 0
  if (!total) return '0分钟'
  if (total >= 3600) return `${Math.floor(total / 3600)}h`
  return `${Math.max(1, Math.round(total / 60))}分钟`
}

Page({
  data: {
    defaultBio: DEFAULT_BIO,
    userProfile: initialUserProfile,
    loggedIn: false,
    stats: [
      { value: formatTotalUsage(initialUser.usageSeconds), label: '累计用耳', target: 'usage-stats' },
      { value: String(initialUser.testCount || 0), label: '测试次数', target: 'test-history' },
      { value: '4', label: '发帖数', target: 'my-posts' }
    ],
    menuGroups: [
      {
        id: 'content',
        items: [
          {
            id: 'my-posts',
            title: '我的帖子',
            icon: '/images/icons/business.png',
            url: '/pages/profile/my-posts'
          },
          {
            id: 'skill-library',
            title: '护耳技能库',
            icon: '/images/icons/goods.png',
            url: '/pages/skill/list'
          },
          {
            id: 'points-shop',
            title: '积分商城',
            icon: '/images/icons/points.svg',
            url: '/pages/profile/points-shop'
          }
        ]
      },
      {
        id: 'app',
        items: [
          {
            id: 'settings',
            title: '设置',
            icon: '/images/icons/setting.svg',
            url: '/pages/profile/settings'
          },
          {
            id: 'about',
            title: '关于我们',
            icon: '/images/icons/question.svg',
            url: '/pages/profile/about'
          }
        ]
      }
    ]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.loadUserProfile()
    this.loadPostCount()
    // 只展示当前会话，不在这里补登录：游客进「我的」不该被后台建档，
    // 建档只发生在开屏页/登录入口用户主动点击并同意协议之后（issue #36）
    this.setData({ loggedIn: isLoggedIn() })
    this.applySession()
  },

  loadUserProfile() {
    this.setData({ userProfile: getUserProfile() })
  },

  applySession() {
    const session = getSession() || {}
    const user = session.user || {}
    this.setData({
      userProfile: getUserProfile(),
      stats: this.data.stats.map(s => {
        if (s.label === '累计用耳') return { ...s, value: formatTotalUsage(user.usageSeconds) }
        if (s.label === '测试次数') return { ...s, value: String(user.testCount || 0) }
        return s
      })
    })
  },

  loadPostCount() {
    callCommunity('myPosts', {})
      .then(list => {
        const count = (list || []).length
        this.setData({
          stats: this.data.stats.map(s => s.label === '发帖数' ? { ...s, value: String(count) } : s)
        })
      })
      .catch(() => {})
  },

  onMenuTap(e) {
    const { url } = e.currentTarget.dataset
    if (!url) return

    wx.navigateTo({ url })
  },

  // 统计卡三个数据各自可点：累计用耳 → 统计页（tab 页需 switchTab），其余为普通页面跳转
  onStatTap(e) {
    const { target } = e.currentTarget.dataset
    if (!target) return

    if (target === 'usage-stats') {
      wx.switchTab({ url: '/pages/stats/stats' })
      return
    }
    wx.navigateTo({ url: `/pages/profile/${target}` })
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile/edit-profile' })
  },

  // 游客补登录入口：跳开屏页走与首次登录完全一致的授权流程
  onLoginTap() {
    wx.navigateTo({ url: LOGIN_URL })
  }
})
