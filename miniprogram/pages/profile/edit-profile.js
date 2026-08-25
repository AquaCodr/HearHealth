const {
  MAX_NICKNAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_DEVICE_MODEL_LENGTH,
  getUserProfile,
  saveUserProfile
} = require('../../utils/user-profile')

const DEVICE_OPTIONS = [
  '未选择',
  'AirPods',
  'AirPods Pro',
  'AirPods Pro 2',
  'AirPods Max',
  'EarPods',
  'Sony WH-1000XM5',
  'Bose QuietComfort',
  'Huawei FreeBuds',
  'Xiaomi Buds',
  '其他型号'
]

const OTHER_DEVICE_INDEX = DEVICE_OPTIONS.length - 1

Page({
  data: {
    avatar: '',
    nickname: '',
    bio: '',
    deviceOptions: DEVICE_OPTIONS,
    deviceIndex: 0,
    deviceDisplay: DEVICE_OPTIONS[0],
    showCustomDevice: false,
    customDeviceModel: '',
    nicknameMaxLength: MAX_NICKNAME_LENGTH,
    bioMaxLength: MAX_BIO_LENGTH,
    deviceMaxLength: MAX_DEVICE_MODEL_LENGTH,
    saving: false
  },

  onLoad() {
    const profile = getUserProfile()
    const presetIndex = DEVICE_OPTIONS.indexOf(profile.deviceModel)
    const hasCustomDevice = Boolean(profile.deviceModel && presetIndex < 0)
    const deviceIndex = hasCustomDevice
      ? OTHER_DEVICE_INDEX
      : Math.max(presetIndex, 0)

    this.originalAvatar = profile.avatar
    this.avatarNeedsPersist = false
    this.nicknameReviewRejected = false

    this.setData({
      avatar: profile.avatar,
      nickname: profile.nickname,
      bio: profile.bio,
      deviceIndex,
      deviceDisplay: DEVICE_OPTIONS[deviceIndex],
      showCustomDevice: hasCustomDevice,
      customDeviceModel: hasCustomDevice ? profile.deviceModel : ''
    })
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl
    if (!avatarUrl) {
      wx.showToast({ title: '未能读取所选头像', icon: 'none' })
      return
    }

    this.avatarNeedsPersist = true
    this.setData({ avatar: avatarUrl })
  },

  onNicknameInput(e) {
    this.nicknameReviewRejected = false
    this.setData({ nickname: e.detail.value })
  },

  onNicknameReview(e) {
    const detail = e.detail || {}
    this.nicknameReviewRejected = detail.pass === false && !detail.timeout
    if (this.nicknameReviewRejected) {
      wx.showToast({ title: '昵称未通过审核，请修改', icon: 'none' })
    }
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value })
  },

  onDeviceChange(e) {
    const deviceIndex = Number(e.detail.value)
    const showCustomDevice = deviceIndex === OTHER_DEVICE_INDEX
    this.setData({
      deviceIndex,
      deviceDisplay: DEVICE_OPTIONS[deviceIndex],
      showCustomDevice,
      customDeviceModel: showCustomDevice ? this.data.customDeviceModel : ''
    })
  },

  onCustomDeviceInput(e) {
    this.setData({ customDeviceModel: e.detail.value })
  },

  persistAvatar(tempFilePath) {
    return new Promise((resolve, reject) => {
      if (!tempFilePath || typeof wx.getFileSystemManager !== 'function') {
        reject(new Error('文件系统不可用'))
        return
      }

      wx.getFileSystemManager().saveFile({
        tempFilePath,
        success: res => {
          if (res.savedFilePath) {
            resolve(res.savedFilePath)
          } else {
            reject(new Error('未返回持久化路径'))
          }
        },
        fail: reject
      })
    })
  },

  async onSave(e) {
    if (this.data.saving) return

    const formValues = e.detail.value || {}
    const nickname = String(formValues.nickname || this.data.nickname || '').trim()
    const bioSource = Object.prototype.hasOwnProperty.call(formValues, 'bio')
      ? formValues.bio
      : this.data.bio
    const bio = String(bioSource || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (this.nicknameReviewRejected) {
      wx.showToast({ title: '昵称未通过审核，请修改', icon: 'none' })
      return
    }

    let deviceModel = ''
    if (this.data.deviceIndex === OTHER_DEVICE_INDEX) {
      deviceModel = String(
        formValues.customDeviceModel || this.data.customDeviceModel || ''
      ).trim()
      if (!deviceModel) {
        wx.showToast({ title: '请输入耳机型号', icon: 'none' })
        return
      }
    } else if (this.data.deviceIndex > 0) {
      deviceModel = DEVICE_OPTIONS[this.data.deviceIndex]
    }

    this.setData({ saving: true })

    let avatar = this.data.avatar
    let avatarPersistFailed = false
    if (this.avatarNeedsPersist) {
      try {
        avatar = await this.persistAvatar(this.data.avatar)
      } catch (error) {
        avatar = this.originalAvatar
        avatarPersistFailed = true
      }
    }

    try {
      const savedProfile = saveUserProfile({ nickname, avatar, bio, deviceModel })
      this.originalAvatar = savedProfile.avatar
      this.avatarNeedsPersist = false
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '资料保存失败，请重试',
        icon: 'none'
      })
      return
    }

    wx.showToast({
      title: avatarPersistFailed ? '头像保存失败，已保留原头像' : '保存成功',
      icon: avatarPersistFailed ? 'none' : 'success',
      duration: avatarPersistFailed ? 1800 : 1000
    })

    setTimeout(() => {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          this.setData({ saving: false })
          wx.switchTab({ url: '/pages/profile/profile' })
        }
      })
    }, avatarPersistFailed ? 1500 : 600)
  }
})
