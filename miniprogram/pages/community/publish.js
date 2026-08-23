// 发帖编辑页 —— 发布写入走云函数 communityFunctions
const { callCommunity } = require('./util')

Page({
  data: {
    tags: [
      { key: 'tip', label: '护耳妙招' },
      { key: 'fail', label: '用耳翻车' },
      { key: 'recommend', label: '耳机安利' }
    ],
    activeTag: 'tip',
    title: '',
    content: '',
    maxLen: 500,
    publishing: false
  },

  onLoad(options) {
    // 支持从听力报告页分享预填：/pages/community/publish?title=xx&content=xx
    if (options.title || options.content) {
      this.setData({
        title: options.title || '',
        content: options.content || ''
      })
    }
  },

  onSelectTag(e) {
    this.setData({ activeTag: e.currentTarget.dataset.key })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onAddImage() {
    // MVP：图片上传后续迭代
    wx.showToast({ title: '图片功能开发中', icon: 'none' })
  },

  onCancel() {
    if (this.data.title.trim() || this.data.content.trim()) {
      wx.showModal({
        title: '放弃发布？',
        content: '已编辑的内容将不会保存',
        confirmText: '放弃',
        confirmColor: '#0066cc',
        success: res => {
          if (res.confirm) wx.navigateBack()
        }
      })
    } else {
      wx.navigateBack()
    }
  },

  onPublish() {
    if (this.data.publishing) return
    const title = this.data.title.trim()
    const content = this.data.content.trim()
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!content) {
      wx.showToast({ title: '请填写内容', icon: 'none' })
      return
    }
    this.setData({ publishing: true })

    callCommunity('addPost', {
      tag: this.data.activeTag,
      title,
      content,
      summary: content.length > 60 ? content.slice(0, 60) + '…' : content
    })
      .then(() => {
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      })
      .catch(err => {
        wx.showToast({ title: `发布失败：${(err && (err.errMsg || err.message)) || '云函数未部署'}`, icon: 'none' })
      })
      .finally(() => this.setData({ publishing: false }))
  }
})
