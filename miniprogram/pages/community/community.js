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
    postList: [], // 后续从云开发数据库 community 集合拉取
    indicatorLeft: 0,
    indicatorWidth: 0
  },

  onShow() {
    this.loadPosts(this.data.activeTab)
    this.moveIndicator(this.data.activeTab)
  },

  onSwitchTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.loadPosts(key)
    this.moveIndicator(key)
  },

  moveIndicator(key) {
    const query = wx.createSelectorQuery().in(this)
    // 等视图渲染完成再测量
    wx.nextTick(() => {
      query.select('.tab-list').boundingClientRect()
      query.selectAll('.tab-item').boundingClientRect()
      query.exec((res) => {
        if (!res || !res[0] || !res[1]) return
        const listRect = res[0]
        const items = res[1]
        const idx = this.data.tabs.findIndex(t => t.key === key)
        const target = items[idx]
        if (!target) return
        // 固定宽度下划线，居中于当前 tab，避免跳动
        const indicatorWidth = 40
        const left = target.left - listRect.left + (target.width - indicatorWidth) / 2
        this.setData({
          indicatorLeft: left,
          indicatorWidth: indicatorWidth
        })
      })
    })
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
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/community/publish' })
  }
})
