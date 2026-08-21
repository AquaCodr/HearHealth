// 协作说明页
Page({
  data: {
    userInfo: {},
    metaphors: [
      {
        icon: "📝",
        name: "commit（保存快照）",
        desc: "把当前改动存成一个版本，只在你电脑上",
      },
      {
        icon: "⬆️",
        name: "push（上传）",
        desc: "把本地快照上传到 GitHub，大家都能看到",
      },
      {
        icon: "⬇️",
        name: "pull（下载）",
        desc: "把 GitHub 上队友的最新改动同步到本地",
      },
    ],
    steps: [
      {
        title: "加入团队 & 克隆代码（仅首次）",
        desc: "把你的 GitHub 用户名告诉组长，被加为协作者后，把仓库代码克隆到本地",
        cmd: ["git clone git@github.com:ShenChenkai/HearHealth.git"],
        cmdTip: "只需执行一次，以后不用再克隆",
      },
      {
        title: "开发前先拉取最新代码",
        desc: "每次开始写代码前先同步队友的改动，避免在旧代码上开发",
        cmd: ["git pull"],
        cmdTip: "把 GitHub 上的最新代码下载到本地",
      },
      {
        title: "改完代码后提交",
        desc: "把改动存成快照，并在说明里写清楚这次改了什么",
        cmd: ["git add .", "git commit -m \"添加了xxx功能\""],
        cmdTip: "引号里写本次改动的内容，让队友知道你干了什么",
      },
      {
        title: "先拉取再推送",
        desc: "先 pull 同步队友改动（防止冲突），再 push 上传你的代码",
        cmd: ["git pull", "git push"],
        cmdTip: "顺序不能反：先 pull 再 push，养成习惯",
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
      "推送前一定要先 git pull，否则可能覆盖队友的代码",
      "project.private.config.json 是个人本地配置，已自动忽略，不要手动提交",
      "新设备首次打开项目，需在微信开发者工具中重新选择云开发环境 ID",
      "拿不准的命令先问组长，别乱执行删除类命令",
    ],
  },

  onShow() {
    this.setData({
      userInfo: wx.getStorageSync("userInfo") || {},
    });
  },
});
