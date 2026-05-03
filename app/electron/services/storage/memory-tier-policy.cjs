const MESSAGE_STORAGE_TIERS = Object.freeze({
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
})

const DEFAULT_MEMORY_TIER_POLICY = Object.freeze({
  hotWindowDays: 14,
  warmWindowDays: 90,
  hotUseCount: 5,
  warmUseCount: 1,
  hotUsefulnessScore: 0.8,
  warmUsefulnessScore: 0.45,
  coldMinTokenCountForCompression: 1200,
  coldMinContentLengthForCompression: 8000,
})

function resolveMessageStorageTier(message, options = {}) {
  const policy = { ...DEFAULT_MEMORY_TIER_POLICY, ...options.policy }

  if (message?.pinned === true || message?.forceHot === true) {
    return MESSAGE_STORAGE_TIERS.HOT
  }

  const useCount = normalizeNonNegativeNumber(message?.useCount)
  const usefulnessScore = normalizeScore(message?.usefulnessScore)
  const ageDays = getMessageAgeDays(message, options.now)

  if (
    useCount >= policy.hotUseCount ||
    usefulnessScore >= policy.hotUsefulnessScore ||
    ageDays <= policy.hotWindowDays
  ) {
    return MESSAGE_STORAGE_TIERS.HOT
  }

  if (
    useCount >= policy.warmUseCount ||
    usefulnessScore >= policy.warmUsefulnessScore ||
    ageDays <= policy.warmWindowDays
  ) {
    return MESSAGE_STORAGE_TIERS.WARM
  }

  return MESSAGE_STORAGE_TIERS.COLD
}

function shouldCompactMessage(message, options = {}) {
  const policy = { ...DEFAULT_MEMORY_TIER_POLICY, ...options.policy }

  if (resolveMessageStorageTier(message, options) !== MESSAGE_STORAGE_TIERS.COLD) {
    return false
  }

  return (
    normalizeNonNegativeNumber(message?.totalTokens) >=
      policy.coldMinTokenCountForCompression ||
    String(message?.content ?? '').length >=
      policy.coldMinContentLengthForCompression
  )
}

function getMessageAgeDays(message, nowValue) {
  const now = normalizeDate(nowValue) ?? new Date()
  const anchor =
    normalizeDate(message?.lastUsedAt) ??
    normalizeDate(message?.createdAt) ??
    normalizeDate(message?.updatedAt)

  if (!anchor) {
    return Number.POSITIVE_INFINITY
  }

  const diffMs = now.getTime() - anchor.getTime()

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 0
  }

  return diffMs / 86_400_000
}

function normalizeDate(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeScore(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(value, 0), 1)
}

function normalizeNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

module.exports = {
  DEFAULT_MEMORY_TIER_POLICY,
  MESSAGE_STORAGE_TIERS,
  getMessageAgeDays,
  resolveMessageStorageTier,
  shouldCompactMessage,
}
