'use strict'

const DEFAULT_JITTER_THRESHOLD = 0.5

/**
 * Runs in the renderer. It first waits for a stable run of animation frames,
 * then records a fixed number of frames so layout motion is measured rather
 * than inferred from a timeout.
 */
function sampleGeometryInFrames({ selectors, settleFrames, sampleFrames, maxWaitFrames, settleTolerance }) {
  const geometryKeys = ['left', 'top', 'right', 'bottom', 'width', 'height']
  const read = () => ({
    viewport: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      deviceScaleFactor: window.devicePixelRatio,
    },
    elements: selectors.map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return { selector, visible: false, rect: null }
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        bounds.width > 0 &&
        bounds.height > 0
      const rect = {}
      for (const key of geometryKeys) rect[key] = bounds[key]
      return { selector, visible, rect }
    }),
  })
  const closeEnough = (first, second) => {
    if (
      first.viewport.width !== second.viewport.width ||
      first.viewport.height !== second.viewport.height ||
      Math.abs(first.viewport.deviceScaleFactor - second.viewport.deviceScaleFactor) > settleTolerance
    ) return false
    return first.elements.every((item, index) => {
      const other = second.elements[index]
      if (item.visible !== other.visible) return false
      if (!item.visible) return true
      return geometryKeys.every((key) => Math.abs(item.rect[key] - other.rect[key]) <= settleTolerance)
    })
  }

  return new Promise((resolve) => {
    let framesSeen = 0
    let consecutiveStableFrames = 0
    let previous = null
    const samples = []
    const tick = () => {
      framesSeen += 1
      const current = read()
      if (previous && closeEnough(previous, current)) consecutiveStableFrames += 1
      else consecutiveStableFrames = 0
      previous = current

      if (consecutiveStableFrames >= settleFrames) {
        samples.push(current)
        if (samples.length >= sampleFrames) {
          resolve({ settled: true, framesSeen, samples })
          return
        }
      } else if (framesSeen >= maxWaitFrames) {
        resolve({ settled: false, framesSeen, consecutiveStableFrames, samples: [current] })
        return
      }

      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function summarizeGeometryStability(samples, requiredSelectors, threshold = DEFAULT_JITTER_THRESHOLD) {
  const violations = []
  const measurements = []
  const geometryKeys = ['left', 'top', 'right', 'bottom', 'width', 'height']

  for (const selector of requiredSelectors) {
    const entries = samples.map((sample) => sample.elements.find((item) => item.selector === selector))
    if (entries.some((item) => !item || !item.visible || !item.rect)) {
      violations.push({
        selector,
        reason: 'missing-or-hidden',
        observedFrames: entries.filter((item) => item?.visible && item.rect).length,
        expectedFrames: samples.length,
      })
      continue
    }

    for (const key of geometryKeys) {
      const values = entries.map((item) => item.rect[key])
      const minimum = Math.min(...values)
      const maximum = Math.max(...values)
      const delta = maximum - minimum
      measurements.push({ selector, property: key, minimum, maximum, delta })
      if (delta > threshold) {
        violations.push({ selector, reason: 'jitter', property: key, minimum, maximum, delta })
      }
    }
  }

  return {
    stable: violations.length === 0,
    thresholdCssPx: threshold,
    sampleCount: samples.length,
    measurements,
    violations,
  }
}

function findViewportOverflow(snapshot, selectors, tolerance = 1) {
  const violations = []
  for (const selector of selectors) {
    const element = snapshot.elements.find((item) => item.selector === selector)
    if (!element?.visible || !element.rect) {
      violations.push({ selector, reason: 'missing-or-hidden' })
      continue
    }
    const { left, top, right, bottom } = element.rect
    const { width, height } = snapshot.viewport
    if (left < -tolerance || top < -tolerance || right > width + tolerance || bottom > height + tolerance) {
      violations.push({
        selector,
        reason: 'outside-viewport',
        rect: { left, top, right, bottom },
        viewport: { width, height },
      })
    }
  }
  return violations
}

async function measureStableGeometry(page, label, selectors, options = {}) {
  const threshold = options.jitterThreshold ?? DEFAULT_JITTER_THRESHOLD
  const request = {
    selectors,
    settleFrames: options.settleFrames ?? 4,
    sampleFrames: options.sampleFrames ?? 12,
    maxWaitFrames: options.maxWaitFrames ?? 180,
    settleTolerance: options.settleTolerance ?? 0.25,
  }
  const capture = await page.evaluate(sampleGeometryInFrames, request)
  if (!capture.settled) {
    throw new Error(
      '[canvas-visual] ' + label + ' não estabilizou em ' +
      capture.framesSeen + ' frames; último elemento observado: ' +
      JSON.stringify(capture.samples.at(-1)?.elements),
    )
  }

  const analysis = summarizeGeometryStability(capture.samples, selectors, threshold)
  if (!analysis.stable) {
    const first = analysis.violations[0]
    throw new Error(
      '[canvas-visual] ' + label + ' falhou em ' + first.selector +
      ' (' + first.reason + (first.property ? ', ' + first.property : '') +
      '); evidência: ' + JSON.stringify(first),
    )
  }

  const viewportViolations = options.checkViewportBounds === false
    ? []
    : findViewportOverflow(capture.samples.at(-1), selectors)
  if (viewportViolations.length > 0) {
    const first = viewportViolations[0]
    throw new Error(
      '[canvas-visual] ' + label + ' encontrou elemento fora da viewport: ' +
      first.selector + '; evidência: ' + JSON.stringify(first),
    )
  }

  return {
    label,
    thresholdCssPx: analysis.thresholdCssPx,
    sampleCount: analysis.sampleCount,
    framesSeen: capture.framesSeen,
    viewport: capture.samples.at(-1).viewport,
    measurements: analysis.measurements,
  }
}

module.exports = {
  DEFAULT_JITTER_THRESHOLD,
  findViewportOverflow,
  measureStableGeometry,
  sampleGeometryInFrames,
  summarizeGeometryStability,
}
