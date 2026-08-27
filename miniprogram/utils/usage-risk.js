const WARNING_PROGRESS = 70
const DANGER_PROGRESS = 90
const MAX_PROGRESS = 100
const DEFAULT_THRESHOLD_HOURS = 2
const PROGRESS_EPSILON = 1e-9

function getUsageStatus(progress) {
  if (progress >= DANGER_PROGRESS - PROGRESS_EPSILON) return 'danger'
  if (progress >= WARNING_PROGRESS - PROGRESS_EPSILON) return 'warning'
  return 'normal'
}

function calculateUsageRisk(usageSeconds, thresholdHours) {
  const seconds = Math.max(0, Number(usageSeconds) || 0)
  const parsedThreshold = Number(thresholdHours)
  const safeThresholdHours = Number.isFinite(parsedThreshold) && parsedThreshold > 0
    ? parsedThreshold
    : DEFAULT_THRESHOLD_HOURS
  const thresholdMinutes = safeThresholdHours * 60
  const rawProgress = seconds / (thresholdMinutes * 60) * WARNING_PROGRESS
  const progressPercent = Math.min(Math.max(rawProgress, 0), MAX_PROGRESS)

  return {
    usageSeconds: seconds,
    thresholdMinutes,
    progressPercent,
    status: getUsageStatus(rawProgress)
  }
}

module.exports = {
  WARNING_PROGRESS,
  DANGER_PROGRESS,
  MAX_PROGRESS,
  calculateUsageRisk,
  getUsageStatus
}
