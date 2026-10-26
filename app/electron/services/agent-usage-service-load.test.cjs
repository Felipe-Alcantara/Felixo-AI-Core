'use strict'

/**
 * Carga do "Atualizar" do painel de Limites com muitas contas: teto de consultas
 * simultâneas, isolamento entre contas que falham de jeitos diferentes e
 * cancelamento da rodada (teto de tempo ou Reconectar).
 *
 * Tudo com comandos e consultas falsos que só contam e esperam: o orçamento de
 * processos (quantos comandos estão em voo ao mesmo tempo) é decidido aqui, no
 * serviço; o custo de cada processo real foi medido à parte (ver
 * `docs/projeto/POLITICA-PERFORMANCE.md`, "Painel de Limites com N contas").
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAgentUsageRepository } = require('./storage/agent-usage-repository.cjs')
const {
  REFRESH_MAX_CONCURRENCY,
  createAgentUsageService,
} = require('./agent-usage-service.cjs')

const COM_SQLITE = { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' }
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Conta quantos comandos/consultas estão em voo ao mesmo tempo. */
function medidor() {
  const estado = { atual: 0, pico: 0, chamadas: 0 }
  return {
    estado,
    async medir(latenciaMs, trabalho) {
      estado.atual += 1
      estado.chamadas += 1
      estado.pico = Math.max(estado.pico, estado.atual)
      try {
        await esperar(latenciaMs)
        return await trabalho()
      } finally {
        estado.atual -= 1
      }
    },
  }
}

/** N perfis alternando Claude e Codex; o índice vai na pasta da conta. */
function criarPerfis(quantidade) {
  return Array.from({ length: quantidade }, (_, indice) => {
    const claude = indice % 2 === 0
    return claude
      ? { id: `claude-${indice}`, providerId: 'claude', label: `Claude ${indice}`, profileEnv: { CLAUDE_CONFIG_DIR: `/perfis/claude-${indice}` } }
      : { id: `codex-${indice}`, providerId: 'codex', label: `Codex ${indice}`, probeOptions: { codexHome: `/perfis/codex-${indice}` }, profileEnv: { CODEX_HOME: `/perfis/codex-${indice}` } }
  })
}

/** O índice da conta, lido da pasta do perfil que a consulta recebeu. */
function indiceDoPerfil(env) {
  const pasta = env?.CLAUDE_CONFIG_DIR ?? env?.CODEX_HOME ?? ''
  return Number(/-(\d+)$/.exec(pasta)?.[1] ?? Number.NaN)
}

function loginOk(env) {
  const indice = indiceDoPerfil(env)
  return env?.CLAUDE_CONFIG_DIR
    ? { ok: true, stdout: JSON.stringify({ loggedIn: true, email: `c${indice}@example.com`, subscriptionType: 'pro' }), stderr: '' }
    : { ok: true, stdout: `Logged in using ChatGPT\nAccount: x${indice}@example.com`, stderr: '' }
}

/** Resultado de uso cujo número é o índice da conta: mistura entre contas fica visível. */
function usoDaConta(env) {
  const indice = indiceDoPerfil(env)
  return {
    ok: true,
    collectedAt: '2026-10-26T12:00:00.000Z',
    measuredAt: '2026-10-26T12:00:00.000Z',
    metrics: [{ key: 'rate_limits.seven_day', label: 'Janela de 7 dias', used: indice, limit: 100, remaining: 100 - indice, unit: '%', precision: 'percentage', resetAt: null }],
    details: null,
    message: null,
  }
}

function criarServico({ perfis, runCommand, queryLiveUsage, ...opcoes }) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-carga-'))
  const database = createStorageDatabase({ databaseDir })
  const repository = createAgentUsageRepository(database)
  const service = createAgentUsageService({
    repository,
    probe: () => null,
    listCatalog: async () => [],
    listProfiles: () => perfis,
    runCommand,
    queryLiveUsage,
    ...opcoes,
  })
  return {
    service,
    repository,
    limpar: () => {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    },
  }
}

function amostraDeCadaPerfil(repository, perfis) {
  return perfis.map((perfil) => ({ perfil, amostra: repository.getLatestSample(perfil.id) }))
}

test('o teto padrão é o orçamento medido: 4 consultas ao mesmo tempo', () => {
  assert.equal(REFRESH_MAX_CONCURRENCY, 4)
})

test(
  'com 50 contas logadas o Atualizar nunca passa do teto, usa o teto inteiro e cada conta fica com o número dela',
  COM_SQLITE,
  async () => {
    const perfis = criarPerfis(50)
    const carga = medidor()
    const { service, repository, limpar } = criarServico({
      perfis,
      runCommand: ({ env }) => carga.medir(2, () => loginOk(env)),
      queryLiveUsage: {
        'claude-status': ({ env }) => carga.medir(2, () => usoDaConta(env)),
        'codex-rate-limits': ({ env }) => carga.medir(2, () => usoDaConta(env)),
      },
    })

    try {
      const dashboard = await service.refresh()

      assert.equal(dashboard.ok, true)
      assert.ok(carga.estado.pico <= REFRESH_MAX_CONCURRENCY, `pico de ${carga.estado.pico} em voo (teto ${REFRESH_MAX_CONCURRENCY})`)
      assert.equal(carga.estado.pico, REFRESH_MAX_CONCURRENCY, 'o teto não pode ser mais baixo que o necessário: a rodada ainda usa tudo')
      assert.equal(carga.estado.atual, 0)

      for (const { perfil, amostra } of amostraDeCadaPerfil(repository, perfis)) {
        const indice = Number(/-(\d+)$/.exec(perfil.id)[1])
        assert.equal(amostra.status, 'current', perfil.id)
        assert.equal(amostra.metrics[0].used, indice, `${perfil.id} recebeu o número de outra conta`)
      }
    } finally {
      limpar()
    }
  },
)

