const STORAGE_KEY = 'hearHealthUserProfile'
const PROFILE_VERSION = 2
const MAX_NICKNAME_LENGTH = 20
const MAX_BIO_LENGTH = 40
const MAX_DEVICE_MODEL_LENGTH = 40
const DEFAULT_BIO = '关注听力健康，从每天开始'

const DEFAULT_USER_PROFILE = {
  nickname: '耳朵守护者',
  avatar: '/images/icons/avatar.png',
  bio: DEFAULT_BIO,
  deviceModel: '',
  updatedAt: 0,
  version: PROFILE_VERSION
}

function getDefaultUserProfile() {
  return { ...DEFAULT_USER_PROFILE }
}

function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeUserProfile(profile) {
  const source = profile && typeof profile === 'object' ? profile : {}
  const hasBio = Object.prototype.hasOwnProperty.call(source, 'bio')
  return {
    nickname: normalizeText(source.nickname),
    avatar: typeof source.avatar === 'string' ? source.avatar.trim() : '',
    bio: hasBio ? normalizeText(source.bio) : DEFAULT_BIO,
    deviceModel: normalizeText(source.deviceModel),
    updatedAt: Number.isFinite(source.updatedAt) && source.updatedAt >= 0
      ? source.updatedAt
      : 0,
    version: PROFILE_VERSION
  }
}

function validateUserProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return { valid: false, message: '用户资料格式无效' }
  }
  if (!profile.nickname) {
    return { valid: false, message: '昵称不能为空' }
  }
  if (profile.nickname.length > MAX_NICKNAME_LENGTH) {
    return { valid: false, message: `昵称不能超过 ${MAX_NICKNAME_LENGTH} 个字符` }
  }
  if (!profile.avatar) {
    return { valid: false, message: '头像路径无效' }
  }
  if (profile.bio.length > MAX_BIO_LENGTH) {
    return { valid: false, message: `个人签名不能超过 ${MAX_BIO_LENGTH} 个字符` }
  }
  if (profile.deviceModel.length > MAX_DEVICE_MODEL_LENGTH) {
    return { valid: false, message: `耳机型号不能超过 ${MAX_DEVICE_MODEL_LENGTH} 个字符` }
  }
  return { valid: true, message: '' }
}

function getUserProfile() {
  let storedProfile
  try {
    storedProfile = wx.getStorageSync(STORAGE_KEY)
  } catch (error) {
    return getDefaultUserProfile()
  }

  if (!storedProfile) return getDefaultUserProfile()

  const normalizedProfile = normalizeUserProfile(storedProfile)
  const validation = validateUserProfile(normalizedProfile)
  return validation.valid ? normalizedProfile : getDefaultUserProfile()
}

function saveUserProfile(profile) {
  const normalizedProfile = normalizeUserProfile(profile)
  normalizedProfile.updatedAt = Date.now()

  const validation = validateUserProfile(normalizedProfile)
  if (!validation.valid) {
    throw new Error(validation.message)
  }

  wx.setStorageSync(STORAGE_KEY, normalizedProfile)
  return { ...normalizedProfile }
}

module.exports = {
  STORAGE_KEY,
  PROFILE_VERSION,
  MAX_NICKNAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_DEVICE_MODEL_LENGTH,
  DEFAULT_BIO,
  DEFAULT_USER_PROFILE,
  getDefaultUserProfile,
  getUserProfile,
  saveUserProfile,
  validateUserProfile
}
