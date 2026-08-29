'use strict'

/**
 * Script de status line do Claude Code instalado pelo Felixo AI Core.
 *
 * O Claude Code não publica rate limit em nenhum comando: os percentuais só
 * chegam no JSON que ele manda para a status line, durante a sessão. Este
 * script recebe esse JSON pelo stdin, grava o que interessa num arquivo que o
 * painel lê, e devolve uma linha de status normal — quem instalou continua
 * vendo uma status line útil, não uma linha em branco.
 *
 * O texto é gerado como string e gravado pelo processo principal, em vez de
 * ficar num arquivo solto: assim o script instalado é sempre o desta versão do
 * app e não há um segundo arquivo para manter em sincronia.
 */

/**
 * @param {string} capturePath arquivo onde o rate limit é gravado
 * @returns {string} conteúdo do script instalado
 */
function createClaudeStatuslineScript(capturePath) {
  return `#!/usr/bin/env node
'use strict'

// Gerado pelo Felixo AI Core. Reinstalado a cada atualização do app.
// Lê o JSON da status line do Claude Code, guarda o rate limit para o painel
// "Limites e uso" e imprime a linha de status.

const fs = require('node:fs')
const path = require('node:path')

const CAPTURE_PATH = ${JSON.stringify(capturePath)}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  raw += chunk
})
process.stdin.on('end', () => {
  let payload = null

  try {
    payload = JSON.parse(raw)
  } catch {
    payload = null
  }

  capture(payload)
  process.stdout.write(renderLine(payload))
})

function capture(payload) {
  const rateLimits = payload && payload.rate_limits

  if (!rateLimits || typeof rateLimits !== 'object') {
    return
  }

  try {
    fs.mkdirSync(path.dirname(CAPTURE_PATH), { recursive: true })
    fs.writeFileSync(
      CAPTURE_PATH,
      JSON.stringify({
        measuredAt: new Date().toISOString(),
        version: payload.version || null,
        rateLimits,
      }),
      'utf8',
    )
  } catch {
    // A status line nunca pode falhar por causa da captura.
  }
}

function renderLine(payload) {
  const parts = []
  const model = payload && payload.model && payload.model.display_name

  if (model) {
    parts.push(model)
  }

  const dir =
    payload &&
    payload.workspace &&
    (payload.workspace.current_dir || payload.workspace.project_dir)

  if (dir) {
    parts.push(path.basename(dir))
  }

  const used = highestUsedPercent(payload && payload.rate_limits)

  if (used !== null) {
    parts.push(used + '% do limite')
  }

  return parts.join(' · ')
}

function highestUsedPercent(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') {
    return null
  }

  let highest = null

  for (const value of Object.values(rateLimits)) {
    if (!value || typeof value !== 'object') {
      continue
    }

    for (const key of ['used_percent', 'used_percentage', 'utilization']) {
      const percent = value[key]

      if (typeof percent === 'number' && Number.isFinite(percent)) {
        highest = highest === null ? percent : Math.max(highest, percent)
      }
    }
  }

  return highest === null ? null : Math.round(highest)
}
`
}

module.exports = {
  createClaudeStatuslineScript,
}
