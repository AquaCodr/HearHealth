// 登录页
Page({
  data: {
    userInfo: null,
  },

  onLogin() {
    // 微信授权弹窗，获取用户信息（昵称、头像）
    // 注意：2022 年后 getUserProfile 返回匿名信息（灰色头像、昵称为"微信用户"），
    // 正式项目如需真实头像昵称，请改用"头像昵称填写能力"
    // （button open-type="chooseAvatar" + input type="nickname"）
    wx.getUserProfile({
      desc: "用于团队协作展示你的身份",
      success: (res) => {
        const userInfo = res.userInfo;
        // 保存登录状态到本地
        wx.setStorageSync("userInfo", userInfo);
        wx.setStorageSync("isLoggedIn", true);
        this.setData({ userInfo });

        wx.showToast({ title: "登录成功", icon: "success" });
        // 跳转到主开发页（redirectTo：登录页不留在历史栈中）
        setTimeout(() => {
          wx.redirectTo({ url: "/pages/index/index" });
        }, 500);
      },
      fail: () => {
        wx.showToast({ title: "已取消登录", icon: "none" });
      },
    });
  },
});
