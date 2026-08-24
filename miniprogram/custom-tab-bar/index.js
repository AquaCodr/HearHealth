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
    },

    // 长按「耳友圈」tab：立即跳转发帖页，由发帖页的蓝色幕布盖住切换动画
    onLongPressPublish(e) {
      // 仅「耳友圈」tab 触发发帖
      if (e.currentTarget.dataset.key !== '耳友圈') return
      if (this.data.showReveal) return

      if (this.data.selected !== 2) {
        wx.switchTab({ url: '/pages/community/community' })
      }
      // 同步传递幕布起点（底部 4 等分第 3 个，耳友圈大致中心）
      wx.navigateTo({
        url: `/pages/community/publish?cx=${this.data.revealX}&cy=${this.data.revealY}`
      })
    }
  }
})
