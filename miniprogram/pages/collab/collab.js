// 协作说明页
Page({
  data: {
    userInfo: {},
    steps: [
      {
        title: "克隆仓库",
        desc: "git clone git@github.com:ShenChenkai/HearHealth.git（首次）",
      },
      {
        title: "拉取最新代码",
        desc: "每次动手前先执行 git pull，同步队友的改动",
      },
      {
        title: "开发 + 提交",
        desc: "改完代码执行 git add . → git commit -m '描述' → git push",
      },
      {
        title: "解决冲突",
        desc: "push 前 pull 出现冲突时，保留双方代码，删除 <<<<<<< ======= >>>>>>> 标记后重新提交",
      },
    ],
    tips: [
      "推送前一定要先 git pull，避免覆盖队友的代码",
      "project.private.config.json 是本地配置，已加入 .gitignore，不要手动提交",
      "首次打开项目需在微信开发者工具中重新选择云开发环境 ID",
    ],
  },

  onShow() {
    this.setData({
      userInfo: wx.getStorageSync("userInfo") || {},
    });
  },
});
