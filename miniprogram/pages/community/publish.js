// 发帖编辑页 —— 图片上传云存储，发布走云函数 communityFunctions
const { callCommunity } = require('./util')

// 上传单张图片到云存储，返回 fileID
function uploadImage(filePath) {
  const extMatch = filePath.match(/\.\w+$/) || ['.jpg']
  const cloudPath = `community/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extMatch[0]}`
  return wx.cloud.uploadFile({ cloudPath, filePath }).then(res => res.fileID)
}

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
    images: [], // 本地临时文件路径
    maxImages: 3,
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

  // 选择图片（相册/拍摄）
  onChooseImage() {
    const remain = this.data.maxImages - this.data.images.length
    if (remain <= 0) return
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const paths = res.tempFiles.map(f => f.tempFilePath)
        this.setData({
          images: [...this.data.images, ...paths].slice(0, this.data.maxImages)
        })
      }
    })
  },

  // 删除已选图片
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(index, 1)
    this.setData({ images })
  },

  // 预览已选图片
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.images })
  },

  onCancel() {
    const { title, content, images } = this.data
    if (title.trim() || content.trim() || images.length) {
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
    const { images } = this.data
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!content && !images.length) {
      wx.showToast({ title: '请填写内容或添加图片', icon: 'none' })
      return
    }

    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中…', mask: true })

    // 1. 图片逐张上传云存储
    Promise.all(images.map(uploadImage))
      // 2. 云函数写入帖子
      .then(fileIDs => callCommunity('addPost', {
        tag: this.data.activeTag,
        title,
        content,
        summary: content.length > 60 ? content.slice(0, 60) + '…' : content,
        images: fileIDs
      }))
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      })
      .catch(err => {
        wx.hideLoading()
        const msg = (err && (err.errMsg || err.message)) || ''
        wx.showToast({
          title: msg.includes('uploadFile') || msg.includes('cloud') ? '图片上传失败，请检查云环境' : `发布失败：${msg || '云函数未部署'}`,
          icon: 'none'
        })
      })
      .finally(() => this.setData({ publishing: false }))
  }
})
