// 社区种子数据：云函数首次被调用时自动写入云数据库（community / comments 集合）
const HOUR = 3600 * 1000
const ago = hours => new Date(Date.now() - hours * HOUR)

const SEED_POSTS = [
  {
    _id: 'seed-1',
    tag: 'tip',
    nickname: '小耳朵',
    avatar: '',
    device: 'AirPods Pro 2',
    createTime: ago(48),
    title: '坚持 60-60 原则一个月，耳鸣真的缓解了',
    summary: '音量不超过 60%，连续听不超过 60 分钟。坚持一个月后，晚上安静时的耳鸣声明显变小了……',
    content: '之前因为长期高音量听歌，晚上安静下来总能听到细细的耳鸣声。后来了解到「60-60 原则」：音量不超过最大音量的 60%，连续佩戴不超过 60 分钟就休息 10 分钟。\n\n坚持了一个月，最大的变化是：\n1. 耳鸣出现的频率明显降低；\n2. 对日常音量的耐受度回来了，不再下意识把音量越调越大；\n3. 配合每 20 秒远眺的习惯，耳朵和眼睛都轻松很多。\n\n建议大家都去听力测试页自测一下，建立自己的 baseline。',
    cover: '',
    likeCount: 128,
    commentCount: 32,
    favCount: 45
  },
  {
    _id: 'seed-2',
    tag: 'tip',
    nickname: '降噪青年',
    avatar: '',
    device: 'Sony WH-1000XM5',
    createTime: ago(60),
    title: '坐地铁别再硬扛噪音了，分享我的降噪三件套',
    summary: '地铁车厢噪音常年 80dB+，长期暴露很伤听力。我的组合：主动降噪 + 正确佩戴 + 音量上限锁定……',
    content: '实测早高峰地铁车厢内噪音在 80-90dB 之间，这个强度下连续暴露 30 分钟以上就可能造成暂时性听阈偏移。\n\n我的通勤护耳三件套：\n1. 主动降噪耳机：开启降噪后不需要把音量开很大就能听清，这是护耳的核心；\n2. 正确佩戴：头戴式要完全包住耳朵，入耳式选对耳塞尺寸保证密封；\n3. 系统音量上限：在手机设置里把音量上限锁在 75dB，从根上杜绝手滑。\n\n护耳不是不听，而是聪明地听。',
    cover: '',
    likeCount: 96,
    commentCount: 21,
    favCount: 38
  },
  {
    _id: 'seed-3',
    tag: 'fail',
    nickname: '失眠的阿哲',
    avatar: '',
    device: '小米 Buds 5',
    createTime: ago(72),
    title: '通宵戴耳机听白噪音，醒来耳朵闷了一整天',
    summary: '为了助眠戴着入耳式耳机听了一整夜白噪音，第二天耳朵又闷又胀，像塞了棉花……',
    content: '昨晚失眠，想着听白噪音助眠，就戴着入耳式耳机睡着了，音量大概 40%。\n\n今早醒来右耳明显发闷，像隔着一层水听声音，还伴随轻微胀痛。持续了一整天才慢慢恢复。\n\n查了下资料：整夜佩戴会让耳道内温度湿度升高，加上持续的声音刺激，很容易引起不适。教训：\n1. 助眠请用音箱外放，或者设置 30 分钟自动关闭；\n2. 入耳式耳机真的不适合戴着睡觉；\n3. 如果闷胀感超过 24 小时不缓解，及时就医。',
    cover: '',
    likeCount: 64,
    commentCount: 28,
    favCount: 12
  },
  {
    _id: 'seed-4',
    tag: 'fail',
    nickname: '峡谷常客',
    avatar: '',
    device: '华为 FreeBuds Pro 3',
    createTime: ago(26),
    title: '音量开到底打游戏，测完听力我后悔了',
    summary: '为了听清脚步声常年满音量，昨晚在小程序测了听力，4000Hz 那个频率几乎听不见……',
    content: 'FPS 玩家，为了听清脚步声和枪声方向，耳机音量常年拉满，每天游戏 3-4 小时，这个习惯保持了两年多。\n\n昨晚用这个小程序做了听力自测，结果 4000Hz 高频段的听阈明显偏高，报告提示有早期噪音性听力损失的风险。医生说典型的噪音性损伤就是从 4000Hz 开始的。\n\n现在已经把音量降到 60% 以下，也建议大家：\n1. 游戏音效开「夜间模式」压缩动态范围，不用满音量也能听清细节；\n2. 每小时强制自己摘耳机休息；\n3. 定期自测听力，早发现早干预。',
    cover: '',
    likeCount: 152,
    commentCount: 47,
    favCount: 66
  },
  {
    _id: 'seed-5',
    tag: 'recommend',
    nickname: '数码老白',
    avatar: '',
    device: 'Bose QC Ultra',
    createTime: ago(144),
    title: '500 元档降噪耳机横评，学生党闭眼入这款',
    summary: '预算有限又想要好降噪？实测三款 500 元档热门 TWS，从降噪深度、佩戴舒适度、通话质量三个维度打分……',
    content: '最近帮表弟选耳机，顺便把 500 元档最热门的三款降噪 TWS 都借来实测了一周。\n\n降噪深度：A 款地铁低频轰鸣削减最明显，B 款人声频段稍弱，C 款整体均衡。\n佩戴舒适度：B 款单耳仅 4.1g，长时间佩戴最无感；C 款耳压感略明显。\n通话质量：C 款三麦克风波束成形在风噪下表现最好。\n\n护耳视角的结论：降噪越好，你需要的音量就越低。这个价位段优先选降噪深度和佩戴密封性好的，比追求音质对耳朵更友好。综合推荐 A 款，学生党闭眼入不亏。',
    cover: '',
    likeCount: 210,
    commentCount: 55,
    favCount: 98
  },
  {
    _id: 'seed-6',
    tag: 'recommend',
    nickname: '跑者小夏',
    avatar: '',
    device: '韶音 OpenRun Pro',
    createTime: ago(168),
    title: '骨传导耳机适合护耳吗？真实体验分享',
    summary: '骨传导不堵耳道就一定护耳？跑步党实测三个月，说说它的真实优势和两个容易踩的坑……',
    content: '因为耳道敏感换成骨传导三个月了，说说真实感受。\n\n优势：\n1. 开放耳道，跑步时能听到环境音，安全性碾压入耳式；\n2. 不闷耳，夏天长时间佩戴也不会耳道潮湿发炎。\n\n但两个坑要提醒：\n1. 骨传导同样通过内耳毛细胞感知声音，音量开太大照样伤听力，「骨传导不伤耳」是伪命题；\n2. 嘈杂环境下为了盖过环境音会不自觉加大音量，反而更危险，建议只在中低噪音环境使用。\n\n总结：骨传导是「佩戴健康」友好，但「听力保护」依然取决于你的音量习惯。',
    cover: '',
    likeCount: 88,
    commentCount: 19,
    favCount: 41
  },
  // —— 多样性演示：只有一句话 / 只有图片 / 图文 / 超长文 ——
  {
    _id: 'seed-7',
    tag: 'tip',
    nickname: '早睡人',
    avatar: '',
    device: '',
    createTime: ago(0.5),
    title: '今天把耳机音量降到 40% 了',
    summary: '今天把耳机音量降到 40% 了，感觉世界都安静下来了。',
    content: '今天把耳机音量降到 40% 了，感觉世界都安静下来了。',
    cover: '',
    likeCount: 36,
    commentCount: 9,
    favCount: 5
  },
  {
    _id: 'seed-8',
    tag: 'recommend',
    nickname: '极简玩家',
    avatar: '',
    device: '',
    createTime: ago(9),
    title: '桌面耳机收纳，一眼就爱了',
    summary: '桌面耳机收纳，一眼就爱了。',
    content: '',
    cover: '/images/ai_example2.png',
    likeCount: 254,
    commentCount: 61,
    favCount: 120
  },
  {
    _id: 'seed-9',
    tag: 'tip',
    nickname: '听书重度用户',
    avatar: '',
    device: '三星 Galaxy Buds 2 Pro',
    createTime: ago(96),
    title: '从每天戴耳机 6 小时的重度用户，到逐渐戒掉耳机依赖，我的完整心路历程与实用方法',
    summary: '这不是一篇速效干货，而是一个真实用户的长篇复盘。从一个睡觉都要戴着耳机的重度依赖者，到现在每天控制在 1 小时以内，我走了整整半年……',
    content: '先说背景：我在很长一段时间里是「耳机不离身」的重度用户——通勤戴、上班戴、跑步戴、甚至睡觉都要开着白噪音。平均每天戴耳机的时间超过 6 个小时，音量虽然不算特别大，但胜在「续航长」。\n\n转折点出现在去年体检，医生在问诊时随口提了一句「你的高频听力曲线有轻微下降」，当时我还没当回事。直到有天晚上，我突然发现自己已经很难听清冰箱运转的低频嗡嗡声了，那一瞬间真的慌了。\n\n于是我开始系统地研究和自救，用了半年时间，把每日用耳时长从 6+ 小时降到了现在的 1 小时以内。这个过程谈不上轻松，我把它完整记录下来，希望能帮到和我一样依赖耳机的朋友。\n\n【阶段一：觉察与记录】\n第一步是诚实面对自己。我用这个 App 的统计页记录每天的用耳时长和场景，坚持了两周。结果触目惊心：一天里真正「非听不可」的时间其实不到 1 小时，剩下 5 个小时全是「习惯性戴着」——比如上班摸鱼、做饭、发呆时耳机也在响。\n\n【阶段二：替代方案】\n1. 通勤改听播客/有声书代替纯音乐，因为「内容型」音频我不自觉会降低音量，而纯音乐容易越调越大；\n2. 做家务、运动时改用蓝牙音箱外放，反正周围没人，为什么不外放呢；\n3. 需要专注时用降噪但不开声音，环境声被过滤后安静同样能提升专注力。\n\n【阶段三：建立新习惯】\n- 设置每日用耳提醒，超过 1 小时就强制摘耳机休息 15 分钟；\n- 睡觉改成定时播放，30 分钟自动停止，坚决不戴耳机过夜；\n- 周末安排「无耳机日」，一天完全不戴耳机，让耳朵彻底休息。\n\n【关于复发的反思】\n这个方法不是一蹴而就的。中途我也反弹过几次——比如有段时间工作压力大，又偷偷戴回耳机熬夜听书。但关键是不要因此自责放弃，把它当成一个长期目标，允许偶尔的反复。\n\n现在我最大的感受是：耳机从「器官」变回了「工具」。它服务于我，而不是我依赖它。听力是不可逆的，耳朵一旦受损就不会自己长回来。希望还在耳机依赖中的朋友，早点开始改变，别等到听不清了才后悔。\n\n如果你也在戒耳机，欢迎在评论区分享你的方法，我们一起互相监督。',
    cover: '',
    likeCount: 486,
    commentCount: 173,
    favCount: 302
  },
  {
    _id: 'seed-10',
    tag: 'recommend',
    nickname: '降噪重度依赖',
    avatar: '',
    device: 'Sony WH-1000XM5',
    createTime: ago(3),
    title: '今天通勤路上的随身装备',
    summary: '地铁里靠它续命，三个小时的通勤终于不再是噪音地狱。',
    content: '通勤路上的核心装备，从入耳式换到头戴式后才发现，打开降噪的那一刻世界真的会安静下来。\n\n一个不成熟的小建议：在地铁、飞机这种持续噪音场景下，主动降噪远比被动降噪（单纯塞紧耳道）更护耳，因为你不再需要把音量开大去盖过环境声。',
    cover: '/images/community/sony-xm5.jpg',
    likeCount: 187,
    commentCount: 42,
    favCount: 73
  },
  {
    _id: 'seed-11',
    tag: 'recommend',
    nickname: '通勤老炮',
    avatar: '',
    device: 'AirPods Pro',
    createTime: ago(38),
    title: '我的入耳式主力',
    summary: 'iOS 生态用户基本绕不开的选项，通勤、办公、运动三场景都能扛。',
    content: '',
    cover: '/images/community/airpods-pro.png',
    likeCount: 156,
    commentCount: 38,
    favCount: 67
  }
]

