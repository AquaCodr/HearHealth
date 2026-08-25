// 我的帖子 —— 数据来自云函数 communityFunctions
const { formatTime, callCommunity } = require('../community/util')

Page({
  data: {
    defaultAvatar: '/images/icons/avatar.png',
    posts: [],
    loading: true
  },

  onShow() {
    this.loadMyPosts()
  },

  loadMyPosts() {
    this.setData({ loading: true })
    callCommunity('myPosts', {})
      .then(list => {
        this.setData({
          loading: false,
          posts: (list || []).map(p => ({
            ...p,
            createTime: formatTime(p.createTime),
            cover: p.cover || (p.images && p.images.length ? p.images[0] : '')
          }))
        })
      })
      .catch(() => {
        this.setData({ loading: false, posts: [] })
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
