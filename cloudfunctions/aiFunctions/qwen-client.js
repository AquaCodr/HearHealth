const https = require('https')
const { URL } = require('url')

const REQUEST_TIMEOUT_MS = 45000
const MAX_RESPONSE_BYTES = 1024 * 1024

class QwenClientError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'QwenClientError'
    this.code = code
    this.statusCode = details.statusCode
    this.debug = details.debug || null
  }
}

function safeString(value, maxLength = 1000) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : String(value)
  return text.slice(0, maxLength)
}

function parseResponseBody(rawBody) {
  if (!rawBody) return null
  try {
    return JSON.parse(rawBody)
  } catch (error) {
    return rawBody
  }
}

function buildProviderDebug({ response, responseBody }) {
  const providerError = responseBody && typeof responseBody === 'object'
    ? responseBody.error
    : null
  const providerCode = responseBody && typeof responseBody === 'object'
    ? responseBody.code || (providerError && providerError.code)
    : ''

  return {
    httpStatus: Number(response && response.statusCode) || 0,
    providerCode: safeString(providerCode, 256)
  }
}

function buildNetworkDebug(error) {
  return {
    networkCode: safeString(error && error.code, 128)
  }
}

function createNetworkRequestError(error) {
  return new QwenClientError(
    'MODEL_REQUEST_FAILED',
    'AI 服务网络请求失败',
    { debug: buildNetworkDebug(error) }
  )
}

function getQwenConfig() {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || '').trim()
  const baseUrl = String(process.env.DASHSCOPE_BASE_URL || '').trim().replace(/\/+$/, '')
  const model = String(process.env.DASHSCOPE_MODEL || '').trim()

  if (!apiKey || !baseUrl || !model) {
    throw new QwenClientError('CONFIG_MISSING', 'AI 服务尚未完成配置')
  }

  let endpoint
  try {
    endpoint = new URL(`${baseUrl}/chat/completions`)
  } catch (error) {
    throw new QwenClientError('CONFIG_MISSING', 'AI 服务地址配置无效')
  }
  if (endpoint.protocol !== 'https:') {
    throw new QwenClientError('CONFIG_MISSING', 'AI 服务地址必须使用 HTTPS')
  }

  return { apiKey, endpoint, model }
}

function postJson(endpoint, apiKey, payload) {
  const body = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    let request
    try {
      request = https.request({
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: REQUEST_TIMEOUT_MS
      }, response => {
        const chunks = []
        let receivedBytes = 0

        response.on('data', chunk => {
          receivedBytes += chunk.length
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            request.destroy(new QwenClientError('MODEL_INVALID_RESPONSE', 'AI 响应内容过大'))
            return
          }
          chunks.push(chunk)
        })

        response.on('end', () => {
          const responseText = Buffer.concat(chunks).toString('utf8')
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const responseBody = parseResponseBody(responseText)
            reject(new QwenClientError(
              'MODEL_REQUEST_FAILED',
              'AI 服务请求失败',
              {
                statusCode: response.statusCode,
                debug: buildProviderDebug({
                  response,
                  responseBody
                })
              }
            ))
            return
          }

          try {
            resolve(JSON.parse(responseText))
          } catch (error) {
            reject(new QwenClientError('MODEL_INVALID_RESPONSE', 'AI 服务返回了无效响应'))
          }
        })
      })
    } catch (error) {
      reject(createNetworkRequestError(error))
      return
    }

    request.on('timeout', () => {
      request.destroy(new QwenClientError(
        'MODEL_REQUEST_FAILED',
        'AI 服务请求超时',
        {
          debug: {
            networkCode: 'REQUEST_TIMEOUT'
          }
        }
      ))
    })
    request.on('error', error => {
      if (error instanceof QwenClientError) {
        reject(error)
        return
      }
      reject(createNetworkRequestError(error))
    })
    try {
      request.write(body)
      request.end()
    } catch (error) {
      reject(createNetworkRequestError(error))
    }
  })
}

async function requestHearingAnalysis({ systemPrompt, userPrompt, schema }) {
  const config = getQwenConfig()
  const response = await postJson(config.endpoint, config.apiKey, {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    enable_thinking: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'hearing_analysis',
        strict: true,
        schema
      }
    }
  })

  const content = response && response.choices && response.choices[0] &&
    response.choices[0].message && response.choices[0].message.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new QwenClientError('MODEL_INVALID_RESPONSE', 'AI 服务未返回有效分析内容')
  }

  return { content, model: config.model }
}

async function requestHearingHealthChat({ systemPrompt, messages }) {
  const config = getQwenConfig()
  const response = await postJson(config.endpoint, config.apiKey, {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    enable_thinking: false
  })

  const content = response && response.choices && response.choices[0] &&
    response.choices[0].message && response.choices[0].message.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new QwenClientError('MODEL_INVALID_RESPONSE', 'AI 助手未返回有效内容')
  }

  return { content, model: config.model }
}

module.exports = {
  QwenClientError,
  getQwenConfig,
  requestHearingAnalysis,
  requestHearingHealthChat
}
