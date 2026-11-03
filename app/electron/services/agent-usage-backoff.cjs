'use strict'

const RATE_LIMIT_PATTERN =
  /\b(?:429|rate[\s_-]?limit(?:ed)?|too[\s_-]+many[\s_-]+requests|resource[\s_-]+exhausted)\b/i
const RETRY_AFTER_PATTERN =
  /\bretry[-_\s]?after\b["']?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s|minutes?|m|hours?|h)?/i

/** Devolve apenas sinais estruturados; o texto de origem nunca é retido. */
function getRateLimitDetails(message, now = Date.now()) {
  const text = String(message ?? '')
  const retryAfterMs = parseRetryAfterMs(text, now)
  return {
    rateLimited: RATE_LIMIT_PATTERN.test(text) || retryAfterMs !== null,
    ...(retryAfterMs === null ? {} : { retryAfterMs }),
  }
}

/** Lê Retry-After em delta-seconds/duração ou data HTTP. */
function parseRetryAfterMs(message, now = Date.now()) {
  const text = String(message ?? '')
  const duration = RETRY_AFTER_PATTERN.exec(text)
  if (duration) {
    const value = Number(duration[1])
    const unit = duration[2]?.toLowerCase()
    const multiplier =
      unit === 'ms' || unit === 'millisecond' || unit === 'milliseconds'
        ? 1
        : unit === 'm' || unit === 'minute' || unit === 'minutes'
          ? 60_000
          : unit === 'h' || unit === 'hour' || unit === 'hours'
            ? 3_600_000
            : 1_000
    return toSafeDelay(value * multiplier)
  }

  const header = /\bretry[-_\s]?after\b["']?\s*[:=]\s*([^\r\n]+)/i.exec(text)
  if (!header) return null
  const retryAt = Date.parse(header[1].trim())
  if (!Number.isFinite(retryAt)) return null
  return toSafeDelay(Math.max(0, retryAt - Number(now)))
}

function toSafeDelay(value) {
  if (!Number.isFinite(value) || value <= 0) return null
  const delay = Math.ceil(value)
  return Number.isSafeInteger(delay) ? delay : null
}

module.exports = { getRateLimitDetails, parseRetryAfterMs }
