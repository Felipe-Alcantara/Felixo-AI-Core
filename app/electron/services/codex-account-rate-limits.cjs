'use strict'

const { randomUUID } = require('node:crypto')
const spawnChildProcess = require('cross-spawn')
const { createCliEnv } = require('./cli-process-manager.cjs')

/**
 * Resets bancados ("banked resets") do Codex: um crédito único, concedido
 * pela OpenAI, que zera a janela de 5h + semanal antes do reset automático.
 * Diferente de `agent-usage-codex-local.cjs` (que só lê o rollout no disco),
 * este dado NÃO existe em nenhum arquivo local — só o app-server da própria
 * CLI sabe (`account/rateLimits/read`, JSON-RPC via stdio), porque é a CLI
 * quem já está autenticada e conversa com o backend da OpenAI.
 *
 * A leitura continua estritamente sem efeitos colaterais. O método que gasta
 * um reset (`account/rateLimitResetCredit/consume`) fica em uma função
 * separada, chamada somente pelo fluxo de ação explícita da interface, depois
 * de uma confirmação humana. Assim abrir/atualizar o painel nunca consome
 * crédito por acidente.
 *
 * Verificado manualmente nesta máquina (11/09/2026, Codex CLI 0.154.0): o
 * handshake `initialize` + `account/rateLimits/read` devolve, entre outros
 * campos, `rateLimitResetCredits: { availableCount, credits: [...] }` — com
 * `credits[].status` em `available`/`redeeming`/`redeemed`/`unknown`.
 */

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_CLIENT_NAME = 'felixo-ai-core'

/**
 * @param {object} [dependencies]
 * @param {(command: string, args: string[], options: object) => object} [dependencies.spawnProcess]
 * @param {() => number} [dependencies.now]
 * @returns {(options?: object) => Promise<object>}
 */
function createCodexRateLimitsQuery({ spawnProcess = spawnChildProcess, now = () => Date.now() } = {}) {
  return function queryCodexRateLimits({
    env: accountEnv = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    clientVersion = '0.0.0',
  } = {}) {
    return requestCodexAppServer({
      spawnProcess,
      now,
      accountEnv,
      timeoutMs,
      clientVersion,
      method: 'account/rateLimits/read',
      params: null,
      timeoutMessage: 'A consulta de resets do Codex excedeu o tempo limite.',
      failureResult: () => ({
        collectedAt: null,
        availableCount: null,
        credits: [],
      }),
      serverErrorMessage: 'O app-server do Codex recusou a consulta de limites.',
      normalizeResult: (result) => {
        const summary = result?.rateLimitResetCredits ?? null
        return {
          collectedAt: new Date(now()).toISOString(),
          availableCount:
            typeof summary?.availableCount === 'number' ? summary.availableCount : 0,
          credits: Array.isArray(summary?.credits)
            ? summary.credits.map(toResetCredit)
            : [],
          message: null,
        }
      },
    })
  }
}

/**
 * Cria a ação de resgate do crédito de reset.
 *
 * O `idempotencyKey` é obrigatório pelo protocolo da CLI e nasce aqui, no
 * processo principal. O renderer só pode escolher o `creditId` que a última
 * leitura mostrou; ele nunca controla a chave nem recebe o ambiente de login.
 */
function createCodexRateLimitResetConsumer({
  spawnProcess = spawnChildProcess,
  now = () => Date.now(),
  createIdempotencyKey = randomUUID,
} = {}) {
  return function consumeCodexRateLimitReset({
    env: accountEnv = {},
    creditId = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    clientVersion = '0.0.0',
    idempotencyKey = createIdempotencyKey(),
  } = {}) {
    const normalizedCreditId = normalizeOptionalId(creditId)
    const normalizedIdempotencyKey = normalizeOptionalId(idempotencyKey)

    if (!normalizedIdempotencyKey) {
      return Promise.resolve({
        ok: false,
        consumed: false,
        outcome: null,
        message: 'Não foi possível criar a chave desta tentativa de reset.',
      })
    }

    return requestCodexAppServer({
      spawnProcess,
      now,
      accountEnv,
      timeoutMs,
      clientVersion,
      method: 'account/rateLimitResetCredit/consume',
      params: {
        creditId: normalizedCreditId,
        idempotencyKey: normalizedIdempotencyKey,
      },
      timeoutMessage: 'O uso do reset do Codex excedeu o tempo limite.',
      failureResult: () => ({
        consumed: false,
        outcome: null,
      }),
      serverErrorMessage: 'O app-server do Codex recusou o uso do reset.',
      normalizeResult: (result) => {
        const outcome = normalizeConsumeOutcome(result?.outcome)
        const consumed = outcome === 'reset' || outcome === 'alreadyRedeemed'
        return {
          consumed,
          outcome,
          message: consumeOutcomeMessage(outcome),
          // `alreadyRedeemed` também é sucesso: a tentativa idempotente já
          // aplicou o reset, então o painel deve atualizar a leitura.
          ok: consumed,
        }
      },
    })
  }
}

