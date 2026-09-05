const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  buildHearingAnalysisUserPrompt
} = require('./prompts')
const {
  SCHEMA_VERSION,
  HEARING_ANALYSIS_SCHEMA,
  validateHearingAnalysis
} = require('./schemas')
const {
  QwenClientError,
  getQwenConfig,
  requestHearingAnalysis,
  requestHearingHealthChat
} = require('./qwen-client')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const TEST_COLLECTION = 'test_records'
const ANALYSIS_COLLECTION = 'ai_test_analyses'
const MAX_CHAT_MESSAGES = 12
const MAX_CHAT_CONTENT_LENGTH = 1000
class AiFunctionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiFunctionError'
    this.code = code
  }
}

function sanitizeAnalysisText(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\b(?:data\.)?detectedLeft\s*[:=]\s*(\d+)/gi, '本次左耳在 $1 个测试频点检测到声音反应')
    .replace(/\b(?:data\.)?detectedRight\s*[:=]\s*(\d+)/gi, '本次右耳在 $1 个测试频点检测到声音反应')
    .replace(/\b(?:data\.)?detectedLeft\b/gi, '左耳检测到的测试频点数')
    .replace(/\b(?:data\.)?detectedRight\b/gi, '右耳检测到的测试频点数')
    .replace(/\b(?:data\.)?ears\.left\b/gi, '左耳各测试频点结果')
    .replace(/\b(?:data\.)?ears\.right\b/gi, '右耳各测试频点结果')
    .replace(/\b(?:data\.)?schemaVersion\s*[:=]\s*\d+/gi, '')
    .replace(/\b(?:data\.)?measurement\s*[:=]\s*['"]?relative-gain-threshold['"]?/gi, '本次采用相对音量阈值筛查')
    .replace(/\brelative-gain-threshold\b/gi, '相对音量阈值筛查')
    .replace(/\bthresholdPercent\b\s*/gi, '相对音量阈值')
    .replace(/\bschemaVersion\b/gi, '')
    .replace(/\bmeasurement\b/gi, '测试方式')
    .replace(/\bdata\./gi, '')
    .replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, '')
    .replace(/\b[a-z]{2,}(?:[A-Z][A-Za-z0-9]*)+\b/g, '')
    .replace(/\b(?:routine|monitor|professional-check)\b/gi, '')
    .replace(/```[\w-]*\s*/g, '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/#{1,6}/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/^\s*[:：,，;；|/\\–—-]+\s*/g, '')
    .replace(/\s*[:：,，;；|/\\–—-]+\s*$/g, '')
    .replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1')
    .trim()
}

function sanitizeAnalysisTextList(value) {
  if (!Array.isArray(value)) return []
  return value.map(sanitizeAnalysisText).filter(Boolean)
}

function sanitizeHearingAnalysisText(analysis) {
  return {
    ...analysis,
    overview: sanitizeAnalysisText(analysis.overview),
    findings: analysis.findings.map(item => ({
      ...item,
      title: sanitizeAnalysisText(item.title),
      explanation: sanitizeAnalysisText(item.explanation),
      evidence: sanitizeAnalysisTextList(item.evidence)
    })),
    earComparison: {
      ...analysis.earComparison,
      summary: sanitizeAnalysisText(analysis.earComparison.summary),
      caution: sanitizeAnalysisText(analysis.earComparison.caution)
    },
    recommendations: analysis.recommendations.map(item => ({
      ...item,
      text: sanitizeAnalysisText(item.text),
      reason: sanitizeAnalysisText(item.reason)
    })),
    redFlags: sanitizeAnalysisTextList(analysis.redFlags),
    limitations: sanitizeAnalysisTextList(analysis.limitations),
    disclaimer: sanitizeAnalysisText(analysis.disclaimer)
  }
}

function validateChatMessages(value) {
  if (!Array.isArray(value)) {
    throw new AiFunctionError('INVALID_CHAT_MESSAGES', '聊天消息格式无效')
  }

  const messages = []
  for (let index = value.length - 1; index >= 0 && messages.length < MAX_CHAT_MESSAGES; index -= 1) {
    const item = value[index]
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue
    if (typeof item.content !== 'string') {
      throw new AiFunctionError('INVALID_CHAT_MESSAGES', '聊天消息格式无效')
    }
    const content = item.content.trim()
    if (!content || content.length > MAX_CHAT_CONTENT_LENGTH) {
      throw new AiFunctionError('INVALID_CHAT_MESSAGES', '聊天消息内容无效')
    }
    messages.unshift({ role: item.role, content })
  }

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new AiFunctionError('INVALID_CHAT_MESSAGES', '请先输入要咨询的问题')
  }
  return messages
}

function sanitizeChatReply(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/```[\w-]*\s*/g, '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*/g, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .trim()
}

async function chatHearingHealth(event) {
  const messages = validateChatMessages(event && event.messages)
  const { model } = getQwenConfig()
  let response
  try {
    response = await requestHearingHealthChat({
      systemPrompt: CHAT_SYSTEM_PROMPT,
      messages
    })
  } catch (error) {
    logModelError('chatHearingHealth', error)
    throw new AiFunctionError(
      error instanceof QwenClientError ? error.code : 'MODEL_REQUEST_FAILED',
      error && error.message ? error.message : 'AI 助手请求失败'
    )
  }

  const reply = sanitizeChatReply(response.content)
  if (!reply) {
    throw new AiFunctionError('MODEL_INVALID_RESPONSE', 'AI 助手未返回有效内容')
  }
  return { reply, model: response.model || model }
}

function logModelError(action, error) {
  const details = error && error.debug && typeof error.debug === 'object'
    ? error.debug
    : {}
  console.error('[aiFunctions] model request failed', {
    action,
    code: String(error && error.code || 'MODEL_REQUEST_FAILED').slice(0, 128),
    httpStatus: Number.isFinite(Number(details.httpStatus)) ? Number(details.httpStatus) : null,
    providerCode: typeof details.providerCode === 'string' ? details.providerCode.slice(0, 128) : '',
    networkCode: typeof details.networkCode === 'string' ? details.networkCode.slice(0, 128) : ''
  })
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
    // 新集合创建后可能需要极短时间生效，避免首次请求立即查询时报缓存错误。
    await new Promise(resolve => setTimeout(resolve, 300))
  } catch (error) {
    // 集合已存在时 createCollection 会失败，后续真实读写负责暴露其他数据库错误。
  }
}

