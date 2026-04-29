const MIN_ZOOM_LEVEL = -3
const MAX_ZOOM_LEVEL = 3
const ZOOM_STEP = 0.5

function registerWindowZoomShortcuts(browserWindow) {
  browserWindow.webContents.on('before-input-event', (event, input) => {
    const action = getZoomAction(input)

    if (!action) {
      return
    }

    event.preventDefault()
    applyZoomAction(browserWindow.webContents, action)
  })
}

function applyZoomAction(webContents, action) {
  if (action === 'reset') {
    webContents.setZoomLevel(0)
    return
  }

  const currentZoomLevel = webContents.getZoomLevel()
  const direction = action === 'in' ? 1 : -1
  const nextZoomLevel = clampZoomLevel(
    currentZoomLevel + direction * ZOOM_STEP,
  )

  webContents.setZoomLevel(nextZoomLevel)
}

function getZoomAction(input) {
  if (
    input.type !== 'keyDown' ||
    input.alt ||
    (!input.control && !input.meta)
  ) {
    return null
  }

  const key = normalizeKey(input.key)

  if (key === '+' || key === '=') {
    return 'in'
  }

  if (key === '-' || key === '_') {
    return 'out'
  }

  if (key === '0') {
    return 'reset'
  }

  return null
}

function normalizeKey(key) {
  return String(key ?? '').toLowerCase()
}

function clampZoomLevel(value) {
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, value))
}

module.exports = {
  applyZoomAction,
  clampZoomLevel,
  getZoomAction,
  registerWindowZoomShortcuts,
}
