'use strict'

/**
 * E2E da retomada de conversa no app EMPACOTADO, com o Claude Code real.
 *
 * Roda no job `.github/workflows/retomada-e2e-empacotado.yml`. Semeia o canvas
 * com um cartão por desfecho, dirige o app por `felixo devtools --packaged` e
 * falha (saída 1) se algum desfecho divergir do medido no Windows em 30/09/2026.
 *
 *   node scripts/retomada-e2e-empacotado.cjs --exe <app> --config-dir <pasta> --out <pasta>
 *
 * O ambiente (CLAUDE_CONFIG_DIR, CLAUDE_CODE_OAUTH_TOKEN) é o do processo: o app
 * e a CLI herdam daqui. O token nunca é escrito em disco nem impresso.
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const FELIXO_CLI = path.join(__dirname, '..', 'electron', 'cli', 'felixo.cjs')
const DIA_MS = 24 * 60 * 60 * 1000

/** Mesma regra do Claude Code para a pasta de projetos: tudo que não é letra/dígito vira "-". */
function codificarPasta(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/** `.claude.json` com onboarding feito e pasta confiada: sem isso a CLI abre o onboarding antes do --resume. */
function configuracaoClaude(pastas) {
  return {
    hasCompletedOnboarding: true,
    theme: 'dark',
    projects: Object.fromEntries(pastas.map((pasta) => [pasta, { hasTrustDialogAccepted: true, allowedTools: [] }])),
  }
}

/** Conversa mínima no formato do Claude Code, datada de `diasAtras`. */
function escreverConversa({ configDir, cwd, sessionId, titulo, diasAtras }) {
  const dir = path.join(configDir, 'projects', codificarPasta(cwd))
  fs.mkdirSync(dir, { recursive: true })
  const quando = new Date(Date.now() - diasAtras * DIA_MS)
  const linha = {
    parentUuid: null, isSidechain: false, userType: 'external', cwd, sessionId, version: '2.1.283',
    type: 'user', message: { role: 'user', content: titulo }, uuid: randomUUID(), timestamp: quando.toISOString(),
  }
  const arquivo = path.join(dir, `${sessionId}.jsonl`)
  fs.writeFileSync(arquivo, `${JSON.stringify(linha)}\n`)
  fs.utimesSync(arquivo, quando, quando)
  return arquivo
}

function listarConversas(configDir, cwd) {
  const dir = path.join(configDir, 'projects', codificarPasta(cwd))
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort() : []
}

function noTerminal(id, indice, { cwd, agentCwd = cwd, sessionId, provider = 'claude', extra = {} }) {
  return {
    id,
    type: 'terminal',
    position: { x: 40 + indice * 420, y: 60 },
    width: 400,
    height: 320,
    data: {
      command: provider,
      cwd,
      label: id,
      agentSession: { version: 1, provider, sessionId, cwd: agentCwd, capturedAt: Date.now() - 3 * DIA_MS },
      sessionStartedAt: Date.now() - 3 * DIA_MS,
      ...extra,
    },
  }
}

function montarCenario({ projeto, movido, ids }) {
  return [
    noTerminal('e2e-ausente', 0, { cwd: projeto, sessionId: ids.ausente }),
    noTerminal('e2e-disco', 1, { cwd: projeto, sessionId: ids.disco }),
    // A conversa nasceu em `projeto`; o bloco aponta para `movido`.
    noTerminal('e2e-movido', 2, { cwd: movido, agentCwd: projeto, sessionId: ids.movido }),
    noTerminal('e2e-conta', 3, { cwd: projeto, sessionId: ids.conta, extra: { accountId: 'conta-removida-e2e', providerId: 'claude', accountMode: 'pinned' } }),
    noTerminal('e2e-gemini', 4, { cwd: projeto, sessionId: ids.gemini, provider: 'gemini' }),
  ]
}

function devtools(args, { tolerar = false } = {}) {
  const r = spawnSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], { encoding: 'utf8', env: process.env, timeout: 120_000 })
  if (r.status !== 0 && !tolerar) throw new Error(`devtools ${args[0]} falhou (${r.status}): ${(r.stderr || r.stdout || '').slice(0, 400)}`)
  return (r.stdout || '').trim()
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function esperar(descricao, leitura, ok, prazoMs) {
  const limite = Date.now() + prazoMs
  let ultimo
  while (Date.now() < limite) {
    try { ultimo = leitura(); if (ok(ultimo)) return ultimo } catch (erro) { ultimo = String(erro.message) }
    await dormir(2000)
  }
  throw new Error(`Desfecho não chegou em ${prazoMs / 1000}s: ${descricao}. Último valor: ${JSON.stringify(ultimo).slice(0, 300)}`)
}

// `eval` imprime a string crua quando a expressão devolve string.
const lerNos = () => JSON.parse(devtools(['eval', 'window.felixo.canvas.list().then((r) => JSON.stringify(r.nodes))']) || '[]')
const dadosDe = (nos, id) => nos.find((n) => n.id === id)?.data

function argumento(nome) {
  const i = process.argv.indexOf(nome)
  return i > 0 ? process.argv[i + 1] : ''
}

