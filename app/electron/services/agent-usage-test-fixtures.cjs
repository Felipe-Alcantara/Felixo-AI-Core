'use strict'

/**
 * Apoio dos testes do serviço de Limites que sobem o serviço de verdade, com o
 * SQLite real e comandos falsos: o que se prova é a decisão do serviço, não a
 * CLI. Não é um teste (o nome não termina em `.test.cjs`, então o runner o ignora).
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAgentUsageRepository } = require('./storage/agent-usage-repository.cjs')
const { createAgentUsageService } = require('./agent-usage-service.cjs')

const COM_SQLITE = { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' }

function criarServico({
  perfis,
  runCommand,
  queryLiveUsage,
  refreshDeadlineMs,
  maxConcurrent,
  agora = { valor: Date.parse('2026-10-26T12:00:00.000Z') },
}) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-disponibilidade-'))
  const database = createStorageDatabase({ databaseDir })
  const repository = createAgentUsageRepository(database)
  const service = createAgentUsageService({
    repository,
    probe: () => null,
    now: () => agora.valor,
    listCatalog: async () => [],
    listProfiles: () => perfis,
    runCommand,
    queryLiveUsage,
    ...(refreshDeadlineMs ? { refreshDeadlineMs } : {}),
    ...(maxConcurrent ? { maxConcurrent } : {}),
  })
  return {
    service,
    repository,
    agora,
    limpar: () => {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    },
  }
}

const perfilCodex = (id) => ({
  id,
  providerId: 'codex',
  label: id,
  probeOptions: { codexHome: `/perfis/${id}` },
  profileEnv: { CODEX_HOME: `/perfis/${id}` },
})
const perfilClaude = (id) => ({
  id,
  providerId: 'claude',
  label: id,
  profileEnv: { CLAUDE_CONFIG_DIR: `/perfis/${id}` },
})
const pasta = (env) => env?.CODEX_HOME ?? env?.CLAUDE_CONFIG_DIR ?? ''

const loginCodexOk = (env) => ({ ok: true, stdout: `Logged in using ChatGPT\nAccount: ${path.basename(pasta(env))}@example.com`, stderr: '' })
const metricas = (...chaves) =>
  chaves.map((chave, indice) => ({
    key: chave,
    label: chave,
    used: 10 + indice,
    limit: 100,
    remaining: 90 - indice,
    unit: '%',
    precision: 'percentage',
    resetAt: null,
  }))
const usoOk = (...chaves) => ({
  ok: true,
  collectedAt: '2026-10-26T12:00:00.000Z',
  measuredAt: '2026-10-26T12:00:00.000Z',
  metrics: metricas(...chaves),
  details: null,
  message: null,
})

function contaDoPainel(dashboard, id) {
  return dashboard.accounts.find((conta) => conta.id === id)
}

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}

module.exports = {
  COM_SQLITE,
  contaDoPainel,
  criarServico,
  loginCodexOk,
  metricas,
  pasta,
  perfilClaude,
  perfilCodex,
  usoOk,
}
