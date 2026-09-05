// app.js
const { ensureLogin, grantConsent, hasConsent, isLoggedIn } = require("./utils/auth");
const usageTracker = require("./utils/usage-tracker");

App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env: "cloud1-d0gtoekxv3cf11259",
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }
    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true,
    });
    // 已有会话：启动时静默同步云端档案（建档/合并资料），失败不阻塞启动；
    // 未登录：不在后台偷偷建档，首次登录交由开屏页引导用户手动完成（issue #36）
    if (isLoggedIn()) {
      // 授权记录是后加的老用户没有这条记录，已有会话视为当初已同意，避免被判成未授权
      if (!hasConsent()) grantConsent();
      ensureLogin().catch(() => {});
    }
  },

  onShow() {
    // 前台期间累计用耳时长并定期采样音量（用耳时长的代理指标）
    usageTracker.onAppShow();
  },

  onHide() {
    usageTracker.onAppHide();
  },
});