function requestCodexAppServer({
  spawnProcess,
  now,
  accountEnv,
  timeoutMs,
  clientVersion,
  method,
  params,
  timeoutMessage,
  failureResult,
  serverErrorMessage,
  normalizeResult,
}) {
  return new Promise((resolve) => {
    let child
    let settled = false
    let timeoutTimer
    let buffer = ''
    let requestId = null

    const finish = (result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutTimer)
      try {
        child?.kill?.()
      } catch {
        // Não afeta o resultado; o timeout de fora também cobre órfãos.
      }
      resolve(result)
    }

    const fail = (message) =>
      finish({
        ok: false,
        ...(typeof failureResult === 'function' ? failureResult() : {}),
        message,
      })

    const send = (payload) => {
      if (settled) {
        return
      }
      try {
        child.stdin.write(`${JSON.stringify(payload)}\n`)
      } catch {
        fail('Não foi possível falar com o app-server do Codex.')
      }
    }

    try {
      child = spawnProcess('codex', ['app-server', '--stdio'], {
        env: createCliEnv({ ...process.env, ...accountEnv }),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      fail('Não foi possível iniciar o app-server do Codex.')
      return
    }

    child.on('error', () => fail('O app-server do Codex não pôde ser iniciado.'))
    child.on('exit', () => {
      if (!settled) {
        fail('O app-server do Codex encerrou antes de responder.')
      }
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (settled) {
        return
      }

      buffer += chunk
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
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

      if (message.id === 1) {
        if (message.error) {
          fail(
            typeof message.error?.message === 'string'
              ? message.error.message
              : 'O app-server do Codex recusou a inicialização.',
          )
          return
        }

        if (message.result) {
          // `initialize` respondeu: só agora o app-server aceita o pedido
          // específico. Não existe uma notificação `initialized` obrigatória
          // neste protocolo — o pedido seguinte já pode sair.
          requestId = 2
          send({ jsonrpc: '2.0', id: requestId, method, params })
        }
        return
      }

      if (message.id !== requestId) {
        return
      }

      if (message.error) {
        fail(
          typeof message.error?.message === 'string'
            ? message.error.message
            : serverErrorMessage,
        )
        return
      }

      try {
        finish({ ok: true, ...normalizeResult(message.result) })
      } catch {
        fail('A resposta do app-server do Codex veio em formato inválido.')
      }
    }

    timeoutTimer = setTimeout(() => fail(timeoutMessage), timeoutMs)

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: DEFAULT_CLIENT_NAME, version: clientVersion } },
    })
  })
}

function toResetCredit(credit) {
  return {
    id: typeof credit?.id === 'string' ? credit.id : null,
    resetType: typeof credit?.resetType === 'string' ? credit.resetType : null,
    title: typeof credit?.title === 'string' ? credit.title : null,
    description: typeof credit?.description === 'string' ? credit.description : null,
    status: typeof credit?.status === 'string' ? credit.status : 'unknown',
    grantedAt: toIsoFromEpochSeconds(credit?.grantedAt),
    expiresAt: toIsoFromEpochSeconds(credit?.expiresAt),
  }
}

function normalizeOptionalId(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null
}

function normalizeConsumeOutcome(value) {
  return new Set(['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed']).has(value)
    ? value
    : null
}

function consumeOutcomeMessage(outcome) {
  switch (outcome) {
    case 'reset':
      return 'Reset aplicado com sucesso.'
    case 'alreadyRedeemed':
      return 'Este reset já havia sido aplicado nesta tentativa.'
    case 'nothingToReset':
      return 'Não há uma janela de uso elegível para reset agora.'
    case 'noCredit':
      return 'Este crédito de reset não está mais disponível.'
    default:
      return 'A CLI não confirmou o resultado do uso do reset.'
  }
}

function toIsoFromEpochSeconds(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null
}

const queryCodexRateLimits = createCodexRateLimitsQuery()
const consumeCodexRateLimitReset = createCodexRateLimitResetConsumer()

module.exports = {
  consumeCodexRateLimitReset,
  createCodexRateLimitResetConsumer,
  createCodexRateLimitsQuery,
  queryCodexRateLimits,
}
