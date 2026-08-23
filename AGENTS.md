# HearHealth 小程序 — AI 开发协作规范（agent.md）

> 本文件是给 AI 编程代理（Claude Code / Cursor / Codex 等）和团队成员的分工与编码规范。
> **开工前必读**：本文件 → `DesignTemplate/PRD.md`（产品设计）→ `DesignTemplate/apple-DESIGN.md`（设计系统）。
> 若使用 Claude Code / Cursor，可将本文件重命名为 `AGENTS.md` 以便自动加载。

---

## 0. 项目一句话

HearHealth：用耳健康微信小程序（用耳时长统计 + 听觉测试 + 耳友圈社区 + 护耳技能库）。
**原生小程序 + 微信云开发，当前阶段只做前端（MVP 免登录）。**

> 📌 术语：「MVP」= 最小可行产品（Minimum Viable Product）——先做一版能跑通核心功能的最小版本，功能可简化、数据可用假的（演示数据），验证通过后再迭代。**本项目 MVP 的统计类数据（用耳时长、环境音量）一律直接生成演示数据，不采集真实数据。**

## 1. 技术栈（已定）

| 项 | 决策 | 理由 |
|---|---|---|
| 框架 | 原生微信小程序（WXML + WXSS + JS） | 项目已是原生云开发模板，微信开发者工具直接打开根目录即编译，无构建链，四人并行最稳 |
| 数据层 | 云数据库（前端 SDK 直连 `wx.cloud.database()`） | 已确认接云；集合设计见 §5 |
| 图表 | 优先 view/CSS 手绘（柱状图、日历热力色块）；折线图用 canvas 2d | MVP 不引第三方图表库，零依赖 |
| 纯音测试 | `wx.createWebAudioContext()` + OscillatorNode 生成 125/250/500/1000/2000/4000 Hz | 基础库 ≥2.19.0（项目已配 2.20.1）；需真机验证 |
| 样式 | 纯 WXSS + CSS 变量（`app.wxss` 的 `:root`） | `apple-theme.css` 是 Tailwind v4 格式，小程序不可用 |

**不建议**引入 Taro / uni-app / Tailwind / npm 依赖（`nodeModules` 未开启，重写成本高，实习项目求稳）。

### 关于「后端」和「统一接口」（重要，先读这段）

- **本项目没有传统后端，纯前端能跑通全部功能。** 微信云开发把"后端"变成三样东西：**云数据库**（读写数据）、**云存储**（图片/文件）、**云函数**（可选的后端逻辑），全部由小程序端 SDK 直接调用——**不需要自己搭服务器、不需要写 REST 接口、不需要会后端**。
- **「统一接口」在云开发模式下 = 三件事**（不是 REST API）：
  1. **统一数据结构**：所有读写遵循 §5 的集合字段表，字段名全组一致；
  2. **统一调用封装**：所有 `wx.cloud.database()` 调用收进 `utils/` 封装，页面不散写；
  3. **统一的云函数入口（将来需要时才用）**：要在后端跑逻辑（如聚合统计、发帖校验）时，在 `cloudfunctions/quickstartFunctions/index.js` 按 `event.type` 加一个分支，返回统一结构 `{ success, data }`——这个模式**模板已内置**（见该文件 168-184 行），前端用 `wx.cloud.callFunction({ name: 'quickstartFunctions', data: { type: 'xxx', ... } })` 调用。
- **云开发控制台就是你们的「后端管理后台」**：建集合、配权限、灌种子数据、看数据，全在控制台点鼠标完成，不需要写代码。
- **MVP 阶段预期：不需要写任何云函数。** 数据库读写前端直连即可；点赞/收藏计数用 `db.command.inc` 前端也能原子自增。云函数只留作将来扩展。

## 2. 目录与页面所有权（按 Tab 分工）

> 页面路径即 `pages/` 下的目录名，每个页面 4 个同名文件（`.js/.json/.wxml/.wxss`）。
> **公共文件只能由 owner 修改，其他人只 import / 只读，绝不改动。**

### 框架负责人（公共部分）

| 文件 | 说明 |
|---|---|
| `app.json` | pages 数组 + 4 tab 的 tabBar 配置 |
| `app.wxss` | `:root` 设计 token（px→rpx）+ 全局字体 + 通用工具类 |
| `app.js` | 云环境初始化（已有） |
| `utils/` | 日期格式化、storage 封装、云数据库封装、mock 数据兜底 |

### 首页组

| 页面 | 路径 | 要点 |
|---|---|---|
| 首页（tab 1） | `pages/home/home` | 问候语 + 进度环 + 2 入口 + 健康提示 + 本周柱状图 + 附近医院 |
| 听觉测试引导页 | `pages/test/guide` | 静态说明 + 环境清单 + 开始/跳过 |
| 听觉测试过程页 | `pages/test/process` | 3 步进度 + Web Audio 纯音 + 左右耳听阈记录 |
| 听力报告结果页 | `pages/test/report` | 评级卡 + canvas 折线 + 建议 + 分享到耳友圈 |