function validateAnalyzeEvent(event) {
  const source = event && typeof event === 'object' ? event : {}
  const testRecordId = typeof source.testRecordId === 'string' ? source.testRecordId.trim() : ''
  if (!testRecordId) {
    throw new AiFunctionError('INVALID_TEST_RECORD_ID', '测试记录标识无效')
  }
  return testRecordId
}

function createCacheId(testRecordId, promptVersion, model) {
  return crypto
    .createHash('sha256')
    .update(`${testRecordId}|${promptVersion}|${model}`)
    .digest('hex')
}

async function findOwnedTestRecord(testRecordId, openid) {
  const normalizedId = typeof testRecordId === 'string' ? testRecordId.trim() : ''
  if (!normalizedId) {
    throw new AiFunctionError('INVALID_TEST_RECORD_ID', '测试记录标识无效')
  }

  let records
  try {
    const result = await db.collection(TEST_COLLECTION)
      .where({ openid })
      .limit(100)
      .get()
    records = result && Array.isArray(result.data) ? result.data : []
  } catch (error) {
    console.error('[aiFunctions] test record lookup failed', {
      code: String(error && (error.errCode || error.code) || 'DOCUMENT_LOOKUP_FAILED').slice(0, 128)
    })
    throw new AiFunctionError('TEST_RECORD_LOOKUP_FAILED', '读取测试记录失败')
  }

  const record = records.find(item => (
    item &&
    typeof item._id === 'string' &&
    item._id === normalizedId
  )) || null
  return record && record.openid === openid ? record : null
}

async function readCompletedCache(cacheId, openid) {
  let result
  try {
    result = await db.collection(ANALYSIS_COLLECTION)
      .where({ _id: cacheId, openid })
      .limit(1)
      .get()
  } catch (error) {
    throw new AiFunctionError('CACHE_ERROR', 'AI 分析缓存暂时不可用')
  }

  const cached = result.data[0]
  if (!cached || cached.status !== 'completed') return null
  if (!validateHearingAnalysis(cached.analysis)) {
    throw new AiFunctionError('CACHE_ERROR', 'AI 分析缓存内容无效')
  }
  return cached
}

