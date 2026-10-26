'use strict'

/**
 * Auditoria de segredo do painel de Limites, de ponta a ponta, com canários.
 *
 * Cada formato de segredo carrega a marca `CANARIO`. O teste planta todos nas
 * entradas que não controlamos (saída e erro de CLI, falha e detalhes da
 * consulta ao vivo, campos digitados) e varre tudo que o app produz: o que vai
 * ao renderer, todas as linhas de todas as tabelas do SQLite, o que vai ao QA
 * Logger e o console. `agent-usage-model.test.cjs` cobre o normalizador (a
 * camada que grava no banco); esta cobre o caminho antes dele.
 *
 * Fora do alcance, por escolha: um valor opaco sem rótulo nem prefixo
 * conhecido (um hex longo, por exemplo) não é reconhecível; mascará-lo
 * esconderia também hashes de commit e ids de sessão que a tela precisa mostrar.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAgentUsageRepository } = require('./storage/agent-usage-repository.cjs')
const { createAgentUsageService } = require('./agent-usage-service.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')

const COM_SQLITE = { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' }

const CANARIOS = [
  ['variável OPENAI_API_KEY', 'OPENAI_API_KEY=CANARIOopenai0a1b2c3d'],
  ['variável ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN=CANARIOanthropic4e5f6a7b'],
  ['variável GITHUB_TOKEN', 'GITHUB_TOKEN=CANARIOgithub8c9d0e1f'],
  ['variável DB_PASSWORD', 'DB_PASSWORD=CANARIOsenha2a3b4c5d'],
  ['credencial em URL', 'https://felixo:CANARIOurl6e7f8a9b@proxy.example.com:8080/path'],
  ['token OAuth do Google', 'ya29.CANARIOgoogle-AbCdEfGhIjKlMnOpQrStUv'],
  ['refresh token do Google', '1//CANARIOrefresh-AbCdEfGhIjKlMnOpQr'],
  ['JWT sem assinatura', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJDQU5BUklPand0In0'],
  ['JWT completo', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJDQU5BUklPand0QSJ9.CANARIOassinatura-xyz'],
  ['chave da Anthropic', 'sk-ant-api03-CANARIOanthropic-AbCdEfGh-AA'],
  ['chave da OpenAI', 'sk-proj-CANARIOopenai1234567890abcd'],
  ['chave do Google', `AIza${'CANARIOgoogle'.padEnd(35, '0')}`],
  ['chave da AWS', 'AKIACANARIO123456789'],
  ['token do Slack', 'xoxb-1234567890-CANARIOslack-AbCdEfGh'],
  ['token do npm', `npm_${'CANARIOnpm'.padEnd(36, 'a')}`],
  ['token do GitLab', 'glpat-CANARIOgitlab123456789'],
  ['token do GitHub', 'ghp_CANARIOgithub1234567890abcdef'],
  ['chave privada PEM', '-----BEGIN PRIVATE KEY-----\nCANARIOpemMIIEvQIBADANBg\n-----END PRIVATE KEY-----'],
  ['JSON access_token', '{"access_token":"CANARIOjsonaccess1234","token_type":"bearer"}'],
  ['JSON refresh_token', '{"refresh_token":"CANARIOjsonrefresh5678"}'],
  ['cabeçalho Authorization', 'Authorization: Bearer CANARIOauth9012'],
  ['cookie', 'Cookie: sessionKey=CANARIOcookie3456; theme=dark'],
  ['parâmetro de URL', 'GET /v1/usage?api_key=CANARIOquery7890&x=1'],
]
const TODOS = CANARIOS.map(([, texto]) => texto).join('\n')

/** Diagnóstico legítimo que a tela precisa mostrar: a redação não pode comê-lo. */
const PRESERVADOS = [
  'Logged in using ChatGPT',
  'Account: alice@example.com',
  'Plan: Pro',
  'Organization: Felixo',
  'Model: sonnet (claude-sonnet-5)',
  'input_tokens: 1234',
  'Total tokens: 200,000 tokens',
  'Usage by model: sonnet 10 input, 20 output',
  'Resets 6:50pm (America/Sao_Paulo)',
  'Session ID: native-session-123',
  'cwd: /tmp/felixo-status',
  'https://docs.example.com/guide?page=2',
  'ssh://github.com/Felipe-Alcantara/Felixo-AI-Core.git',
]

test('redactSecrets mascara cada formato de segredo, sozinho e no meio de uma frase', () => {
  for (const [nome, texto] of CANARIOS) {
    assert.doesNotMatch(redactSecrets(texto), /CANARIO/, `${nome}: vazou sozinho`)
    assert.doesNotMatch(redactSecrets(`falha ao consultar: ${texto} (tente de novo)`), /CANARIO/, `${nome}: vazou no meio da frase`)
  }
})

test('redactSecrets não come o diagnóstico que a tela mostra', () => {
  for (const linha of PRESERVADOS) {
    assert.equal(redactSecrets(linha), linha)
  }
})

