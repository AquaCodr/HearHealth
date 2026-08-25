const { callCommunity } = require('../community/util')
const { DEFAULT_BIO, getUserProfile } = require('../../utils/user-profile')
const initialUserProfile = getUserProfile()

Page({
  data: {
    defaultBio: DEFAULT_BIO,
    userProfile: initialUserProfile,
    stats: [
      { value: '32h', label: '累计用耳' },
      { value: '6', label: '测试次数' },
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
  },

  loadUserProfile() {
    this.setData({ userProfile: getUserProfile() })
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
