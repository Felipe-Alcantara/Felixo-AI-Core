'use strict'

/**
 * Grava as respostas reais do `codex app-server` que o painel "Limites e uso"
 * pede (ver electron/services/codex-status-query.cjs) e salva como fixture
 * anonimizada dos testes.
 *
 * Os testes nunca rodam o Codex de verdade: eles reproduzem estas respostas
 * num app-server falso. Este script é a única coisa que fala com a CLI real,
 * e só quando alguém o roda à mão, com a própria conta:
 *
 *   node scripts/record-codex-app-server-fixture.cjs
 *
 * O que muda na gravação (a estrutura continua a real):
 * - e-mail, IDs de conta/workspace e IDs de crédito viram marcadores fixos;
 * - o plano vira sempre "pro"; a pasta do Codex e o sistema operacional
 *   (`initialize`) viram valores fixos;
 * - o histórico de tokens ganha números e datas sintéticos — uso real diz
 *   quando e quanto a pessoa trabalha;
 * - do `config/read` só ficam as chaves de `config` que o painel lê, mais três
 *   chaves sintéticas que os testes usam para provar que caminho, instrução e
 *   servidor MCP nunca chegam ao painel. `origins` (de onde veio cada chave,
 *   com os caminhos de todos os projetos confiáveis) fica de fora inteiro.
 */

const fs = require('node:fs')
const path = require('node:path')
const { runCodexAppServerSession } = require('../electron/services/codex-app-server-client.cjs')
const { STATUS_REQUESTS } = require('../electron/services/codex-status-query.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const FIXTURE_PATH = path.join(APP_DIR, 'electron', '__fixtures__', 'codex-app-server-status.json')
const ANON_ID = '00000000-0000-4000-8000-000000000000'
const ANON_PLAN = 'pro'
const SYNTHETIC_DAYS = 20

/** Chaves do `config/read` que o painel lê (codex-status-details.cjs). */
const CONFIG_KEYS = [
  'model',
  'model_reasoning_effort',
  'model_reasoning_summary',
  'model_verbosity',
  'model_provider',
  'service_tier',
  'approval_policy',
  'sandbox_mode',
  'model_context_window',
  'model_auto_compact_token_limit',
  'web_search',
]

function anonymizeResponses(responses, recordedAt) {
  const result = {}
  for (const [method, response] of Object.entries(responses)) {
    result[method] = response.status === 'ok'
      ? { status: 'ok', result: anonymizeResult(method, response.result, recordedAt) }
      : response
  }
  return result
}

function anonymizeResult(method, value, recordedAt) {
  switch (method) {
    case 'account/read':
      return {
        ...value,
        account: value?.account
          ? {
              ...value.account,
              ...('email' in value.account ? { email: 'pessoa@example.com' } : {}),
              ...('planType' in value.account ? { planType: ANON_PLAN } : {}),
            }
          : value?.account ?? null,
        workspaceRouting: value?.workspaceRouting
          ? { ...value.workspaceRouting, chatgptAccountId: ANON_ID }
          : value?.workspaceRouting ?? null,
      }
    case 'account/rateLimits/read':
      return {
        ...value,
        accountId: value?.accountId ? ANON_ID : value?.accountId ?? null,
        rateLimits: anonymizeSnapshot(value?.rateLimits),
        rateLimitsByLimitId: Object.fromEntries(
          Object.entries(value?.rateLimitsByLimitId ?? {}).map(([id, snapshot]) => [id, anonymizeSnapshot(snapshot)]),
        ),
        rateLimitResetCredits: value?.rateLimitResetCredits
          ? {
              ...value.rateLimitResetCredits,
              credits: (value.rateLimitResetCredits.credits ?? []).map((credit, index) => ({
                ...credit,
                id: `RateLimitResetCredit_${String(index + 1).padStart(32, '0')}`,
              })),
            }
          : null,
      }
    case 'config/read':
      return {
        config: {
          ...Object.fromEntries(CONFIG_KEYS.map((key) => [key, value?.config?.[key] ?? null])),
          // Sintéticas: os testes provam que nada disto chega ao painel.
          developer_instructions: 'instrução privada da pessoa',
          projects: { '/home/pessoa/projeto-secreto': { trust_level: 'trusted' } },
          mcp_servers: { exemplo: { command: '/home/pessoa/bin/servidor-mcp' } },
        },
      }
    case 'account/usage/read':
      return {
        ...value,
        summary: {
          lifetimeTokens: 123_456_789,
          peakDailyTokens: 9_876_543,
          longestRunningTurnSec: 4_567,
          currentStreakDays: 3,
          longestStreakDays: 9,
        },
        dailyUsageBuckets: syntheticDays(recordedAt),
      }
    default:
      return value
  }
}

function anonymizeSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object'
    ? { ...snapshot, ...('planType' in snapshot ? { planType: ANON_PLAN } : {}) }
    : snapshot ?? null
}

function syntheticDays(recordedAt) {
  const end = Date.parse(`${recordedAt}T00:00:00.000Z`)
  return Array.from({ length: SYNTHETIC_DAYS }, (_, index) => ({
    startDate: new Date(end - (SYNTHETIC_DAYS - 1 - index) * 86_400_000).toISOString().slice(0, 10),
    tokens: (index + 1) * 1_000,
  }))
}

/** O `initialize` também publica a pasta do Codex (`codexHome`) e o sistema. */
function anonymizeInitialize(value) {
  const userAgent = typeof value?.userAgent === 'string' ? value.userAgent : ''
  const version = /^[^/\s]+\/(\S+)/.exec(userAgent)?.[1] ?? '0.0.0'
  return {
    userAgent: `felixo-ai-core/${version} (Linux; x86_64) xterm-256color (felixo-ai-core; 0.0.0)`,
    codexHome: '/home/pessoa/.codex',
    platformFamily: 'unix',
    platformOs: 'linux',
  }
}

/** Nada da pessoa pode sobrar: confere o arquivo inteiro antes de gravar. */
function assertAnonymous(text) {
  const leftovers = [
    /[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    /sk-[A-Za-z0-9_-]{16,}/,
    /eyJ[A-Za-z0-9_-]{16,}/,
    new RegExp(require('node:os').homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  ].find((pattern) => pattern.test(text))
  if (leftovers) {
    throw new Error(`A gravação ainda tem dado da pessoa (${leftovers}); nada foi salvo.`)
  }
}

async function run() {
  const session = await runCodexAppServerSession({ requests: STATUS_REQUESTS, timeoutMs: 30_000 })
  if (!session.ok) {
    throw new Error(`O app-server não respondeu: ${session.message}`)
  }

  const recordedAt = new Date().toISOString().slice(0, 10)
  const initialize = anonymizeInitialize(session.initialize)
  const fixture = {
    recordedAt,
    version: /^[^/\s]+\/(\S+)/.exec(initialize.userAgent)?.[1] ?? null,
    anonymized: true,
    initialize,
    responses: anonymizeResponses(session.responses, recordedAt),
  }
  const text = `${JSON.stringify(fixture, null, 1)}\n`
  assertAnonymous(text)
  fs.writeFileSync(FIXTURE_PATH, text)
  process.stderr.write(`[gravar] respostas em ${path.relative(APP_DIR, FIXTURE_PATH)}\n`)
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}

module.exports = { anonymizeResponses, assertAnonymous }
