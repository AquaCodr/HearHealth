Page({
  data: {
    requirements: [
      {
        title: '选择安静环境',
        description: '关闭电视、音乐等声源，避免环境噪声干扰判断'
      },
      {
        title: '正确佩戴耳机',
        description: '确认左右耳方向，并让耳机保持稳定、舒适'
      },
      {
        title: '使用舒适音量',
        description: '从较低音量开始，任何不适都应立即停止测试'
      },
      {
        title: '根据真实听感作答',
        description: '无论声音多轻，只在确实听到时选择“听到了”'
      }
    ],
    navigating: false
  },

  onLoad() {},

  startTest() {
    if (this.data.navigating) return

    this.setData({ navigating: true })
    wx.redirectTo({
      url: '/pages/test/process',
      fail: () => {
        this.setData({ navigating: false })
        wx.showToast({ title: '暂时无法进入测试', icon: 'none' })
      }
    })
  },

  skipTest() {
    if (this.data.navigating) return

    this.setData({ navigating: true })
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => this.returnHome()
      })
      return
    }

    this.returnHome()
  },

  returnHome() {
    wx.switchTab({
      url: '/pages/home/home',
      fail: () => {
        this.setData({ navigating: false })
        wx.showToast({ title: '暂时无法返回首页', icon: 'none' })
      }
    })
  }
})