test('os redatores seguem lineares com 1 MB de saída hostil (nenhum padrão novo vira ReDoS)', () => {
  // Uma saída de CLI não é confiável: um `[a-z][a-z0-9+.-]*://` sem teto, por exemplo, levava
  // minutos em "a.a.a.…" de 1 MB e congelaria o processo principal. Medido: ≤ 150 ms cada.
  const { normalizeSample } = require('./agent-usage-model.cjs')
  const N = 1_000_000
  const hostis = {
    'a': 'a'.repeat(N),
    'a.': 'a.'.repeat(N / 2),
    'A-': 'A-'.repeat(N / 2),
    'xox-': 'xox-'.repeat(N / 4),
    'KEY': `${'KEY'.repeat(N / 3)}=`,
    'http://a': 'http://a'.repeat(N / 8),
    'BEGIN': `-----BEGIN ${' '.repeat(N)}`,
  }
  const amostra = (texto) => ({
    id: 's', accountId: 'a', status: 'current', sourceKind: 'cli-command', sourceLabel: 'x',
    collectedAt: '2026-10-26T12:00:00.000Z', metrics: [], errorMessage: texto, metadata: { plan: texto, statusDetails: { status: texto } },
  })

  for (const [nome, texto] of Object.entries(hostis)) {
    const inicio = performance.now()
    redactSecrets(texto)
    normalizeSample(amostra(texto))
    const ms = performance.now() - inicio
    assert.ok(ms < 3_000, `"${nome}" de 1 MB levou ${Math.round(ms)} ms`)
  }
})

test(
  'ponta a ponta: nenhum canário chega ao renderer, ao banco, ao QA Logger nem ao console',
  COM_SQLITE,
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-segredos-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    const observados = []
    const consoleCapturado = []
    const metodos = ['log', 'info', 'warn', 'error', 'debug']
    const originais = Object.fromEntries(metodos.map((metodo) => [metodo, console[metodo]]))
    for (const metodo of metodos) console[metodo] = (...args) => consoleCapturado.push(args.map(String).join(' '))

    const perfis = [
      { id: 'claude-0', providerId: 'claude', label: 'Claude 0', profileEnv: { CLAUDE_CONFIG_DIR: '/perfis/claude-0' } },
      { id: 'codex-1', providerId: 'codex', label: 'Codex 1', probeOptions: { codexHome: '/perfis/codex-1' }, profileEnv: { CODEX_HOME: '/perfis/codex-1' } },
      { id: 'claude-2', providerId: 'claude', label: 'Claude 2', profileEnv: { CLAUDE_CONFIG_DIR: '/perfis/claude-2' } },
      { id: 'claude-4', providerId: 'claude', label: 'Claude 4', profileEnv: { CLAUDE_CONFIG_DIR: '/perfis/claude-4' } },
    ]
    const pasta = (env) => env?.CLAUDE_CONFIG_DIR ?? env?.CODEX_HOME ?? ''
    const metricas = [{ key: 'rate_limits.seven_day', label: 'Janela de 7 dias', used: 10, limit: 100, remaining: 90, unit: '%', precision: 'percentage', resetAt: null }]

    const service = createAgentUsageService({
      repository,
      probe: () => null,
      listCatalog: async () => [],
      listProfiles: () => perfis,
      onLiveQueryFailure: (falha) => observados.push(JSON.stringify(falha)),
      runCommand: async ({ env }) => {
        // O Codex 1 tem o comando de login quebrado e a exceção carrega os canários.
        if (pasta(env).endsWith('codex-1')) throw new Error(`spawn falhou: ${TODOS}`)
        return {
          ok: true,
          stdout: JSON.stringify({ loggedIn: true, email: 'pessoa@example.com', subscriptionType: 'pro', diagnostico: TODOS }),
          stderr: TODOS,
        }
      },
      queryLiveUsage: {
        'claude-status': async ({ env }) => {
          if (pasta(env).endsWith('claude-0')) {
            // Adaptador que não redigiu: os canários vêm nos campos de texto livre dos detalhes.
            return {
              ok: true,
              collectedAt: '2026-10-26T12:00:00.000Z',
              measuredAt: '2026-10-26T12:00:00.000Z',
              metrics: metricas,
              details: {
                status: { email: 'pessoa@example.com', cwd: CANARIOS[0][1], model: CANARIOS[4][1], version: '2.1.0' },
                lines: CANARIOS.map(([, texto]) => texto),
                screen: TODOS,
                description: CANARIOS[5][1],
              },
              message: null,
            }
          }
          if (pasta(env).endsWith('claude-2')) return { ok: false, message: `Claude falhou: ${TODOS}` }
          throw new Error(TODOS)
        },
        'codex-rate-limits': async () => ({ ok: true, metrics: metricas, details: null, message: null }),
      },
    })

    try {
      const dashboard = await service.refresh()
      const listado = await service.list()

      for (const [nome, texto] of CANARIOS) {
        for (const campo of ['label', 'identityHint']) {
          await assert.rejects(
            service.addAccount({ providerId: 'codex', label: campo === 'label' ? texto : 'Conta', identityHint: campo === 'identityHint' ? texto : undefined }),
            /chave ou token|valor que não deve ser salvo|Informe/,
            `${nome} aceito em ${campo}`,
          )
        }
      }

      const artefatos = {
        'resposta do Atualizar ao renderer': JSON.stringify(dashboard),
        'resposta do list() ao renderer': JSON.stringify(listado),
        'linhas do SQLite': dumparBanco(database),
        'eventos do QA Logger (onLiveQueryFailure)': observados.join('\n'),
        'console': consoleCapturado.join('\n'),
      }
      for (const [nome, conteudo] of Object.entries(artefatos)) {
        const vazados = [...new Set(conteudo.match(/CANARIO[A-Za-z0-9_-]*/g) ?? [])]
        assert.deepEqual(vazados, [], `${nome}: ${vazados.length} canário(s) vazaram`)
      }
      // A auditoria não vale se o cenário não rodou: o observador viu a falha ao vivo.
      assert.ok(observados.length >= 2, 'as falhas ao vivo deveriam ter chegado ao observador')
    } finally {
      for (const metodo of metodos) console[metodo] = originais[metodo]
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

function dumparBanco(database) {
  const tabelas = database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((linha) => linha.name)
  return JSON.stringify(
    Object.fromEntries(tabelas.map((nome) => [nome, database.connection.prepare(`SELECT * FROM "${nome}"`).all()])),
  )
}

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}
