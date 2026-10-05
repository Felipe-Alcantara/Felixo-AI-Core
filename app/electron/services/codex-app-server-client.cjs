'use strict'

const spawnChildProcess = require('cross-spawn')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { buildAccountProcessEnv } = require('./cli-account-profiles.cjs')

/**
 * Conversa JSON-RPC com o `codex app-server --stdio` da própria CLI.
 *
 * Uma sessão abre um processo, responde ao `initialize` e manda todos os
 * pedidos de uma vez. O app-server responde cada um pelo próprio `id`, fora de
 * ordem, então uma leitura lenta (o histórico de tokens leva alguns segundos a
 * mais) não atrasa as outras.
 *
 * Pedidos `required` decidem o resultado: sem eles a sessão falha. Os opcionais
 * enriquecem a leitura; quando os obrigatórios já chegaram, eles ganham só uma
 * folga curta (`optionalGraceMs`) e quem não respondeu sai marcado como
 * `timeout`, sem esconder o que já veio.
 *
 * O processo herda o ambiente da conta (perfil de login) — nunca o de outra:
 * é o que separa os dados de duas contas Codex na mesma máquina.
 */

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_OPTIONAL_GRACE_MS = 8_000
const DEFAULT_CLIENT_NAME = 'felixo-ai-core'
const MAX_BUFFER_CHARS = 4_000_000

/**
 * @param {object} options
 * @param {(command: string, args: string[], options: object) => object} [options.spawnProcess]
 * @param {Record<string, string>} [options.accountEnv]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.optionalGraceMs]
 * @param {string} [options.clientVersion]
 * @param {Array<{ method: string, params?: unknown, required?: boolean }>} options.requests
 * @param {string} [options.timeoutMessage]
 * @param {AbortSignal | null} [options.signal] Cancelamento de fora (teto da
 *   rodada ou "Reconectar"): encerra o app-server na hora.
 * @returns {Promise<{
 *   ok: boolean,
 *   reason: null | 'spawn' | 'initialize' | 'server-error' | 'timeout' | 'exit' | 'io' | 'cancelled',
 *   message: string | null,
 *   initialize: object | null,
 *   responses: Record<string, { status: 'ok', result: unknown } | { status: 'error', message: string | null } | { status: 'timeout' }>,
 * }>}
 */
