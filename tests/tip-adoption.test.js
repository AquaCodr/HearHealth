const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const projectRoot = path.resolve(__dirname, '..')
const {
  TIP_ADOPTION_REWARD,
  TIP_ADOPTION_SOURCE_TYPE,
  buildAdoptionLedgerId,
  getAdoptionIssue,
  buildAdoptionLedger
} = require('../cloudfunctions/communityFunctions/tipAdoption')

test('只有带作者身份的护耳妙招可以进入采纳流程', () => {
  assert.equal(getAdoptionIssue(null), '帖子不存在')
  assert.equal(getAdoptionIssue({ tag: 'question', openid: 'author' }), '只有护耳妙招可以被采纳')
  assert.equal(getAdoptionIssue({ tag: 'tip', openid: '' }), '该帖子没有可识别的作者，无法发放积分')
  assert.equal(getAdoptionIssue({ tag: 'tip', openid: 'author' }), '')
})

test('已采纳帖子不会再次发放积分', () => {
  assert.equal(
    getAdoptionIssue({ tag: 'tip', openid: 'author', adopted: true }),
    'already-adopted'
  )
})

test('同一帖子生成固定流水号和固定 100 积分奖励', () => {
  const createdAt = new Date('2026-09-01T00:00:00.000Z')
  const firstId = buildAdoptionLedgerId('post-123')
  const secondId = buildAdoptionLedgerId('post-123')
  const ledger = buildAdoptionLedger({
    postId: 'post-123',
    authorOpenid: 'author-openid',
    createdAt
  })

  assert.equal(firstId, secondId)
  assert.ok(firstId.length <= 32)
  assert.equal(TIP_ADOPTION_REWARD, 100)
  assert.equal(ledger.points, 100)
  assert.equal(ledger.sourceType, TIP_ADOPTION_SOURCE_TYPE)
  assert.equal(ledger.sourceId, 'post-123')
  assert.equal(ledger.openid, 'author-openid')
})

test('采纳接口只信任云端管理员与固定奖励，并使用数据库事务', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'cloudfunctions/communityFunctions/index.js'),
    'utf8'
  )

  assert.match(source, /case 'adoptTip'/)
  assert.match(source, /cloud\.getWXContext\(\)/)
  assert.match(source, /isAdmin\(OPENID\)/)
  assert.match(source, /db\.runTransaction/)
  assert.match(source, /collection\('points_ledger'\)/)
  assert.doesNotMatch(source, /event\.points/)
})