async function saveCompletedCache({ cacheId, openid, testRecordId, analysis, model }) {
  const now = new Date()
  try {
    await db.collection(ANALYSIS_COLLECTION).doc(cacheId).set({
      data: {
        openid,
        testRecordId,
        status: 'completed',
        analysis,
        model,
        promptVersion: PROMPT_VERSION,
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (error) {
    throw new AiFunctionError('CACHE_ERROR', 'AI 分析结果暂时无法保存')
  }
}

async function analyzeHearingTest(event) {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    throw new AiFunctionError('RECORD_NOT_FOUND', '没有找到可分析的测试记录')
  }

  const testRecordId = validateAnalyzeEvent(event)
  const record = await findOwnedTestRecord(testRecordId, OPENID)
  if (!record) {
    throw new AiFunctionError('RECORD_NOT_FOUND', '没有找到可分析的测试记录')
  }

  const { model } = getQwenConfig()
  await ensureCollection(ANALYSIS_COLLECTION)
  const cacheId = createCacheId(testRecordId, PROMPT_VERSION, model)
  const cached = await readCompletedCache(cacheId, OPENID)
  if (cached) {
    return {
      analysis: sanitizeHearingAnalysisText(cached.analysis),
      cached: true,
      model: cached.model,
      promptVersion: cached.promptVersion,
      schemaVersion: cached.schemaVersion
    }
  }

  let modelResponse
  try {
    modelResponse = await requestHearingAnalysis({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildHearingAnalysisUserPrompt(record),
      schema: HEARING_ANALYSIS_SCHEMA
    })
  } catch (error) {
    logModelError('analyzeHearingTest', error)
    if (error instanceof QwenClientError) {
      throw new AiFunctionError(error.code, error.message)
    }
    throw new AiFunctionError('MODEL_REQUEST_FAILED', 'AI 服务请求失败')
  }

  let analysis
  try {
    analysis = JSON.parse(modelResponse.content)
  } catch (error) {
    throw new AiFunctionError('MODEL_INVALID_RESPONSE', 'AI 返回内容无法解析')
  }
  if (!validateHearingAnalysis(analysis)) {
    throw new AiFunctionError('MODEL_INVALID_RESPONSE', 'AI 返回内容未通过安全校验')
  }
  analysis = sanitizeHearingAnalysisText(analysis)

  await saveCompletedCache({
    cacheId,
    openid: OPENID,
    testRecordId,
    analysis,
    model: modelResponse.model
  })

  return {
    analysis,
    cached: false,
    model: modelResponse.model,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION
  }
}

function errorResponse(error) {
  const allowedCodes = [
    'CONFIG_MISSING',
    'INVALID_CHAT_MESSAGES',
    'INVALID_TEST_RECORD_ID',
    'RECORD_NOT_FOUND',
    'TEST_RECORD_LOOKUP_FAILED',
    'MODEL_REQUEST_FAILED',
    'MODEL_INVALID_RESPONSE',
    'CACHE_ERROR'
  ]
  const code = allowedCodes.includes(error && error.code)
    ? error.code
    : 'MODEL_REQUEST_FAILED'
  const fallbackMessages = {
    CONFIG_MISSING: 'AI 服务尚未完成配置',
    INVALID_CHAT_MESSAGES: '聊天消息格式无效',
    INVALID_TEST_RECORD_ID: '测试记录标识无效',
    RECORD_NOT_FOUND: '没有找到可分析的测试记录',
    TEST_RECORD_LOOKUP_FAILED: '读取测试记录失败',
    MODEL_REQUEST_FAILED: 'AI 解读服务暂时不可用',
    MODEL_INVALID_RESPONSE: 'AI 返回内容暂时无法使用',
    CACHE_ERROR: 'AI 分析缓存暂时不可用'
  }
  return {
    success: false,
    error: {
      code,
      message: fallbackMessages[code]
    }
  }
}

exports.main = async event => {
  try {
    if (event && event.action === 'chatHearingHealth') {
      const data = await chatHearingHealth(event)
      return { success: true, data }
    }
    if (!event || event.action !== 'analyzeHearingTest') {
      throw new AiFunctionError('MODEL_REQUEST_FAILED', '不支持的 AI 操作')
    }
    const data = await analyzeHearingTest(event)
    return { success: true, data }
  } catch (error) {
    return errorResponse(error)
  }
}

exports._test = {
  AiFunctionError,
  errorResponse,
  sanitizeAnalysisText,
  sanitizeHearingAnalysisText,
  validateChatMessages,
  sanitizeChatReply,
  chatHearingHealth,
  analyzeHearingTest,
  createCacheId,
  validateAnalyzeEvent,
  findOwnedTestRecord,
  readCompletedCache
}