test(
  'o teto vale também para um valor menor, pedido pela configuração do serviço',
  COM_SQLITE,
  async () => {
    const perfis = criarPerfis(12)
    const carga = medidor()
    const { service, limpar } = criarServico({
      perfis,
      maxConcurrent: 1,
      runCommand: ({ env }) => carga.medir(1, () => loginOk(env)),
      queryLiveUsage: {
        'claude-status': ({ env }) => carga.medir(1, () => usoDaConta(env)),
        'codex-rate-limits': ({ env }) => carga.medir(1, () => usoDaConta(env)),
      },
    })

    try {
      await service.refresh()
      assert.equal(carga.estado.pico, 1)
    } finally {
      limpar()
    }
  },
)

test(
  'contas que falham de jeitos diferentes não contaminam as outras (24 contas, metade falhando)',
  COM_SQLITE,
  async () => {
    const perfis = criarPerfis(24)
    // As contas de índice par (as do Claude) falham, em rodízio, de quatro jeitos:
    // o comando de login lança, o comando estoura o tempo, a consulta ao vivo
    // lança, a consulta ao vivo devolve falha. As de índice ímpar (Codex) ficam ok.
    const MODOS_QUE_FALHAM = ['lanca-login', 'tempo-esgotado', 'ao-vivo-lanca', 'ao-vivo-falha']
    const modo = (indice) => (indice % 2 === 0 ? MODOS_QUE_FALHAM[(indice / 2) % 4] : 'ok')
    const carga = medidor()
    const falhasObservadas = []
    const { service, repository, limpar } = criarServico({
      perfis,
      onLiveQueryFailure: (falha) => falhasObservadas.push(falha),
      runCommand: ({ env }) =>
        carga.medir(1, () => {
          const indice = indiceDoPerfil(env)
          if (modo(indice) === 'lanca-login') throw new Error('spawn falhou')
          if (modo(indice) === 'tempo-esgotado') return { ok: false, timedOut: true, stdout: '', stderr: '' }
          return loginOk(env)
        }),
      queryLiveUsage: {
        'claude-status': ({ env }) =>
          carga.medir(1, () => {
            const indice = indiceDoPerfil(env)
            if (modo(indice) === 'ao-vivo-lanca') throw new Error('PTY caiu')
            if (modo(indice) === 'ao-vivo-falha') return { ok: false, message: 'Claude: a consulta ao vivo falhou.' }
            return usoDaConta(env)
          }),
        'codex-rate-limits': ({ env }) => carga.medir(1, () => usoDaConta(env)),
      },
    })

    try {
      await service.refresh()
      assert.ok(carga.estado.pico <= REFRESH_MAX_CONCURRENCY)

      let falharam = 0
      for (const { perfil, amostra } of amostraDeCadaPerfil(repository, perfis)) {
        const indice = Number(/-(\d+)$/.exec(perfil.id)[1])
        if (modo(indice) === 'ok') {
          assert.equal(amostra.status, 'current', `${perfil.id} deveria estar atual`)
          assert.equal(amostra.metrics[0].used, indice, `${perfil.id} recebeu o número de outra conta`)
        } else {
          falharam += 1
          assert.equal(amostra.status, 'error', `${perfil.id} (${modo(indice)}) deveria estar em erro`)
          assert.deepEqual(amostra.metrics, [], `${perfil.id} em erro não pode carregar número de outra conta`)
        }
      }
      assert.equal(falharam, 12)
      // Só as falhas ao vivo viram evidência no observador; as de login não rodam a consulta ao vivo.
      assert.equal(falhasObservadas.length, 6)
    } finally {
      limpar()
    }
  },
)

test(
  'o teto de tempo cancela os comandos em voo e a fila não começa: nenhuma CLI nova abre depois do cancelamento',
  COM_SQLITE,
  async () => {
    const perfis = criarPerfis(10)
    const sinais = []
    const { service, repository, limpar } = criarServico({
      perfis,
      maxConcurrent: 2,
      refreshDeadlineMs: 100,
      // Um comando que só termina quando o sinal da rodada manda (como o
      // `runBufferedCommand` real, que mata a árvore de processos ao abortar).
      runCommand: ({ signal }) => {
        sinais.push(signal)
        return new Promise((resolve) => {
          signal?.addEventListener('abort', () => resolve({ ok: false, cancelled: true, stdout: '', stderr: '' }), { once: true })
        })
      },
      queryLiveUsage: {},
    })

    try {
      const inicio = Date.now()
      const dashboard = await service.refresh()

      assert.ok(Date.now() - inicio < 2_000, 'a rodada deveria sair pelo teto, não pela rede de segurança de 5 s')
      assert.equal(dashboard.ok, true)
      // Duas vias abriram comando; as outras oito nunca começaram.
      assert.equal(sinais.length, 2, `abriram ${sinais.length} comandos`)
      assert.ok(sinais.every((sinal) => sinal?.aborted === true), 'o comando em voo tem que receber o cancelamento')

      for (const { perfil, amostra } of amostraDeCadaPerfil(repository, perfis)) {
        assert.equal(amostra.status, 'error', perfil.id)
        assert.match(amostra.errorMessage, /não respondeu/, `${perfil.id}: a mensagem do teto, não a genérica`)
      }
    } finally {
      limpar()
    }
  },
)

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}
