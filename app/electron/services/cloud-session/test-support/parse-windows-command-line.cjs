'use strict'

/**
 * Parser de referência da regra documentada pela Microsoft para
 * `CommandLineToArgvW` / argv do CRT: 2n barras antes de aspas viram n barras e
 * abrem ou fecham aspas; 2n+1 viram n barras e uma aspa literal; barras fora
 * desse caso são literais; espaço fora de aspas separa argumentos.
 */
function parseWindowsCommandLine(line) {
  const argv = []
  let current = ''
  let started = false
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const char = line[i]
    if (char === '\\') {
      let count = 0
      while (line[i] === '\\') {
        count += 1
        i += 1
      }
      started = true
      if (line[i] === '"') {
        current += '\\'.repeat(Math.floor(count / 2))
        if (count % 2 === 1) {
          current += '"'
          i += 1
        }
      } else {
        current += '\\'.repeat(count)
      }
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      started = true
      i += 1
      continue
    }
    if (!inQuotes && /\s/.test(char)) {
      if (started) argv.push(current)
      current = ''
      started = false
      i += 1
      continue
    }
    current += char
    started = true
    i += 1
  }
  if (started) argv.push(current)
  return argv
}

module.exports = { parseWindowsCommandLine }
