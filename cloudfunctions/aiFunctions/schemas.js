const SCHEMA_VERSION = 1
const RECOMMENDATION_PRIORITIES = ['routine', 'monitor', 'professional-check']

const HEARING_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', const: SCHEMA_VERSION },
    overview: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          evidence: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['title', 'explanation', 'evidence']
      }
    },
    earComparison: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        caution: { type: 'string' }
      },
      required: ['summary', 'caution']
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          priority: {
            type: 'string',
            enum: RECOMMENDATION_PRIORITIES
          },
          text: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['priority', 'text', 'reason']
      }
    },
    redFlags: {
      type: 'array',
      items: { type: 'string' }
    },
    limitations: {
      type: 'array',
      items: { type: 'string' }
    },
    disclaimer: { type: 'string' }
  },
  required: [
    'schemaVersion',
    'overview',
    'findings',
    'earComparison',
    'recommendations',
    'redFlags',
    'limitations',
    'disclaimer'
  ]
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every(key => allowedKeys.includes(key))
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function validateHearingAnalysis(value) {
  const rootKeys = [
    'schemaVersion',
    'overview',
    'findings',
    'earComparison',
    'recommendations',
    'redFlags',
    'limitations',
    'disclaimer'
  ]
  if (!isPlainObject(value) || !hasOnlyKeys(value, rootKeys)) return false
  if (value.schemaVersion !== SCHEMA_VERSION) return false
  if (typeof value.overview !== 'string' || typeof value.disclaimer !== 'string') return false
  if (!Array.isArray(value.findings) || !Array.isArray(value.recommendations)) return false
  if (!isStringArray(value.redFlags) || !isStringArray(value.limitations)) return false

  const comparison = value.earComparison
  if (
    !isPlainObject(comparison) ||
    !hasOnlyKeys(comparison, ['summary', 'caution']) ||
    typeof comparison.summary !== 'string' ||
    typeof comparison.caution !== 'string'
  ) return false

  const findingsValid = value.findings.every(item => (
    isPlainObject(item) &&
    hasOnlyKeys(item, ['title', 'explanation', 'evidence']) &&
    typeof item.title === 'string' &&
    typeof item.explanation === 'string' &&
    isStringArray(item.evidence)
  ))
  if (!findingsValid) return false

  return value.recommendations.every(item => (
    isPlainObject(item) &&
    hasOnlyKeys(item, ['priority', 'text', 'reason']) &&
    RECOMMENDATION_PRIORITIES.includes(item.priority) &&
    typeof item.text === 'string' &&
    typeof item.reason === 'string'
  ))
}

module.exports = {
  SCHEMA_VERSION,
  HEARING_ANALYSIS_SCHEMA,
  validateHearingAnalysis
}
