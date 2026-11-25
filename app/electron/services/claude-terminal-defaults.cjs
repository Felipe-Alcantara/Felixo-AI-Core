'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { CLAUDE_CONFIG_OPTIONS, findOption, isValueApplicable } = require('./claude-config-catalog.cjs')

/**
 * Padrão das opções da aba Config para os terminais NOVOS do Claude no app: um conjunto global e
 * exceções por conta. Fica num arquivo do app (userData); o `settings.json` e o `~/.claude.json` da
 * pessoa nunca são lidos nem gravados. A opção sem entrada segue o padrão do próprio Claude.
 *
 * Formato: `{ version: 1, global: { chave: valor }, accounts: { idDaConta: { chave: valor | null } } }`.
 * Na conta, `null` quer dizer "padrão do Claude" (ignora o global); sem a chave, segue o global.
 */

const FILE_NAME = 'terminal-defaults.json'
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_.:@-]{1,100}$/

function emptyState() {
  // accounts sem protótipo: o ID da conta vem de fora e `__proto__` casa com o padrão de ID.
  return { version: 1, global: {}, accounts: Object.create(null) }
}

function ownEntries(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : []
}

/** Descarta o que o catálogo não reconhece: um arquivo editado à mão não vira chave solta no Claude. */
function sanitizeState(raw) {
  const state = emptyState()
  for (const [key, value] of ownEntries(raw?.global)) {
    const option = findOption(key)
    if (option && isValueApplicable(option, value)) state.global[key] = value
  }
  for (const [accountId, entries] of ownEntries(raw?.accounts)) {
    if (!ACCOUNT_ID_PATTERN.test(accountId)) continue
    const clean = {}
    for (const [key, value] of ownEntries(entries)) {
      const option = findOption(key)
      if (option && (value === null || isValueApplicable(option, value))) clean[key] = value
    }
    if (Object.keys(clean).length > 0) state.accounts[accountId] = clean
  }
  return state
}

function createClaudeTerminalDefaults({ baseDir, fileSystem = fs } = {}) {
  const filePath = path.join(baseDir, FILE_NAME)

  function read() {
    try {
      return sanitizeState(JSON.parse(fileSystem.readFileSync(filePath, 'utf8')))
    } catch {
      return emptyState()
    }
  }

  function write(state) {
    fileSystem.mkdirSync(baseDir, { recursive: true })
    const temporary = `${filePath}.${process.pid}.tmp`
    fileSystem.writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8')
    fileSystem.renameSync(temporary, filePath)
  }

  /**
   * @param {{ key: string, accountId?: string | null, value?: boolean | string | null, clear?: boolean }} change
   * `clear` remove a entrada (global: volta ao padrão do app (o do Claude, se a opção não tiver `appDefault`); conta: volta a seguir o global).
   */
  function set({ key, accountId = null, value, clear = false } = {}) {
    const option = findOption(key)
    if (!option) return { ok: false, message: 'Opção desconhecida.' }
    if (accountId !== null && !ACCOUNT_ID_PATTERN.test(String(accountId))) {
      return { ok: false, message: 'Conta inválida.' }
    }
    if (!clear && !(value === null && accountId !== null) && !isValueApplicable(option, value)) {
      return { ok: false, message: 'Esta opção não pode ser aplicada pelo app com esse valor.' }
    }
    const state = read()
    const target = accountId === null ? state.global : (state.accounts[accountId] ??= {})
    if (clear) delete target[key]
    else target[key] = value
    if (accountId !== null && Object.keys(target).length === 0) delete state.accounts[accountId]
    try {
      write(state)
    } catch {
      return { ok: false, message: 'Não foi possível gravar o padrão dos terminais.' }
    }
    return { ok: true }
  }

  /**
   * Efeito para um terminal: chaves do `--settings`, argumentos e ambiente da CLI, e de onde veio
   * cada valor (`origins`: 'account' | 'global'). `fastModeRequested`: o padrão pede o modo fast e falta
   * a confirmação deste terminal.
   */
  function resolve(accountId = null, { fastModeConfirmed = false } = {}) {
    const state = read()
    const merged = new Map()
    // Padrão do app: vale enquanto o global não tiver a chave (null no global = "padrão do Claude").
    for (const option of CLAUDE_CONFIG_OPTIONS) {
      if (option.appDefault !== undefined && !(option.key in state.global)) {
        merged.set(option.key, { value: option.appDefault, origin: 'global' })
      }
    }
    for (const [key, value] of Object.entries(state.global)) merged.set(key, { value, origin: 'global' })
    const exceptions = accountId && ACCOUNT_ID_PATTERN.test(accountId) ? state.accounts[accountId] ?? {} : {}
    for (const [key, value] of Object.entries(exceptions)) merged.set(key, { value, origin: 'account' })

    const launch = { settings: {}, args: [], env: {}, origins: {}, fastModeRequested: false }
    for (const [key, { value, origin }] of merged) {
      launch.origins[key] = origin
      if (value === null) continue
      const option = findOption(key)
      // Opção que cobra: sem a confirmação deste terminal, não entra no --settings.
      if (option.confirmEachTerminal && value === true && !fastModeConfirmed) {
        launch.fastModeRequested = true
        continue
      }
      if (option.source === 'settings') {
        launch.settings[key] = value
      } else if (option.override?.flags) {
        launch.args.push(...option.override.flags[String(value)])
      } else if (option.override?.env) {
        launch.env[option.override.env] = option.override.values[String(value)]
      }
    }
    return launch
  }

  return { filePath, read, resolve, set }
}

module.exports = { createClaudeTerminalDefaults }