function runCodexAppServerSession({
  spawnProcess = spawnChildProcess,
  accountEnv = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  optionalGraceMs = DEFAULT_OPTIONAL_GRACE_MS,
  clientVersion = '0.0.0',
  requests,
  timeoutMessage = 'O app-server do Codex excedeu o tempo limite.',
  signal = null,
}) {
  return new Promise((resolve) => {
    let child
    let settled = false
    let buffer = ''
    let initializeResult = null
    let graceTimer = null
    const pending = new Map()
    const responses = {}

    const finish = (result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(graceTimer)
      try {
        child?.kill?.()
      } catch {
        // Não afeta o resultado; o timeout de fora também cobre órfãos.
      }
      resolve(result)
    }

    const fail = (reason, message) =>
      finish({ ok: false, reason, message, initialize: initializeResult, responses })

    // Fecha a sessão com o que chegou: pedidos sem resposta viram `timeout`.
    // Só falha se faltar um pedido obrigatório.
    const finishWithAnswers = (missingReason, missingMessage) => {
      for (const request of pending.values()) {
        responses[request.method] = { status: 'timeout' }
      }
      pending.clear()
      const requiredFailure = requests.find(
        (request) => request.required && responses[request.method]?.status !== 'ok',
      )
      if (requiredFailure) {
        const response = responses[requiredFailure.method]
        if (response?.status === 'error') {
          fail('server-error', response.message)
          return
        }
        fail(missingReason, missingMessage)
        return
      }
      finish({ ok: true, reason: null, message: null, initialize: initializeResult, responses })
    }

    const requiredAnswered = () =>
      requests.every((request) => !request.required || responses[request.method])

    const send = (payload) => {
      if (settled) {
        return
      }
      try {
        child.stdin.write(`${JSON.stringify(payload)}\n`)
      } catch {
        fail('io', 'Não foi possível falar com o app-server do Codex.')
      }
    }

    const timeoutTimer = setTimeout(() => finishWithAnswers('timeout', timeoutMessage), timeoutMs)

    if (signal) {
      const cancel = () => fail('cancelled', 'A consulta ao app-server do Codex foi cancelada.')
      if (signal.aborted) {
        cancel()
        return
      }
      signal.addEventListener('abort', cancel, { once: true })
    }

    try {
      child = spawnProcess('codex', ['app-server', '--stdio'], {
        env: createCliEnv(buildAccountProcessEnv(process.env, { providerId: 'codex', profileEnv: accountEnv })),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      fail('spawn', 'Não foi possível iniciar o app-server do Codex.')
      return
    }

    child.on('error', () => fail('spawn', 'O app-server do Codex não pôde ser iniciado.'))
    child.on('exit', () => {
      if (!settled) {
        finishWithAnswers('exit', 'O app-server do Codex encerrou antes de responder.')
      }
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (settled) {
        return
      }

      buffer += chunk
      if (buffer.length > MAX_BUFFER_CHARS) {
        fail('io', 'A resposta do app-server do Codex passou do tamanho esperado.')
        return
      }

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0 && !settled) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')

        if (line) {
          handleLine(line)
        }
      }
    })

    function handleLine(line) {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }

      if (message?.id === 1) {
        if (message.error) {
          fail(
            'initialize',
            serverErrorText(message.error) ?? 'O app-server do Codex recusou a inicialização.',
          )
          return
        }

        if (message.result) {
          // `initialize` respondeu: só agora o app-server aceita os pedidos.
          // Não existe uma notificação `initialized` obrigatória neste
          // protocolo — os pedidos seguintes já podem sair, todos juntos.
          initializeResult = message.result
          if (requests.length === 0) {
            finishWithAnswers('timeout', timeoutMessage)
            return
          }
          requests.forEach((request, index) => {
            const id = index + 2
            pending.set(id, request)
            send({ jsonrpc: '2.0', id, method: request.method, params: request.params ?? null })
          })
        }
        return
      }

      const request = pending.get(message?.id)
      if (!request) {
        return
      }
      pending.delete(message.id)

      responses[request.method] = message.error
        ? { status: 'error', message: serverErrorText(message.error) }
        : { status: 'ok', result: message.result }

      // Todos responderam, ou um obrigatório foi recusado (não adianta
      // esperar os outros).
      if (pending.size === 0 || (request.required && message.error)) {
        finishWithAnswers('timeout', timeoutMessage)
        return
      }

      if (!graceTimer && requiredAnswered()) {
        graceTimer = setTimeout(() => finishWithAnswers('timeout', timeoutMessage), optionalGraceMs)
      }
    }

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: DEFAULT_CLIENT_NAME, version: clientVersion } },
    })
  })
}

/**
 * Atalho para um único pedido obrigatório, com as mensagens próprias de cada
 * chamador. Preserva o contrato antigo: sucesso devolve o resultado já
 * normalizado; qualquer falha devolve `ok: false` com `message`.
 */
async function requestCodexAppServer({
  spawnProcess,
  accountEnv,
  timeoutMs,
  clientVersion,
  method,
  params,
  timeoutMessage,
  failureResult,
  serverErrorMessage,
  normalizeResult,
  signal = null,
}) {
  const session = await runCodexAppServerSession({
    spawnProcess,
    accountEnv,
    timeoutMs,
    clientVersion,
    timeoutMessage,
    signal,
    requests: [{ method, params, required: true }],
  })
  const failure = (message) => ({
    ok: false,
    ...(typeof failureResult === 'function' ? failureResult() : {}),
    message,
  })

  if (!session.ok) {
    // Recusa sem texto do servidor cai na mensagem própria de quem chamou.
    return failure(session.message ?? serverErrorMessage)
  }

  try {
    return { ok: true, ...normalizeResult(session.responses[method].result) }
  } catch {
    return failure('A resposta do app-server do Codex veio em formato inválido.')
  }
}

/** Versão da CLI que o `initialize` publica (`felixo-ai-core/0.156.1 (...)`). */
function readCodexVersion(initializeResult) {
  const userAgent = typeof initializeResult?.userAgent === 'string' ? initializeResult.userAgent : ''
  const match = /^[^/\s]+\/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(userAgent)
  return match ? match[1] : null
}

/** Texto curto do erro JSON-RPC, ou `null` quando o servidor não mandou um. */
function serverErrorText(error) {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim().slice(0, 300)
    : null
}

module.exports = {
  readCodexVersion,
  requestCodexAppServer,
  runCodexAppServerSession,
}
