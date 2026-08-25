const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const { SEED_POSTS, SEED_COMMENTS } = require('./seedData')

const TAGS = {
  tip: '护耳妙招',
  fail: '用耳翻车',
  recommend: '耳机安利'
}

// 确保集合存在（不存在则创建，已存在则忽略报错）
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) {
    // 集合已存在
  }
}

// 集合为空时自动写入种子数据（幂等：种子记录带固定 _id，重复写入会失败被忽略）
async function seedIfEmpty() {
  await ensureCollection('community')
  await ensureCollection('comments')

  const postsCount = (await db.collection('community').count()).total
  if (postsCount === 0) {
    await Promise.all(
      SEED_POSTS.map(p => db.collection('community').add({ data: p }).catch(() => {}))
    )
  }

  const commentsCount = (await db.collection('comments').count()).total
  if (commentsCount === 0) {
    await Promise.all(
      SEED_COMMENTS.map(c => db.collection('comments').add({ data: c }).catch(() => {}))
    )
  }
}

function withTagLabel(post) {
  return { ...post, tagLabel: TAGS[post.tag] || '' }
}

// 根据 comments 集合实时统计每个帖子的真实评论数，返回 { [postId]: count }
async function countCommentsByPosts(postIds) {
  if (!postIds.length) return {}
  // 云数据库 command.in 单次上限 100，分片查询后合并
  const result = {}
  const CHUNK = 100
  for (let i = 0; i < postIds.length; i += CHUNK) {
    const ids = postIds.slice(i, i + CHUNK)
    const res = await db.collection('comments').where({ postId: _.in(ids) }).limit(1000).get()
    res.data.forEach(c => {
      result[c.postId] = (result[c.postId] || 0) + 1
    })
    // 评论总数超过单页上限时翻页累加
    let total = res.data.length
    while (total === 1000) {
      const more = await db.collection('comments')
        .where({ postId: _.in(ids) })
        .skip(total)
        .limit(1000)
        .get()
      more.data.forEach(c => {
        result[c.postId] = (result[c.postId] || 0) + 1
      })
      total = more.data.length
    }
  }
  return result
}

// 帖子列表：tag 传 'all' 或具体板块 key
async function listPosts(event) {
  await seedIfEmpty()
  const collection = db.collection('community')
  const condition = event.tag && event.tag !== 'all' ? collection.where({ tag: event.tag }) : collection
  const res = await condition.orderBy('createTime', 'desc').limit(50).get()
  const posts = res.data.map(withTagLabel)
  // 用真实评论数覆盖存储字段，保证与详情页一致
  const counts = await countCommentsByPosts(posts.map(p => p._id))
  posts.forEach(p => {
    p.commentCount = counts[p._id] || 0
  })
  return { success: true, data: posts }
}

// 帖子详情
async function getPost(event) {
  await seedIfEmpty()
  try {
    const res = await db.collection('community').doc(event.id).get()
    if (!res.data) return { success: true, data: null }
    const post = withTagLabel(res.data)
    // 用真实评论数覆盖存储字段，保证与广场列表一致
    const count = await db.collection('comments').where({ postId: event.id }).count()
    post.commentCount = count.total
    return { success: true, data: post }
  } catch (e) {
    // doc 不存在时 SDK 会抛错
    return { success: true, data: null }
  }
}

// 发布帖子（images 为云存储 fileID 数组，cover 取第一张）
async function addPost(event) {
  const { OPENID } = cloud.getWXContext()
  const { tag, title, content, summary, nickname, avatar, device, images } = event
  const imgList = Array.isArray(images) ? images : []
  const post = {
    tag,
    title,
    content: content || '',
    summary: summary || (content && content.length > 60 ? content.slice(0, 60) + '…' : content || ''),
    nickname: nickname || '耳友',
    avatar: avatar || '',
    device: device || '',
    openid: OPENID || '',
    images: imgList,
    cover: imgList[0] || '',
    likeCount: 0,
    commentCount: 0,
    favCount: 0,
    createTime: new Date()
  }
  const res = await db.collection('community').add({ data: post })
  return { success: true, data: { _id: res._id } }
}

// 我的帖子：按当前用户 openid 查询（未登录时为匿名，返回空）
async function myPosts(event) {
  await seedIfEmpty()
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: true, data: [] }
  const res = await db.collection('community')
    .where({ openid: OPENID })
    .orderBy('createTime', 'desc')
    .limit(50)
    .get()
  const posts = res.data.map(withTagLabel)
  // 用真实评论数覆盖存储字段，与详情页保持一致
  const counts = await countCommentsByPosts(posts.map(p => p._id))
  posts.forEach(p => {
    p.commentCount = counts[p._id] || 0
  })
  return { success: true, data: posts }
}

// 评论列表
async function listComments(event) {
  const res = await db.collection('comments')
    .where({ postId: event.postId })
    .orderBy('createTime', 'asc')
    .limit(100)
    .get()
  return { success: true, data: res.data }
}

// 发表评论（同时给帖子评论数 +1）
async function addComment(event) {
  const { postId, nickname, avatar, content } = event
  const comment = {
    postId,
    nickname: nickname || '耳友',
    avatar: avatar || '',
    content,
    createTime: new Date()
  }
  const res = await db.collection('comments').add({ data: comment })
  await db.collection('community').doc(postId).update({
    data: { commentCount: _.inc(1) }
  }).catch(() => {})
  return { success: true, data: { _id: res._id, ...comment } }
}

// 更新计数（点赞 / 收藏），字段白名单校验
async function updateCount(event) {
  const FIELDS = ['likeCount', 'favCount', 'commentCount']
  if (FIELDS.indexOf(event.field) < 0) {
    return { success: false, errMsg: 'invalid field' }
  }
  await db.collection('community').doc(event.id).update({
    data: { [event.field]: _.inc(event.delta || 1) }
  })
  return { success: true }
}

// 云函数入口：按 event.type 分发，统一返回 { success, data }
exports.main = async (event) => {
  try {
    switch (event.type) {
      case 'listPosts':
        return await listPosts(event)
      case 'getPost':
        return await getPost(event)
      case 'addPost':
        return await addPost(event)
      case 'myPosts':
        return await myPosts(event)
      case 'listComments':
        return await listComments(event)
      case 'addComment':
        return await addComment(event)
      case 'updateCount':
        return await updateCount(event)
      default:
        return { success: false, errMsg: `unknown type: ${event.type}` }
    }
  } catch (e) {
    return { success: false, errMsg: e.message || String(e) }
  }
}
