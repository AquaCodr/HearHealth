// app.js
const { ensureLogin } = require("./utils/auth");
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
    // 静默登录：云函数端按 OPENID 建档/合并资料，失败不阻塞启动
    ensureLogin().catch(() => {});
  },

  onShow() {
    // 前台期间累计用耳时长并定期采样音量（用耳时长的代理指标）
    usageTracker.onAppShow();
  },

  onHide() {
    usageTracker.onAppHide();
  },
});
