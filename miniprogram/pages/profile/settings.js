const {
  REMINDER_THRESHOLDS,
  getDefaultSettings,
  getSettings,
  saveSettings
} = require('../../utils/app-settings')
const { callUser, ensureLogin, isLoggedIn, logout } = require('../../utils/auth')
const { clearCache } = require('../../utils/local-data')

// 退出登录/注销账号后统一回到开屏页重新登录
const SPLASH_URL = '/pages/splash/splash'

const THRESHOLD_OPTIONS = REMINDER_THRESHOLDS.map(value => `${value}小时`)

Page({
  data: {
    settings: getDefaultSettings(),
    thresholdOptions: THRESHOLD_OPTIONS,
    thresholdIndex: 1,
    loggedIn: false
  },

  onShow() {
    this.setData({ loggedIn: isLoggedIn() })
    this.loadSettings()
  },

  loadSettings() {
    const settings = getSettings()
    const thresholdIndex = Math.max(
      REMINDER_THRESHOLDS.indexOf(settings.reminderThreshold),
      0
    )
    this.setData({ settings, thresholdIndex })
  },

  persistSettings(settings) {
    const savedSettings = saveSettings(settings)
    this.setData({ settings: savedSettings })
    // 登录状态下同步到 users.settings；未登录时下次登录会以本地播种
    if (isLoggedIn()) {
      callUser('updateSettings', { settings: savedSettings }).catch(() => {})
    }
  },

  onThresholdChange(e) {
    const thresholdIndex = Number(e.detail.value)
    const reminderThreshold = REMINDER_THRESHOLDS[thresholdIndex]
    if (!reminderThreshold) return

    this.setData({ thresholdIndex })
    this.persistSettings({
      ...this.data.settings,
      reminderThreshold
    })
  },

  onNotificationChange(e) {
    const { key } = e.currentTarget.dataset
    if (!['healthReminder', 'testReminder', 'communityMessage'].includes(key)) {
      return
    }

    this.persistSettings({
      ...this.data.settings,
      [key]: Boolean(e.detail.value)
    })
  },

  // 只清本设备的云端数据副本（缓存）：登录态与云端数据都不受影响，
  // 清完后重新登录一次把云端权威数据同步回来，避免停留在误导性的默认值上
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本设备缓存的用耳数据、个人资料与设置副本，用于释放空间或修复显示异常。云端数据不受影响，清除后会自动重新同步。',
      cancelText: '取消',
      confirmText: '清除',
      success: res => {
        if (!res.confirm) return

        try {
          clearCache()
          const settings = getDefaultSettings()
          this.setData({
            settings,
            thresholdIndex: REMINDER_THRESHOLDS.indexOf(settings.reminderThreshold)
          })
          wx.showToast({ title: '缓存已清除', icon: 'success' })
          if (isLoggedIn()) {
            ensureLogin().then(() => this.loadSettings()).catch(() => {})
          }
        } catch (error) {
          wx.showToast({ title: '清除失败，请重试', icon: 'none' })
        }
      }
    })
  },

  // 退出登录：清掉本地会话与账号数据，云端数据完整保留
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能查看与同步数据，本设备上的缓存也会一并清除。云端数据会完整保留，下次登录即可恢复。',
      cancelText: '取消',
      confirmText: '退出登录',
      success: res => {
        if (!res.confirm) return

        logout()
        this.setData({ loggedIn: false })
        wx.showToast({ title: '已退出登录', icon: 'success' })
        setTimeout(() => wx.reLaunch({ url: SPLASH_URL }), 600)
      }
    })
  },

  // 注销账号：连云端数据一起删除，不可逆
  onDeleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '将永久删除云端的个人资料、用耳记录、听力测试记录、收藏与积分，且无法恢复。确定要注销吗？',
      cancelText: '取消',
      confirmText: '永久删除',
      confirmColor: '#ff3b30',
      success: res => {
        if (!res.confirm) return

        wx.showLoading({ title: '正在注销…', mask: true })
        callUser('deleteAccount')
          .then(() => {
            wx.hideLoading()
            logout()
            this.setData({ loggedIn: false })
            wx.showToast({ title: '账号已注销', icon: 'success' })
            setTimeout(() => wx.reLaunch({ url: SPLASH_URL }), 600)
          })
          .catch(error => {
            wx.hideLoading()
            wx.showModal({
              title: '注销失败',
              content: (error && error.message) || '网络异常，请稍后再试',
              showCancel: false
            })
          })
      }
    })
  }
})