const SEED_COMMENTS = [
  // 60-60 原则帖（seed-1）的评论
  { _id: 'seed-c1', postId: 'seed-1', nickname: '护耳小卫士', avatar: '', createTime: ago(46), content: '深有体会！我也是坚持 60-60 原则之后，耳朵舒服多了，顶一个。' },
  { _id: 'seed-c2', postId: 'seed-1', nickname: '耳机收藏家', avatar: '', createTime: ago(45), content: '补充一点：降噪耳机开降噪时如果感觉耳压不适，可以切换成通透模式过渡一下。' },
  { _id: 'seed-c3', postId: 'seed-1', nickname: '路人甲', avatar: '', createTime: ago(44), content: '请问楼主，音量上限锁定是在手机系统里设置的吗？安卓好像没有这个功能。' },
  { _id: 'seed-c4', postId: 'seed-1', nickname: '小耳朵', avatar: '', createTime: ago(43), content: '回复楼上：安卓部分品牌在「声音与振动」里有媒体音量限制，没有的话也可以用第三方音量管理 App。' },
  { _id: 'seed-c5', postId: 'seed-1', nickname: '早睡计划', avatar: '', createTime: ago(42), content: '看完默默把耳机音量从 80% 调到了 50%……感谢分享。' },
  { _id: 'seed-c6', postId: 'seed-1', nickname: '音频工程师老王', avatar: '', createTime: ago(41), content: '补充个专业视角：长期暴露 85dB 以上就会有累积性损伤，大家可以用小程序的统计页关注下每日暴露时长。' },
  // 长文帖（seed-9）的评论
  { _id: 'seed-c7', postId: 'seed-9', nickname: '夜跑爱好者', avatar: '', createTime: ago(90), content: '写得真好，正在戒耳机中，共勉。' },
  { _id: 'seed-c8', postId: 'seed-9', nickname: '考研人', avatar: '', createTime: ago(88), content: '图书馆外放不方便，我改成了骨传导+定时，亲测有效。' }
]

module.exports = { SEED_POSTS, SEED_COMMENTS }
