'use strict'

/**
 * @module onboarding-ipc-handlers
 * Canais `onboarding:read` e `onboarding:write` do tutorial do canvas.
 *
 * O processo principal é a única autoridade do estado do tutorial: o SQLite é
 * compartilhado entre processos, e o compare-and-set do repositório impede que
 * duas janelas ou dois processos mostrem o mesmo tour. A leitura também devolve
 * a versão do app (só contexto, gravado junto) e a política de automação
 * decidida aqui, no molde do `hardware:get-profile`.
 */

const { toErrorResult } = require('./ipc-result.cjs')
const {
  compareAndSetOnboardingState,
  readOnboardingState,
} = require('./storage/onboarding-state-repository.cjs')

/** Teto do valor serializado; o renderer respeita o mesmo limite. */
const MAX_ONBOARDING_VALUE_BYTES = 64 * 1024
const MAX_APP_VERSION_LENGTH = 128

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Valida o pedido de escrita vindo do renderer.
 *
 * @returns {{ ok: true, expectedRevision: number, value: object } | { ok: false, message: string }}
 */
function validateWriteRequest(request) {
  if (!isPlainObject(request)) return { ok: false, message: 'Pedido de escrita do tutorial inválido.' }
  const { expectedRevision, value } = request
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, message: 'Revisão esperada do tutorial inválida.' }
  }
  if (!isPlainObject(value) || !Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    return { ok: false, message: 'Estado do tutorial inválido.' }
  }
  let serialized
  try {
    serialized = JSON.stringify(value)
  } catch {
    return { ok: false, message: 'Estado do tutorial não serializável.' }
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_ONBOARDING_VALUE_BYTES) {
    return { ok: false, message: 'Estado do tutorial acima do limite de 64 KiB.' }
  }
  // Grava a forma JSON (a mesma que a leitura devolve), nunca o objeto clonado.
  return { ok: true, expectedRevision, value: JSON.parse(serialized) }
}

function safeAppVersion(getAppVersion) {
  try {
    const version = getAppVersion?.()
    return typeof version === 'string' && version && version.length <= MAX_APP_VERSION_LENGTH ? version : null
  } catch {
    return null
  }
}

/**
 * Registra os canais do tutorial.
 *
 * @param {{
 *   ipcMain: { handle: (channel: string, handler: Function) => void },
 *   database: unknown,
 *   getAppVersion?: () => string,
 *   automation: { autoOpen: boolean, reason: string },
 *   now?: () => number,
 * }} options
 */
function registerOnboardingIpcHandlers({ ipcMain, database, getAppVersion, automation, now = () => Date.now() }) {
  if (!ipcMain?.handle) throw new Error('ipcMain obrigatório para os canais do tutorial.')
  const policy = Object.freeze({ autoOpen: automation?.autoOpen === true, reason: String(automation?.reason ?? 'produto') })

  ipcMain.handle('onboarding:read', () => {
    try {
      const state = readOnboardingState(database)
      return {
        ok: true,
        revision: state.revision,
        value: state.value,
        corrupted: state.corrupted,
        appVersion: safeAppVersion(getAppVersion),
        automation: { ...policy },
      }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível ler o estado do tutorial.')
    }
  })

  ipcMain.handle('onboarding:write', (_event, request) => {
    const validation = validateWriteRequest(request)
    if (!validation.ok) return validation
    try {
      const result = compareAndSetOnboardingState(database, {
        expectedRevision: validation.expectedRevision,
        value: validation.value,
        nowIso: new Date(now()).toISOString(),
      })
      return { ok: true, ...result }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível gravar o estado do tutorial.')
    }
  })
}

module.exports = {
  MAX_ONBOARDING_VALUE_BYTES,
  registerOnboardingIpcHandlers,
  validateWriteRequest,
}
