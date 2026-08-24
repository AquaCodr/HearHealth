Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/home/home',
        text: '首页',
        iconPath: '/images/tabbar/home.png',
        selectedIconPath: '/images/tabbar/home-active.png'
      },
      {
        pagePath: '/pages/stats/stats',
        text: '统计',
        iconPath: '/images/tabbar/stats.png',
        selectedIconPath: '/images/tabbar/stats-active.png'
      },
      {
        pagePath: '/pages/community/community',
        text: '耳友圈',
        iconPath: '/images/tabbar/community.png',
        selectedIconPath: '/images/tabbar/community-active.png'
      },
      {
        pagePath: '/pages/profile/profile',
        text: '我的',
        iconPath: '/images/tabbar/profile.png',
        selectedIconPath: '/images/tabbar/profile-active.png'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
