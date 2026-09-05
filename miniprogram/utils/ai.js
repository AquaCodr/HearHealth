class AiRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiRequestError'
    this.code = code
  }
}

function callAi(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'aiFunctions',
    data: { action, ...data }
  }).then(response => {
    const result = response.result || {}
    if (result.success !== true) {
      const error = result.error || {}
      throw new AiRequestError(
        error.code || 'MODEL_REQUEST_FAILED',
        error.message || 'AI 解读服务暂时不可用'
      )
    }
    return result.data
  }).catch(error => {
    const requestError = error instanceof AiRequestError
      ? error
      : new AiRequestError('MODEL_REQUEST_FAILED', 'AI 解读服务暂时不可用')
    console.warn('[ai] request failed', { action, code: requestError.code })
    throw requestError
  })
}

function analyzeHearingTest(testRecordId) {
  const normalizedId = typeof testRecordId === 'string' ? testRecordId.trim() : ''
  return callAi('analyzeHearingTest', { testRecordId: normalizedId })
}

function chatHearingHealth(messages) {
  return callAi('chatHearingHealth', {
    messages: Array.isArray(messages) ? messages : []
  })
}

module.exports = {
  AiRequestError,
  callAi,
  analyzeHearingTest,
  chatHearingHealth
}
