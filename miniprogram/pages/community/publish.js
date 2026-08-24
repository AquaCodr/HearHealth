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
    content: '',
    images: [], // 本地临时文件路径
    maxImages: 3,
    maxLen: 500,
    publishing: false,
    canPublish: false, // 有正文或图片才可发布
    // 进入幕布转场状态
    curtain: {
      show: false,
      radius: 0,
      opacity: 1,
      x: 62.5, // 默认耳友圈大致中心，longpress 跳转会覆盖
      y: 92
    }
  },

  onLoad(options) {
    // 支持从听力报告页分享预填正文：/pages/community/publish?content=xx
    if (options.content) {
      this.setData({ content: options.content || '' })
    }
    this.refreshCanPublish()
    // 长按耳友圈进入时，携带幕布起点坐标，播放蓝色幕布转场
    if (options.cx || options.cy) {
      this.playCurtain(Number(options.cx) || 62.5, Number(options.cy) || 92)
    }
  },

  // 蓝色幕布：从耳友圈位置展开铺满 → 停留 → 整体淡出揭开发帖页
  playCurtain(x, y) {
    this.setData({
      curtain: { show: true, radius: 0, opacity: 1, x, y }
    })
    wx.nextTick(() => {
      setTimeout(() => {
        // 铺满全屏
        this.setData({ 'curtain.radius': 150 })
      }, 30)
      // 铺满后短暂停留，再淡出揭开发帖页
      setTimeout(() => {
        this.setData({ 'curtain.opacity': 0 })
      }, 460)
      // 淡出结束后移除幕布
      setTimeout(() => {
        this.setData({ 'curtain.show': false })
      }, 820)
    })
  },

  onSelectTag(e) {
    this.setData({ activeTag: e.currentTarget.dataset.key })
  },

  // 根据正文/图片是否为空，刷新发布按钮可用状态
  refreshCanPublish() {
    const { content, images } = this.data
    this.setData({ canPublish: !!(content.trim() || images.length) })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
    this.refreshCanPublish()
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
        this.refreshCanPublish()
      }
    })
  },

  // 删除已选图片
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(index, 1)
    this.setData({ images })
    this.refreshCanPublish()
  },

  // 预览已选图片
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.images })
  },

  onCancel() {
    const { content, images } = this.data
    const back = () => {
      wx.navigateBack({
        fail: () => wx.switchTab({ url: '/pages/community/community' })
      })
    }
    if (content.trim() || images.length) {
      wx.showModal({
        title: '放弃发布？',
        content: '已编辑的内容将不会保存',
        confirmText: '放弃',
        confirmColor: '#0066cc',
        success: res => {
          if (res.confirm) back()
        }
      })
    } else {
      back()
    }
  },

  onPublish() {
    if (this.data.publishing || !this.data.canPublish) return
    const content = this.data.content.trim()
    const { images } = this.data
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
