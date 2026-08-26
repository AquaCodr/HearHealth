// 开屏页 —— 微信授权登录入口
// 已登录（本地有会话）直接进首页；未登录先自动静默登录一次，
// 失败时停留本页展示一键登录按钮，由用户手动重试或跳过。
const { ensureLogin, isLoggedIn } = require('../../utils/auth')

Page({
  data: {
    loggingIn: false,
    errorMsg: ''
  },

  onLoad() {
    this.hasNavigated = false
    if (isLoggedIn()) {
      this.enterApp()
      return
    }
    // 未登录：开屏自动尝试一次静默登录，失败则展示手动登录按钮
    this.performLogin(false)
  },

  performLogin(manual) {
    if (this.data.loggingIn || this.hasNavigated) return
    if (manual) {
      this.setData({ loggingIn: true, errorMsg: '' })
    }

    ensureLogin()
      .then(() => {
        // 手动登录时给一个成功反馈再进入，静默登录直接进
        if (manual) {
          wx.showToast({ title: '登录成功', icon: 'success', duration: 600 })
        }
        setTimeout(() => this.enterApp(), manual ? 400 : 0)
      })
      .catch(error => {
        console.error('[splash] 登录失败：', error)
        const detail = (error && error.message) || '网络异常，请稍后重试'
        this.setData({
          errorMsg: manual ? `登录失败：${detail}` : '自动登录未成功，可点击下方按钮重试'
        })
      })
      .finally(() => {
        if (manual) this.setData({ loggingIn: false })
      })
  },

  enterApp() {
    if (this.hasNavigated) return
    this.hasNavigated = true
    wx.switchTab({ url: '/pages/home/home' })
  },

  onLoginTap() {
    this.performLogin(true)
  },

  onSkipTap() {
    // 跳过登录：以游客身份进入，之后可在“我的”页面补登录
    this.enterApp()
  }
})
