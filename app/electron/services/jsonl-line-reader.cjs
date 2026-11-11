function createJsonlLineReader(onLine) {
  // Pedaços da linha ainda sem `\n`: juntados uma vez só, quando a linha fecha. Refazer o split do
  // pendente inteiro a cada push era quadrático numa linha longa que chega em muitos pedaços.
  let pending = []

  return {
    push(chunk) {
      const text = String(chunk)
      let start = 0
      let newline = text.indexOf('\n')

      while (newline !== -1) {
        const piece = text.slice(start, newline)
        const line = pending.length > 0 ? `${pending.join('')}${piece}` : piece
        pending = []
        // O `\r` de um CRLF (mesmo partido entre pedaços) sai no `trim` de `emitLine`.
        emitLine(onLine, line)
        start = newline + 1
        newline = text.indexOf('\n', start)
      }

      if (start < text.length) {
        pending.push(start === 0 ? text : text.slice(start))
      }
    },
    flush() {
      emitLine(onLine, pending.join(''))
      pending = []
    },
  }
}

function emitLine(onLine, line) {
  const trimmedLine = line.trim()

  if (trimmedLine) {
    onLine(trimmedLine)
  }
}

module.exports = {
  createJsonlLineReader,
}
