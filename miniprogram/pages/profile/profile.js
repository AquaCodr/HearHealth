const { callCommunity } = require('../community/util')
const { DEFAULT_BIO, getUserProfile } = require('../../utils/user-profile')
const { ensureLogin, getSession, isLoggedIn } = require('../../utils/auth')
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
    stats: [
      { value: formatTotalUsage(initialUser.usageSeconds), label: '累计用耳' },
      { value: String(initialUser.testCount || 0), label: '测试次数' },
      { value: '4', label: '发帖数' }
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
    // 登录后用云端档案刷新测试次数；未登录时补一次静默登录（失败不打扰）
    if (!isLoggedIn()) {
      ensureLogin()
        .then(() => this.applySession())
        .catch(() => {})
    } else {
      this.applySession()
    }
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

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile/edit-profile' })
  }
})
