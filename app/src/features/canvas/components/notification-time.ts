/** Compact "há X" label; the notifications panel only has room for one unit. */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (elapsedSeconds < 60) return 'agora'

  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`

  return `${Math.floor(hours / 24)} d`
}
