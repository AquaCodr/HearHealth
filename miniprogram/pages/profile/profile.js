const { callCommunity } = require('../community/util')

Page({
  data: {
    user: {
      avatar: '/images/icons/avatar.png',
      nickname: '耳朵守护者',
      bio: '关注听力健康，从每天开始'
    },
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
    this.loadPostCount()
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
  }
})
