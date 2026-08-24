const MAIN_WINDOW_STATE_KEY = 'window.main.state'
const WINDOW_STATE_SAVE_DELAY_MS = 250

function normalizeBounds(value) {
  if (!value || typeof value !== 'object') return null

  const { x, y, width, height } = value
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

function normalizeWindowState(value) {
  if (!value || typeof value !== 'object') return null

  const bounds = normalizeBounds(value.bounds)
  if (!bounds) return null

  return {
    bounds,
    isMaximized: value.isMaximized === true,
    isFullScreen: value.isFullScreen === true,
  }
}

function displayWorkArea(display) {
  return normalizeBounds(display?.workArea ?? display?.bounds)
}

function boundsIntersect(left, right) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

function isBoundsVisible(bounds, displays) {
  return displays
    .map(displayWorkArea)
    .filter(Boolean)
    .some((workArea) => boundsIntersect(bounds, workArea))
}

function centerBounds(defaultBounds, display) {
  const workArea = displayWorkArea(display)
  if (!workArea) {
    return { x: 0, y: 0, width: defaultBounds.width, height: defaultBounds.height }
  }

  const width = Math.min(defaultBounds.width, workArea.width)
  const height = Math.min(defaultBounds.height, workArea.height)
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  }
}

/**
 * Pure decision for restoring a window safely in a changing multi-monitor setup.
 */
function resolveWindowState(savedState, displays, primaryDisplay, defaultBounds) {
  const normalized = normalizeWindowState(savedState)
  const fallbackBounds = centerBounds(defaultBounds, primaryDisplay ?? displays[0])
  const bounds = normalized && isBoundsVisible(normalized.bounds, displays)
    ? normalized.bounds
    : fallbackBounds

  return {
    bounds,
    isMaximized: normalized?.isMaximized === true,
    isFullScreen: normalized?.isFullScreen === true,
  }
}

function captureWindowState(browserWindow) {
  const isMaximized = browserWindow.isMaximized()
  const isFullScreen = browserWindow.isFullScreen()
  const bounds = (isMaximized || isFullScreen) && browserWindow.getNormalBounds
    ? browserWindow.getNormalBounds()
    : browserWindow.getBounds()

  return { bounds, isMaximized, isFullScreen }
}

function applyWindowState(browserWindow, state) {
  if (state.isFullScreen) {
    browserWindow.setFullScreen(true)
  } else if (state.isMaximized) {
    browserWindow.maximize()
  }
}

function registerWindowStatePersistence(browserWindow, settingsRepository) {
  if (!settingsRepository) return () => {}

  let saveTimer = null
  const save = () => {
    saveTimer = null
    try {
      settingsRepository.set(MAIN_WINDOW_STATE_KEY, captureWindowState(browserWindow))
    } catch {
      // Persisting convenience state must never prevent closing or moving.
    }
  }
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(save, WINDOW_STATE_SAVE_DELAY_MS)
  }
  const saveNow = () => {
    if (saveTimer) clearTimeout(saveTimer)
    save()
  }
  const deferredEvents = ['resize', 'move']
  const immediateEvents = ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'close']

  deferredEvents.forEach((event) => browserWindow.on(event, scheduleSave))
  immediateEvents.forEach((event) => browserWindow.on(event, saveNow))
  return () => {
    if (saveTimer) clearTimeout(saveTimer)
    deferredEvents.forEach((event) => browserWindow.removeListener(event, scheduleSave))
    immediateEvents.forEach((event) => browserWindow.removeListener(event, saveNow))
  }
}

module.exports = {
  MAIN_WINDOW_STATE_KEY,
  applyWindowState,
  boundsIntersect,
  captureWindowState,
  isBoundsVisible,
  normalizeWindowState,
  registerWindowStatePersistence,
  resolveWindowState,
}
