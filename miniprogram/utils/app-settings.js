const STORAGE_KEY = 'hearHealthSettings'
const SETTINGS_VERSION = 1
const REMINDER_THRESHOLDS = [1, 2, 3, 4]

const DEFAULT_SETTINGS = {
  reminderThreshold: 2,
  healthReminder: true,
  testReminder: true,
  communityMessage: true,
  version: SETTINGS_VERSION
}

function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS }
}

function normalizeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {}
  const reminderThreshold = Number(source.reminderThreshold)

  return {
    reminderThreshold: REMINDER_THRESHOLDS.includes(reminderThreshold)
      ? reminderThreshold
      : DEFAULT_SETTINGS.reminderThreshold,
    healthReminder: typeof source.healthReminder === 'boolean'
      ? source.healthReminder
      : DEFAULT_SETTINGS.healthReminder,
    testReminder: typeof source.testReminder === 'boolean'
      ? source.testReminder
      : DEFAULT_SETTINGS.testReminder,
    communityMessage: typeof source.communityMessage === 'boolean'
      ? source.communityMessage
      : DEFAULT_SETTINGS.communityMessage,
    version: SETTINGS_VERSION
  }
}

function getSettings() {
  try {
    const storedSettings = wx.getStorageSync(STORAGE_KEY)
    return storedSettings
      ? normalizeSettings(storedSettings)
      : getDefaultSettings()
  } catch (error) {
    return getDefaultSettings()
  }
}

function saveSettings(settings) {
  const normalizedSettings = normalizeSettings(settings)
  wx.setStorageSync(STORAGE_KEY, normalizedSettings)
  return { ...normalizedSettings }
}

module.exports = {
  STORAGE_KEY,
  SETTINGS_VERSION,
  REMINDER_THRESHOLDS,
  DEFAULT_SETTINGS,
  getDefaultSettings,
  getSettings,
  saveSettings
}
