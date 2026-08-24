// 帖子详情页 —— 数据来自云函数 communityFunctions
const { formatTime, callCommunity } = require('./util')

Page({
  data: {
    defaultAvatar: '/images/icons/avatar.png',
    post: null,
    comments: [],
    liked: false,
    faved: false,
    inputValue: '',
    canSend: false,
    loading: true
  },

  onLoad(options) {
    this.postId = options.id || ''
    this.loadPost(this.postId)
    this.loadComments(this.postId)
  },

  loadPost(id) {
    const notFound = () => {
      this.setData({ loading: false, post: null, notFound: true })
    }
    if (!id) return notFound()

    callCommunity('getPost', { id })
      .then(post => {
        if (post) {
          // 兼容旧数据：无 images 数组时回退到单张 cover
          const displayImages = post.images && post.images.length
            ? post.images
            : (post.cover ? [post.cover] : [])
          this.setData({
            loading: false,
            post: { ...post, createTime: formatTime(post.createTime), displayImages }
          })
        } else {
          notFound()
        }
      })
      .catch(notFound)
  },

  // 预览帖子图片
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.post.displayImages })
  },

  loadComments(postId) {
    callCommunity('listComments', { postId })
      .then(list => {
        this.setData({
          comments: list.map(c => ({ ...c, createTime: formatTime(c.createTime) }))
        })
      })
      .catch(() => {
        this.setData({ comments: [] })
      })
  },

  onLike() {
    const { post, liked } = this.data
    const delta = liked ? -1 : 1
    this.setData({
      liked: !liked,
      'post.likeCount': post.likeCount + delta
    })
    // 云函数同步计数（失败静默，本地已即时反馈）
    callCommunity('updateCount', { id: this.postId, field: 'likeCount', delta }).catch(() => {})
  },

  onFav() {
    const { post, faved } = this.data
    const delta = faved ? -1 : 1
    this.setData({
      faved: !faved,
      'post.favCount': post.favCount + delta
    })
    callCommunity('updateCount', { id: this.postId, field: 'favCount', delta }).catch(() => {})
    wx.showToast({ title: faved ? '已取消收藏' : '收藏成功', icon: 'none' })
  },

  onInputComment(e) {
    const value = e.detail.value
    this.setData({ inputValue: value, canSend: !!value.trim() })
  },

  onSendComment() {
    const content = this.data.inputValue.trim()
    if (!content) {
      wx.showToast({ title: '说点什么吧', icon: 'none' })
      return
    }
    // 先本地上屏，即时反馈
    const comment = {
      _id: 'local-' + Date.now(),
      nickname: '耳友',
      avatar: '',
      createTime: formatTime(new Date()),
      content
    }
    this.setData({
      comments: [...this.data.comments, comment],
      inputValue: '',
      canSend: false,
      'post.commentCount': this.data.post.commentCount + 1
    })
    // 云函数写入（失败静默并提示）
    callCommunity('addComment', { postId: this.postId, content })
      .catch(() => {
        wx.showToast({ title: '评论同步失败，请检查云函数部署', icon: 'none' })
      })
  },

  onShareAppMessage() {
    const post = this.data.post
    return {
      title: post ? post.title : '耳友圈',
      path: `/pages/community/detail?id=${this.postId}`
    }
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  }
})