### 统计组

| 页面 | 路径 | 要点 |
|---|---|---|
| 统计页（tab 2） | `pages/stats/stats` | 日历热力 + 耳机/环境两张卡片 |
| 耳机使用统计详情 | `pages/stats/earphone-stats` | 时间范围切换（日/周/月）+ 音量-时间图表 + exposure 说明 |
| 环境音量统计详情 | `pages/stats/env-stats` | mock 数据 + 说明（MVP 不接麦克风） |

### 耳友圈组

| 页面 | 路径 | 要点 |
|---|---|---|
| 耳友圈广场（tab 3） | `pages/community/community` | 板块筛选 + 帖子流 + 悬浮发帖按钮 |
| 帖子详情页 | `pages/community/post-detail` | 正文 + 互动 + 评论列表 + 评论输入 |
| 发帖编辑页 | `pages/community/post-edit` | 板块/标题/内容/字数/图片占位，支持测试结果预填 |
| **帖子卡片组件（共享，owner）** | `components/post-card/` | 广场、我的帖子共用；他人只 import 不改 |

### 我的组

| 页面 | 路径 | 要点 |
|---|---|---|
| 个人中心（tab 4） | `pages/profile/profile` | 薄荷绿渐变头 + 用户信息 + 数据概览 + 入口列表 |
| 我的帖子 | `pages/profile/my-posts` | 复用 post-card，查本人帖子，空状态 |
| 设置页 | `pages/profile/settings` | 阈值单选（默认 2h）+ 3 个开关 + 清除数据 + 版本号 |
| 关于我们 | `pages/profile/about` | 纯静态文字 |
| 护耳技能库列表 | `pages/skill/list` | 分类筛选 + 技能卡片 |
| 技能详情页 | `pages/skill/detail` | 封面 emoji/渐变 + 正文 + 收藏 |

### 可选

| 页面 | 路径 |
|---|---|
| 启动页（1.5s → 首页） | `pages/splash/splash` |

> 跨组引用只通过 `wx.navigateTo` 路径跳转，不跨组改文件。
> 例：首页组跳 `pages/skill/list`（我的组），只写跳转，不碰该目录文件。

## 3. 编码规范（所有组必须遵守）

1. **设计系统唯一来源**：颜色/字号/间距/圆角一律用 `app.wxss` 的 `:root` 变量（如 `var(--color-primary)`），值来自 `DesignTemplate/apple-variables.css`（px→rpx 换算，1px = 2rpx，375 设计宽）。**禁止页面内硬编码设计值。**
2. **新增语义色**（进度环 安全绿/接近阈值黄/超阈值红、个人中心薄荷绿渐变）：统一加到 `app.wxss :root`，由框架负责人添加，不在页面里写死。建议值（iOS 系统色，贴合 Apple 风格）：绿 `#34c759`、黄 `#ffcc00`、红 `#ff3b30`、薄荷绿渐变 `#e8f9f0 → #b9f0d4`（待团队确认后写入）。
3. **字体**：全局 `font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`（SF Pro 仅 iOS，安卓自动回退）。
4. **单位**：布局用 rpx；字体字号行高字距按 token 换算（如 hero-display 56px → 112rpx）。
5. **页面 json**：页面标题、`usingComponents`（引入 post-card 等公共组件）在各自 json 配置。
6. **交互反馈**：用 `wx.showToast` / `wx.showModal`，风格统一。
7. **禁止事项**：不改其他组文件；不引 npm 依赖；不在 WXML 里写内联样式设计值；不删 app.json 里别人的页面注册。

## 4. 页面实现要点（对照 PRD §3）

