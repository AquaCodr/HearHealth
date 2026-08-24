// 耳友圈广场（tabBar 页）—— 数据来自云函数 communityFunctions
const { formatTime, callCommunity } = require('./util')

Page({
  data: {
    defaultAvatar: '/images/icons/avatar.png',
    activeTab: 'all',
    tabs: [
      { key: 'all', label: '动态' },
      { key: 'tip', label: '护耳妙招' },
      { key: 'fail', label: '用耳翻车' },
      { key: 'recommend', label: '耳机安利' }
    ],
    postList: [] // 后续从云开发数据库 community 集合拉取
  },

  onShow() {
    this.loadPosts(this.data.activeTab)
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onSwitchTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadPosts(key)
  },

  loadPosts(tab) {
    callCommunity('listPosts', { tag: tab })
      .then(list => {
        this.setData({
          postList: list.map(p => ({ ...p, createTime: formatTime(p.createTime) }))
        })
      })
      .catch(() => {
        // 云函数未部署或环境异常时置空，展示空状态
        this.setData({ postList: [] })
      })
  },

  onTapPost(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/community/detail?id=${id}` })
  }
})
