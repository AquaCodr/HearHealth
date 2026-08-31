// 开屏页 —— 微信授权登录入口
// 已登录（本地有会话）直接进首页；未登录停留在本页，由用户勾选协议后主动登录，
// 或跳过以游客身份浏览（游客期间的数据只存在本机，issue #36）。
const {
  grantConsent,
  hasConsent,
  isLoggedIn,
  login,
  revokeConsent
} = require('../../utils/auth')

// 开屏最小展示时长（毫秒）：保证品牌画面可被看清，再进入首页
const MIN_SPLASH_MS = 2000
const HOME_URL = '/pages/home/home'

// 协议摘要：正式文本可后续接入网页/页面，这里先给出可读的要点
const AGREEMENTS = {
  terms: {
    title: '用户协议（摘要）',
    content:
      '1. 听力测试与用耳统计仅用于健康参考，不构成医学诊断，也不能替代专业听力检查。\n' +
      '2. 登录后我们会为你的微信账号建立档案，用于跨设备同步用耳记录、听力测试记录、收藏与积分。\n' +
      '3. 不登录也能使用大部分功能，此时数据只保存在本机。\n' +
      '4. 你可以随时在「设置」中退出登录或注销账号，注销后云端数据将被永久删除。'
  },
  privacy: {
    title: '隐私政策（摘要）',
    content:
      '1. 身份来自微信 OPENID，我们不会向第三方出售或共享你的个人数据。\n' +
      '2. 登录前，小程序不会向云端上传任何属于你的数据；游客模式下用耳记录与测试结果仅保存在本机。\n' +
      '3. 用耳时长以小程序前台停留时间估算，并按天存储；听力测试结果用于生成报告与 AI 解读。\n' +
      '4. 你可在「设置 - 注销账号」中一次性删除云端全部数据。'
  }
}

Page({
  data: {
    loggingIn: false,
    errorMsg: '',
    agreed: false,
    // 已有会话的老用户：不展示登录按钮与协议勾选，只走品牌动画后进入
    loggedIn: false
  },

  onLoad(options) {
    this.hasNavigated = false
    this.loadedAt = Date.now()
    // 从「我的」等页面过来补登录时带上回跳地址，登录后回到原页面而不是首页
    this.redirectTo = options && options.redirect ? String(options.redirect) : ''

    if (isLoggedIn()) {
      // 已登录：这里的自动进入是「会话恢复」，不会再向云端建档（issue #36 改造后
      // 建档只发生在用户主动点登录并勾选协议时），但不该再露出登录入口误导用户
      this.setData({ loggedIn: true })
      this.enterApp()
      return
    }
    // 未登录：停留本页展示协议勾选 + 一键登录，由用户手动登录或跳过
    this.setData({ agreed: hasConsent() })
  },

  onToggleAgree() {
    // 勾选即写入授权记录，取消勾选立即撤销：授权状态与界面保持一致
    if (this.data.agreed) {
      revokeConsent()
      this.setData({ agreed: false, errorMsg: '' })
      return
    }

    grantConsent()
    this.setData({ agreed: true, errorMsg: '' })
  },

  onAgreementTap(e) {
    const type = e.currentTarget.dataset.type
    const agreement = AGREEMENTS[type]
    if (!agreement) return

    wx.showModal({
      title: agreement.title,
      content: agreement.content,
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  performLogin() {
    if (this.data.loggingIn || this.hasNavigated) return

    if (!this.data.agreed) {
      // 未勾选协议时不发起建档请求：云端建档必须发生在用户明确同意之后
      this.setData({ errorMsg: '请先阅读并同意《用户协议》与《隐私政策》' })
      return
    }

    this.setData({ loggingIn: true, errorMsg: '' })

    login()
      .then(() => {
        // 手动登录：先给一个成功反馈，再进入首页
        wx.showToast({ title: '登录成功', icon: 'success', duration: 600 })
        setTimeout(() => this.enterApp(), 400)
      })
      .catch(error => {
        console.error('[splash] 登录失败：', error)
        const detail = (error && error.message) || '网络异常，请稍后重试'
        this.setData({ errorMsg: `登录失败：${detail}` })
      })
      .finally(() => {
        this.setData({ loggingIn: false })
      })
  },

  enterApp() {
    if (this.hasNavigated) return
    this.hasNavigated = true

    // 已从别的页面进来补登录：不再等开屏动画，登录后尽快回到原页面
    const fromOtherPage = Boolean(this.redirectTo) || getCurrentPages().length > 1
    const elapsed = Date.now() - (this.loadedAt || 0)
    const delay = fromOtherPage ? 0 : Math.max(0, MIN_SPLASH_MS - elapsed)

    setTimeout(() => {
      if (this.redirectTo) {
        // 回跳地址可能是 tab 页（如「我的」），先按 tab 跳，失败再按普通页跳
        wx.switchTab({
          url: this.redirectTo,
          fail: () => {
            wx.navigateTo({
              url: this.redirectTo,
              fail: () => wx.switchTab({ url: HOME_URL })
            })
          }
        })
        return
      }
      if (getCurrentPages().length > 1) {
        wx.navigateBack({
          fail: () => wx.switchTab({ url: HOME_URL })
        })
        return
      }
      wx.switchTab({ url: HOME_URL })
    }, delay)
  },

  onLoginTap() {
    this.performLogin()
  },

  onSkipTap() {
    // 跳过登录：以游客身份进入，之后可在"我的"页面补登录
    this.enterApp()
  }
})
