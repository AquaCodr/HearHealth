const {
  REMINDER_THRESHOLDS,
  getDefaultSettings,
  getSettings,
  saveSettings
} = require('../../utils/app-settings')
const { callUser, isLoggedIn } = require('../../utils/auth')

const THRESHOLD_OPTIONS = REMINDER_THRESHOLDS.map(value => `${value}小时`)

Page({
  data: {
    settings: getDefaultSettings(),
    thresholdOptions: THRESHOLD_OPTIONS,
    thresholdIndex: 1
  },

  onShow() {
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

  onClearLocalData() {
    wx.showModal({
      title: '清除本地数据',
      content: '此操作将清除个人资料、测试记录、设置等保存在当前设备上的数据，且无法恢复。是否继续？',
      cancelText: '取消',
      confirmText: '清除',
      confirmColor: '#ff3b30',
      success: res => {
        if (!res.confirm) return

        try {
          wx.clearStorageSync()
          const settings = getDefaultSettings()
          this.setData({
            settings,
            thresholdIndex: REMINDER_THRESHOLDS.indexOf(settings.reminderThreshold)
          })
          wx.showToast({ title: '本地数据已清除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: '清除失败，请重试', icon: 'none' })
        }
      }
    })
  }
})