- **首页**：问候语按时间段切换；进度环用 canvas 2d（或两个半圆 rotate 方案）；两入口 `navigateTo` 到 `pages/test/guide` 与 `pages/skill/list`；健康提示按当日时长阈值（<1h 绿 / 1-2h 黄 / >2h 红，阈值与设置页联动）；本周柱状图用 view 高度模拟，点击跳 `pages/stats/stats`；附近医院 mock 列表（下滑可见）。
- **测试引导**：环境要求清单 + 「开始测试」跳 process + 「跳过本次」`wx.navigateBack`。
- **测试过程**：3 步进度条（佩戴确认 → 左耳 → 右耳）；每耳 6 频率逐级测听阈（从 40dB 起，听到了降 10dB、没听到升 5dB 的简化二分）；结果存 `wx.setStorageSync('hearingResult', ...)` 后跳 report。
- **听力报告**：评级规则（按左右耳 6 频率听阈均值定级：正常 ≤20dB / 轻度 21-40 / 中度 41-60 / 重度 >60，对应 emoji 😊/🙂/😐/😟 与背景色）；左右耳折线用 canvas 2d；3 条建议固定文案；「分享到耳友圈」跳 `pages/community/post-edit?summary=...` 预填；底部免责声明小字。
- **统计页**：日历热力用 view grid，颜色深浅 = 时长；两卡片跳对应详情页。
- **耳机统计详情**：时间范围切换（日/周/月）+ 音量-时间图表 + 说明区（exposure、耳机型号）。
- **环境统计详情**：MVP 全部 mock，标注「演示数据」。
- **广场**：板块 tab 筛选；帖子流读云数据库 `posts`（权限未配/未部署时用 mock 兜底）；悬浮 + 按钮跳 post-edit；点赞/收藏本地状态 + 云更新。
- **帖子详情**：正文 + 互动 + 评论（读 `comments`，兜底预置 5-8 条 mock）+ 底部评论输入。
- **发帖编辑**：板块三选一、标题、内容、字数 0/500；图片按钮点击 `wx.showToast('开发中')`；发布写入 `posts` 后 `wx.navigateBack` 回广场。
- **个人中心**：薄荷绿渐变头部（`linear-gradient`）；用户信息用本地默认用户（昵称「耳友」+ 默认头像）；数据概览（累计用耳/测试次数/发帖数）mock 或查库。
- **我的帖子**：查 `posts` 中本人记录，复用 post-card；空状态 + 按钮跳广场。
- **技能库列表**：分类筛选；读 `articles`（需种子数据）。
- **技能详情**：封面 emoji/渐变；正文多段；收藏按钮本地状态。
- **设置**：阈值单选（1h/2h/3h/4h，默认 2h）存 storage；3 个 switch 存 storage；清除本地数据 = `wx.showModal` 确认 + `wx.clearStorageSync()`；版本号 `0.1.0`。
- **关于我们**：静态文字，约 40 行。
- **启动页（可选）**：全屏薄荷绿 + logo + 名称 + slogan，`setTimeout` 1.5s 后 `wx.reLaunch` 首页。

## 5. 云数据库设计（前端 SDK 直连）

| 集合 | 字段 | 说明 |
|---|---|---|
| `posts` | `_id, authorId, authorName, authorAvatar, device, section(护耳妙招/用耳翻车/耳机安利), title, content, images[], likes, comments, favorites, createTime` | 帖子 |
| `comments` | `_id, postId, authorName, authorAvatar, content, createTime` | 评论 |
| `articles` | `_id, category(日常护耳/耳机选购/噪音防护), title, summary, cover(emoji 或渐变色), content[], reads, favorites, createTime` | 技能库文章（需种子数据） |
| `hearing_tests` | `_id, authorId, date, leftEar[], rightEar[], rating, device` | 测试记录 |

- **权限**：控制台设置「所有用户可读，仅创建者可读写自己的记录」；`articles` 种子数据用云控制台手动插入或写一个临时云函数导入。
- **前端兜底**：云数据库不可用（未部署/权限未配）时，页面用 mock 数据渲染，**不允许白屏/崩溃**。云调用统一走 `utils/` 封装，方便后续切换。

## 6. 启动步骤（框架负责人先做，然后各组并行）

1. **预生成全部页面**：按 §2 建好每个页面目录 + 4 个 stub 文件，全部注册进 `app.json`（pages 数组 + 4 tab 的 tabBar，图标先省略用纯文字）。
2. **写入设计 token**：`app.wxss` 加 `:root` 变量（从 `apple-variables.css` px→rpx 换算）+ 全局字体 + 语义色。
3. **清理模板页**：删除 `pages/login`、`pages/collab`、`pages/example`（或仅保留不动，推荐删除）。
4. 提交一次 **「chore: 框架初始化（页面骨架 + 设计 token）」**。
5. 之后各 tab 组并行开发，**只碰自己的页面目录**。
6. 云开发控制台建集合 + 配权限 + 灌 `articles` 种子数据。

> 这样 app.json 在初始化后不再需要并行修改，避免 git 冲突。

## 7. 给 AI 代理的通用规则

1. **动手前必读**：本文件、`DesignTemplate/PRD.md`、`DesignTemplate/apple-DESIGN.md`、`app.wxss`。
2. 只改自己负责的文件；公共文件非 owner 不动。
3. 每页完成自检：DevTools 编译无报错；跳转路径与实际页面一致；无硬编码设计值；单位用 rpx。
4. 提交信息规范：`feat(首页): 首页进度环` / `fix(耳友圈): 评论加载`；提交前先 `git pull --rebase`。
5. 需求以 PRD.md 为准，PRD 未写明的先问团队，**不要自行发明**。
6. 页面间传参用 `wx.navigateTo` 的 url 参数或 `wx.setStorageSync`，跨组不共享全局变量。
