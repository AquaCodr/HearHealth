// 开发注意事项页（协作流程）
Page({
  data: {
    metaphors: [
      {
        icon: "📝",
        name: "commit（保存快照）",
        desc: "把当前改动存成一个版本，只在你电脑上",
      },
      {
        icon: "⬆️",
        name: "push（上传）",
        desc: "把本地快照上传到你自己的 GitHub 仓库",
      },
      {
        icon: "⬇️",
        name: "pull（下载）",
        desc: "把 GitHub 上的最新代码同步到本地",
      },
    ],
    steps: [
      {
        title: "Fork 仓库并克隆（仅首次）",
        desc: "打开 https://github.com/ShenChenkai/HearHealth 点右上角 Fork，复制到自己的账号下，再克隆你自己的那份",
        cmd: ["git clone git@github.com:你的用户名/HearHealth.git"],
        cmdTip: "把'你的用户名'换成你自己的 GitHub 昵称",
      },
      {
        title: "开始开发前先拉取最新代码",
        desc: "每次写代码前先同步原仓库的最新改动，避免在旧代码上开发",
        cmd: ["git pull"],
        cmdTip: "把 GitHub 上的最新代码下载到本地",
      },
      {
        title: "改完代码后提交",
        desc: "把改动存成快照，并写清楚这次改了什么",
        cmd: ["git add .", "git commit -m \"添加了xxx功能\""],
        cmdTip: "引号里写本次改动的内容，让审核的人看懂",
      },
      {
        title: "推送代码到自己仓库",
        desc: "把本地提交上传到你自己 Fork 的 GitHub 仓库",
        cmd: ["git push"],
        cmdTip: "先 git pull 再 push，减少冲突",
      },
      {
        title: "发起 Pull Request（PR）",
        desc: "打开你自己 GitHub 仓库的页面 → 点 Compare & pull request → 写清楚改了什么 → 点 Create pull request",
        cmd: ["（在 GitHub 网页上操作，无需命令）"],
        cmdTip: "组长审核通过后会自动合并，无需你操作",
      },
      {
        title: "收到修改意见怎么办",
        desc: "按意见改完代码，重新 add → commit → push，PR 会自动更新，不需要重新发起",
        cmd: ["git add .", "git commit -m \"按反馈修改\"", "git push"],
        cmdTip: "同一个 PR 可以反复修改，直到审核通过",
      },
    ],
    conflict: {
      title: "冲突了怎么办（两个人都改了同一个文件时）",
      desc: "pull 后出现冲突，打开冲突的文件，会看到这样的标记：",
      exampleBefore: [
        "<<<<<<< HEAD",
        "这里是你的代码（保留）",
        "=======",
        "这里是队友的代码（也要保留）",
        ">>>>>>> 分支名",
      ],
      steps: [
        "把两部分代码都保留，只删掉 <<<<<<< ======= >>>>>>> 这三行标记",
        "然后重新执行：git add . → git commit → git push",
      ],
    },
    tips: [
      "不要直接修改主仓库（ShenChenkai/HearHealth），所有改动都通过 PR 提交",
      "project.private.config.json 是个人本地配置，已自动忽略，不要手动提交",
      "新设备首次打开项目，需在微信开发者工具中重新选择云开发环境 ID",
      "拿不准的命令先问组长，别乱执行删除类命令",
    ],
  },

  // 开发完成后一键隐藏悬浮按钮（在 index 页生效）
  hideEntry() {
    wx.showModal({
      title: "隐藏入口",
      content: "开发完成后将不再显示悬浮按钮，此操作可在开发工具中清除缓存恢复。确认隐藏吗？",
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync("hideCollabEntry", true);
          wx.showToast({ title: "已隐藏", icon: "success" });
          setTimeout(() => wx.navigateBack(), 500);
        }
      },
    });
  },
});
