function createJsonlOutputGuard(onJsonChunk, onNonJsonOutput) {
  let pendingOutput = ''
  let didInspectOutput = false

  return {
    push(chunk) {
      if (didInspectOutput) {
        onJsonChunk(chunk)
        return
      }

      pendingOutput += chunk

      const output = removeByteOrderMark(pendingOutput).trimStart()

      if (!output) {
        return
      }

      didInspectOutput = true

      if (!output.startsWith('{')) {
        onNonJsonOutput(pendingOutput)
        pendingOutput = ''
        return
      }

      onJsonChunk(pendingOutput)
      pendingOutput = ''
    },
  }
}

function removeByteOrderMark(value) {
  return String(value).replace(/^\uFEFF/, '')
}

module.exports = {
  createJsonlOutputGuard,
}
