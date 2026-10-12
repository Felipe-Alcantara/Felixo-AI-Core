'use strict'

/**
 * Borda IPC do "Agente na nuvem". Sem regra de negócio: confere o formato do
 * payload, repassa só os campos conhecidos ao serviço e devolve o resultado.
 *
 * `ipcMain` e `shell` entram por injeção (como no handler de onboarding) para o
 * teste não precisar trocar `electron` na carga do módulo.
 */

const { isCloudSessionUrl } = require('./cloud-session/cloud-session-output.cjs')

const NODE_ID_MAX = 200

function fail(code, message) {
  return { ok: false, code, message }
}

function invalid(message) {
  return fail('invalid-input', message)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNodeId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= NODE_ID_MAX ? value : null
}

/** `accountId` ausente (undefined/null/'') é o Login do sistema; outro tipo é erro. */
function readAccountId(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined }
  return typeof value === 'string' ? { ok: true, value } : { ok: false }
}

/** Mensagem segura de uma exceção: sem stack e sem quebra de linha. */
function safeMessage(error, fallback) {
  const first = error instanceof Error ? error.message.split('\n')[0].trim() : ''
  return first || fallback
}

/**
 * @param {{
 *   ipcMain: { handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => void },
 *   service: { launch: Function, followUp: Function },
 *   shell: { openExternal: (url: string) => Promise<void> },
 * }} dependencies
 */
function registerCloudSessionIpcHandlers({ ipcMain, service, shell }) {
  ipcMain.handle('cloud-session:launch', async (_event, payload) => {
    if (!isRecord(payload)) return invalid('Pedido inválido.')
    const nodeId = readNodeId(payload.nodeId)
    const account = readAccountId(payload.accountId)
    if (!nodeId || typeof payload.task !== 'string' || typeof payload.cwd !== 'string' || !account.ok) {
      return invalid('Pedido inválido.')
    }

    try {
      return await service.launch({ nodeId, task: payload.task, cwd: payload.cwd, accountId: account.value })
    } catch (error) {
      return fail('unknown', safeMessage(error, 'Não foi possível criar a sessão na nuvem.'))
    }
  })

  ipcMain.handle('cloud-session:follow-up', async (_event, payload) => {
    if (!isRecord(payload)) return invalid('Pedido inválido.')
    const nodeId = readNodeId(payload.nodeId)
    const account = readAccountId(payload.accountId)
    if (
      !nodeId ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.text !== 'string' ||
      typeof payload.cwd !== 'string' ||
      !account.ok
    ) {
      return invalid('Pedido inválido.')
    }

    try {
      return await service.followUp({
        nodeId,
        sessionId: payload.sessionId,
        text: payload.text,
        cwd: payload.cwd,
        accountId: account.value,
      })
    } catch (error) {
      return fail('unknown', safeMessage(error, 'Não foi possível enviar a mensagem.'))
    }
  })

  // Só o link de sessão do claude.ai/code: o cartão nunca abre outro endereço.
  ipcMain.handle('cloud-session:open', async (_event, payload) => {
    const url = isRecord(payload) ? payload.url : undefined
    if (!isCloudSessionUrl(url)) return invalid('O endereço não é uma sessão do Claude.')

    try {
      await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return fail('unknown', safeMessage(error, 'Não foi possível abrir o navegador.'))
    }
  })
}

module.exports = { registerCloudSessionIpcHandlers }
