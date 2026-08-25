// 耳友圈广场（tabBar 页）—— 数据来自云函数 communityFunctions
const { formatTime, callCommunity } = require('./util')

// 顶部公告关闭标记的本地缓存 key（关闭一次后不再展示）
const COMMUNITY_NOTICE_CLOSED_KEY = 'communityNoticeClosed'

Page({
  data: {
    defaultAvatar: '/images/icons/avatar.png',
    showNotice: false,
    activeTab: 'all',
    tabs: [
      { key: 'all', label: '动态' },
      { key: 'tip', label: '护耳妙招' },
      { key: 'fail', label: '用耳翻车' },
      { key: 'recommend', label: '耳机安利' },
      { key: 'checkin', label: '护耳打卡' },
      { key: 'question', label: '求助提问' },
      { key: 'report', label: '测听报告' },
      { key: 'science', label: '听力科普' },
      { key: 'device', label: '助听设备' },
      { key: 'hospital', label: '就医经验' },
      { key: 'mood', label: '心情树洞' }
    ],
    postList: [] // 后续从云开发数据库 community 集合拉取
  },

  onLoad() {
    // 公告默认展示，用户关闭过则不再展示
    this.setData({ showNotice: !wx.getStorageSync(COMMUNITY_NOTICE_CLOSED_KEY) })
  },

  onCloseNotice() {
    this.setData({ showNotice: false })
    wx.setStorageSync(COMMUNITY_NOTICE_CLOSED_KEY, true)
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