async function principal() {
  const exe = argumento('--exe')
  const configDir = argumento('--config-dir')
  const out = argumento('--out')
  if (!exe || !configDir || !out) throw new Error('uso: --exe <app> --config-dir <pasta> --out <pasta>')
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) throw new Error('CLAUDE_CODE_OAUTH_TOKEN não está no ambiente do script.')
  fs.mkdirSync(out, { recursive: true })

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-retomada-'))
  const projeto = path.join(raiz, 'projeto')
  const movido = path.join(raiz, 'projeto-movido')
  fs.mkdirSync(projeto)
  fs.mkdirSync(movido)
  const ids = { ausente: randomUUID(), disco: randomUUID(), vizinha: randomUUID(), movido: randomUUID(), conta: randomUUID(), gemini: randomUUID() }

  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, '.claude.json'), JSON.stringify(configuracaoClaude([projeto, movido])))
  escreverConversa({ configDir, cwd: projeto, sessionId: ids.disco, titulo: 'Conversa antiga do bloco E2E', diasAtras: 3 })
  escreverConversa({ configDir, cwd: projeto, sessionId: ids.vizinha, titulo: 'Conversa vizinha mais nova', diasAtras: 1 })
  const antes = listarConversas(configDir, projeto)

  const resultado = { passos: [], cartoes: {} }
  const registrar = (nome) => resultado.passos.push(nome)
  try {
    devtools(['launch', '--packaged', exe, '--timeout', '60000'])
    const nos = montarCenario({ projeto, movido, ids })
    devtools(['eval', `(async () => { const b = window.felixo.canvas; await b.clear(); for (const n of ${JSON.stringify(nos)}) { const r = await b.save(n); if (!r?.ok) throw new Error(r?.message || n.id) } setTimeout(() => location.reload(), 100); return 'ok' })()`])
    registrar('canvas semeado')

    // Conversa ausente: a CLI recusa o ID, a faixa aparece e a falha fica persistida.
    await esperar('resumeFailure=expired na conversa ausente', lerNos, (l) => dadosDe(l, 'e2e-ausente')?.resumeFailure?.reason === 'expired', 120_000)
    registrar('ausente: resumeFailure=expired persistida')

    const texto = devtools(['text'])
    for (const frase of ['A CLI não encontrou a conversa', 'A conversa nasceu em outra pasta', 'Retomada automática indisponível no Gemini', 'A conta selecionada não existe mais']) {
      if (!texto.includes(frase)) throw new Error(`faixa ausente na tela: "${frase}"`)
    }
    registrar('faixas: ausente, projeto movido, Gemini e conta removida')

    // Conversa no disco: retomada exata, sem falha, sem conversa nova e sem trocar o ID.
    await dormir(20_000)
    const lidos = lerNos()
    const disco = dadosDe(lidos, 'e2e-disco')
    if (disco.agentSession?.sessionId !== ids.disco) throw new Error('a conversa no disco trocou de ID')
    if (disco.resumeFailure) throw new Error(`a conversa no disco registrou falha: ${JSON.stringify(disco.resumeFailure)}`)
    if (disco.previousAgentSession) throw new Error('a conversa no disco ganhou previousAgentSession')
    const novas = listarConversas(configDir, projeto).filter((f) => !antes.includes(f))
    if (novas.length) throw new Error(`a retomada criou conversa nova: ${novas.join(', ')}`)
    registrar('disco: mesmo ID, sem falha, sem conversa nova')

    // Os três cartões que a faixa bloqueia não podem ter trocado de conversa.
    for (const chave of ['movido', 'conta', 'gemini']) {
      if (dadosDe(lidos, `e2e-${chave}`).agentSession?.sessionId !== ids[chave]) throw new Error(`e2e-${chave} trocou de ID`)
    }
    registrar('movido, conta removida e Gemini: ID inalterado')
    resultado.cartoes = Object.fromEntries(lidos.map((n) => [n.id, { ...n.data, accountId: n.data.accountId ? '[conta de teste]' : undefined }]))

    // Recarregar a interface não pode perder o desfecho.
    devtools(['eval', 'setTimeout(() => location.reload(), 100)'], { tolerar: true })
    await dormir(15_000)
    if (dadosDe(lerNos(), 'e2e-ausente')?.resumeFailure?.reason !== 'expired') throw new Error('a falha da conversa ausente não sobreviveu ao reload')
    registrar('reload: desfecho preservado')
  } finally {
    devtools(['screenshot', '--out', path.join(out, 'canvas.png')], { tolerar: true })
    fs.writeFileSync(path.join(out, 'cartoes.json'), JSON.stringify(resultado, null, 2))
    devtools(['quit'], { tolerar: true })
  }
  console.log(`E2E da retomada: ${resultado.passos.length} desfechos conferidos`)
  for (const passo of resultado.passos) console.log(`  ok  ${passo}`)
}

module.exports = { codificarPasta, configuracaoClaude, escreverConversa, listarConversas, montarCenario }

if (require.main === module) {
  principal().catch((erro) => { console.error(`FALHOU: ${erro.message}`); process.exit(1) })
}
