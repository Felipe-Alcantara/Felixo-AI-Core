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
 * @param {{ sessionsDir?: string | null }} [options] `sessionsDir`: pasta da captura por
 *   terminal; só vale quando o app lança o Claude com `FELIXO_PTY_SESSION_ID` no ambiente
 * @returns {string} conteúdo do script instalado
 */
function createClaudeStatuslineScript(capturePath, { sessionsDir = null } = {}) {
  return `#!/usr/bin/env node
'use strict'

// Gerado pelo Felixo AI Core. Reinstalado a cada atualização do app.
// Lê o JSON da status line do Claude Code, guarda o rate limit para o painel
// "Limites e uso" e imprime a linha de status.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const CAPTURE_PATH = ${JSON.stringify(capturePath)}
const SESSIONS_DIR = ${JSON.stringify(sessionsDir)}
// O app lança o terminal com o ID dele no ambiente: a captura é por terminal, não por conta.
const PTY_SESSION_ID = /^[A-Za-z0-9_-]{1,100}$/.test(process.env.FELIXO_PTY_SESSION_ID || '')
  ? process.env.FELIXO_PTY_SESSION_ID
  : null

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

  if (PTY_SESSION_ID && SESSIONS_DIR) {
    captureSession(payload)
    process.stdout.write(userStatusLine(raw) ?? renderLine(payload))
    return
  }

  capture(payload)
  process.stdout.write(renderLine(payload))
})

// Lista branca: nunca pasta, caminho da transcrição, título da conversa nem texto.
function captureSession(payload) {
  if (!payload || typeof payload !== 'object') {
    return
  }

  const ctx = payload.context_window || {}
  const cost = payload.cost || {}
  const target = path.join(SESSIONS_DIR, PTY_SESSION_ID + '.json')
  const temporary = target + '.' + process.pid + '.tmp'

  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
    fs.writeFileSync(
      temporary,
      JSON.stringify({
        v: 1,
        measuredAt: new Date().toISOString(),
        version: payload.version || null,
        agentSessionId: payload.session_id || null,
        model: payload.model && payload.model.id ? payload.model.id : null,
        effort: payload.effort && payload.effort.level ? payload.effort.level : null,
        fastMode: payload.fast_mode === true,
        costUsd: cost.total_cost_usd ?? null,
        contextUsedPercent: ctx.used_percentage ?? null,
        contextWindowTokens: ctx.context_window_size ?? null,
        inputTokens: ctx.total_input_tokens ?? null,
        outputTokens: ctx.total_output_tokens ?? null,
        rateLimits: payload.rate_limits && typeof payload.rate_limits === 'object' ? payload.rate_limits : null,
      }),
      'utf8',
    )
    // Renomear é atômico: quem lê nunca vê o arquivo pela metade.
    fs.renameSync(temporary, target)
  } catch {
    // A status line nunca pode falhar por causa da captura.
  }
}

// A --settings do app vale mais que a status line da pessoa: chama a dela e mostra a saída.
function userStatusLine(stdin) {
  try {
    const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    const settings = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'))
    const line = settings && settings.statusLine
    const command = line && line.type === 'command' ? String(line.command || '') : ''

    if (!command || /felixo-statusline[.]cjs/.test(command)) {
      return null
    }

    const result = spawnSync(command, { shell: true, input: stdin, encoding: 'utf8', timeout: 3000 })
    return result.status === 0 && result.stdout ? result.stdout : null
  } catch {
    return null
  }
}

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
