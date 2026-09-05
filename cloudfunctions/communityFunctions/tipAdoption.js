const crypto = require('crypto')

const TIP_ADOPTION_REWARD = 100
const TIP_ADOPTION_SOURCE_TYPE = 'tip-adopted'

function normalizePostId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : ''
}

function buildAdoptionLedgerId(postId) {
  const normalizedId = normalizePostId(postId)
  if (!normalizedId) return ''
  const digest = crypto.createHash('sha256').update(normalizedId).digest('hex').slice(0, 24)
  return `ta_${digest}`
}

function getAdoptionIssue(post) {
  if (!post) return '帖子不存在'
  if (post.tag !== 'tip') return '只有护耳妙招可以被采纳'
  if (!post.openid) return '该帖子没有可识别的作者，无法发放积分'
  if (post.adopted === true) return 'already-adopted'
  return ''
}

function buildAdoptionLedger({ postId, authorOpenid, createdAt }) {
  return {
    openid: authorOpenid,
    title: '护耳妙招被采纳',
    points: TIP_ADOPTION_REWARD,
    sourceType: TIP_ADOPTION_SOURCE_TYPE,
    sourceId: normalizePostId(postId),
    createdAt
  }
}

module.exports = {
  TIP_ADOPTION_REWARD,
  TIP_ADOPTION_SOURCE_TYPE,
  normalizePostId,
  buildAdoptionLedgerId,
  getAdoptionIssue,
  buildAdoptionLedger
}
