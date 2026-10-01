'use strict'

/**
 * Evidência do gate visual do canvas (`canvas-smoke.cjs`): tentativas por
 * sessão, relatório da execução e a limpeza do que vai para o artefato.
 *
 * - **Tentativas.** Uma sessão do smoke pode repetir até 2 vezes, qualquer
 *   que seja a falha (decisão do Felipe, 01/10/2026). Cada tentativa fica no
 *   relatório com o erro e a captura dela: uma sessão que só passou na
 *   repetição sai marcada como **instável**, no relatório e no resumo da run,
 *   para a oscilação não sumir atrás de um verde.
 * - **Relatório.** `build/canvas-smoke-evidencia/relatorio-<sistema>.json`:
 *   versão do app, commit, sistema, Node, Electron, origem do app (fonte ou
 *   empacotado), cada sessão com as tentativas e o comando que reproduz
 *   aquela sessão na máquina de quem lê.
 * - **Limpeza.** Erro e log saem sem pasta pessoal, usuário e nada com cara
 *   de chave ou token, porque o artefato fica público no GitHub.
 *
 * Nada aqui abre o app: o `canvas-smoke.cjs` passa as funções que rodam cada
 * sessão. Isso deixa as regras testáveis sem Electron
 * (`canvas-smoke-evidencia.test.cjs`).
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/** Tentativas por sessão: a primeira e mais duas repetições. */
const TENTATIVAS_PADRAO = 3

/** Padrões de segredo que nunca podem ir para um artefato público. */
const PADROES_DE_SEGREDO = [
  /sk-(?:or-v1-|ant-)?[A-Za-z0-9_-]{16,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[abpr]-[A-Za-z0-9-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]+)?/g,
  /(Bearer|token=|apikey=|api_key=)\s*[A-Za-z0-9._~+/-]{12,}/gi,
]

/** Teto de um erro no relatório: o resto está na captura e no log. */
const MAX_ERRO = 2_000

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * O texto sem segredo, sem a pasta pessoal e sem o nome de usuário.
 *
 * @param {unknown} valor
 * @param {{ home?: string, usuario?: string, trocas?: [string, string][] }} [opcoes]
 */
function limparTexto(valor, opcoes = {}) {
  const home = opcoes.home ?? os.homedir()
  const usuario = opcoes.usuario ?? safeUsername()
  let texto = valor instanceof Error ? valor.stack || valor.message : String(valor ?? '')
  for (const [de, para] of opcoes.trocas ?? []) {
    if (de) texto = texto.split(de).join(para)
  }
  if (home && home.length > 1) texto = texto.split(home).join('~')
  if (usuario && usuario.length > 2) {
    texto = texto.replace(new RegExp(`(^|[\\\\/\\s:])${escapeRegExp(usuario)}(?=$|[\\\\/\\s:])`, 'g'), '$1<usuario>')
  }
  for (const padrao of PADROES_DE_SEGREDO) {
    texto = texto.replace(padrao, (achado, prefixo) =>
      typeof prefixo === 'string' && /^(Bearer|token=|apikey=|api_key=)$/i.test(prefixo) ? `${prefixo} <segredo>` : '<segredo>')
  }
  return texto
}

function safeUsername() {
  try {
    return os.userInfo().username
  } catch {
    return ''
  }
}

/** O erro de uma tentativa como vai para o relatório: limpo e curto. */
function erroDoRelatorio(erro, opcoes) {
  return limparTexto(erro instanceof Error ? erro.message : erro, opcoes).slice(0, MAX_ERRO)
}

/**
 * Quantas tentativas valem nesta execução: `FELIXO_SMOKE_TENTATIVAS` (1 a 3;
 * 1 desliga a repetição para quem está depurando) ou o padrão.
 *
 * @param {Record<string, string | undefined>} env
 */
function tentativasDaExecucao(env = process.env) {
  const pedido = Number.parseInt(env.FELIXO_SMOKE_TENTATIVAS ?? '', 10)
  if (!Number.isInteger(pedido)) return TENTATIVAS_PADRAO
  return Math.min(TENTATIVAS_PADRAO, Math.max(1, pedido))
}

/**
 * O comando que repete uma sessão do smoke na máquina de quem lê.
 *
 * @param {{ sessao: string, empacotado?: boolean, plataforma?: string }} opcoes
 */
function comandoDeReproducao({ sessao, empacotado = false, plataforma = process.platform }) {
  const env = [`FELIXO_SMOKE_SESSOES=${sessao}`, 'FELIXO_SMOKE_TENTATIVAS=1']
  if (empacotado) env.push('FELIXO_SMOKE_PACKAGED=<executável do app empacotado>')
  const smoke = `${env.join(' ')} npm run test:canvas-smoke`
  return plataforma === 'linux' ? `cd app && xvfb-run -a --server-args="-screen 0 1280x800x24" env ${smoke}` : `cd app && ${smoke}`
}

/**
 * Relatório vazio da execução, com o que identifica o app e a máquina.
 *
 * @param {{ versao?: string, commit?: string, origem: string, electron?: string, sessoes: string[], tentativas: number }} dados
 */
function criarRelatorio({ versao = null, commit = null, origem, electron = null, sessoes, tentativas }) {
  return {
    schemaVersion: 1,
    resultado: 'em-andamento',
    app: { versao, commit, origem },
    ambiente: {
      plataforma: process.platform,
      arquitetura: process.arch,
      node: process.version,
      electron,
      ci: process.env.GITHUB_ACTIONS === 'true',
      run: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    },
    tentativasPorSessao: tentativas,
    sessoesPedidas: sessoes,
    sessoes: [],
    iniciadoEm: new Date().toISOString(),
    terminadoEm: null,
  }
}

/**
 * Roda uma sessão com até `tentativas` tentativas e registra cada uma no
 * relatório. Lança o erro da última quando nenhuma passa.
 *
 * @param {object} relatorio - De `criarRelatorio`.
 * @param {{ sessao: string, tentativas: number, executar: (tentativa: number) => Promise<unknown>, capturaDaTentativa?: (tentativa: number) => string | null, aoRepetir?: (tentativa: number, erro: unknown) => void, empacotado?: boolean, agora?: () => number, limpeza?: object }} opcoes
 */
async function rodarSessaoComTentativas(relatorio, opcoes) {
  const { sessao, tentativas, executar, capturaDaTentativa = () => null, aoRepetir = () => {}, empacotado = false } = opcoes
  const agora = opcoes.agora ?? Date.now
  const registro = {
    sessao,
    resultado: 'falhou',
    instavel: false,
    tentativas: [],
    reproducao: comandoDeReproducao({ sessao, empacotado }),
  }
  relatorio.sessoes.push(registro)

  let ultimoErro = null
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    const inicio = agora()
    try {
      await executar(tentativa)
      registro.tentativas.push({ tentativa, ok: true, duracaoMs: agora() - inicio })
      registro.resultado = 'passou'
      registro.instavel = tentativa > 1
      return registro
    } catch (erro) {
      ultimoErro = erro
      registro.tentativas.push({
        tentativa,
        ok: false,
        duracaoMs: agora() - inicio,
        erro: erroDoRelatorio(erro, opcoes.limpeza),
        captura: capturaDaTentativa(tentativa),
      })
      if (tentativa < tentativas) aoRepetir(tentativa, erro)
    }
  }
  throw ultimoErro
}

/** Resultado da execução inteira a partir das sessões registradas. */
function fecharRelatorio(relatorio, erroGeral = null, opcoes) {
  const falhou = Boolean(erroGeral) || relatorio.sessoes.some((sessao) => sessao.resultado !== 'passou')
  const instaveis = relatorio.sessoes.filter((sessao) => sessao.instavel).map((sessao) => sessao.sessao)
  relatorio.resultado = falhou ? 'falhou' : instaveis.length > 0 ? 'passou-com-instabilidade' : 'passou'
  relatorio.sessoesInstaveis = instaveis
  relatorio.sessoesNaoRodadas = relatorio.sessoesPedidas.filter((sessao) => !relatorio.sessoes.some((rodada) => rodada.sessao === sessao))
  if (erroGeral) relatorio.erro = erroDoRelatorio(erroGeral, opcoes)
  relatorio.terminadoEm = new Date().toISOString()
  return relatorio
}

/**
 * O resumo em Markdown para a página da run do GitHub (`GITHUB_STEP_SUMMARY`):
 * uma linha por sessão, com a instabilidade e a reprodução à vista.
 */
function resumoMarkdown(relatorio, titulo = 'Smoke do canvas') {
  const icone = { passou: '✅', falhou: '❌', 'passou-com-instabilidade': '⚠️' }
  const linhas = [
    `### ${titulo} — ${icone[relatorio.resultado] ?? ''} ${relatorio.resultado}`,
    '',
    `App ${relatorio.app.versao ?? '?'} · commit \`${(relatorio.app.commit ?? '?').slice(0, 7)}\` · ${relatorio.app.origem} · ${relatorio.ambiente.plataforma}/${relatorio.ambiente.arquitetura}`,
    '',
    '| Sessão | Resultado | Tentativas | Duração |',
    '| --- | --- | --- | --- |',
  ]
  for (const sessao of relatorio.sessoes) {
    const rotulo = sessao.instavel ? '⚠️ passou na repetição (instável)' : sessao.resultado === 'passou' ? '✅ passou' : '❌ falhou'
    const duracao = sessao.tentativas.reduce((soma, tentativa) => soma + tentativa.duracaoMs, 0)
    linhas.push(`| ${sessao.sessao} | ${rotulo} | ${sessao.tentativas.length} | ${Math.round(duracao / 1000)} s |`)
  }
  for (const sessao of relatorio.sessoesNaoRodadas ?? []) linhas.push(`| ${sessao} | não rodou | 0 | — |`)
  const problemas = relatorio.sessoes.flatMap((sessao) =>
    sessao.tentativas.filter((tentativa) => !tentativa.ok).map((tentativa) => ({ sessao, tentativa })))
  if (problemas.length > 0) {
    linhas.push('', '**Falhas por tentativa** (o artefato `canvas-smoke-evidencia-<sistema>` tem as capturas e o log):', '')
    for (const { sessao, tentativa } of problemas) {
      const primeira = (tentativa.erro ?? '').split('\n')[0].slice(0, 300)
      linhas.push(`- ${sessao.sessao}, tentativa ${tentativa.tentativa}: ${primeira}`)
    }
    const reproducoes = [...new Set(problemas.map(({ sessao }) => sessao.reproducao))]
    linhas.push('', 'Reproduzir localmente:', '', ...reproducoes.map((comando) => `    ${comando}`))
  }
  return `${linhas.join('\n')}\n`
}

/**
 * Grava o relatório, o resumo da run (no CI) e uma cópia limpa de cada log.
 *
 * @param {object} relatorio
 * @param {{ pasta: string, logs?: string[], resumo?: string | null, limpeza?: object }} destino
 */
function gravarEvidencia(relatorio, { pasta, logs = [], resumo = process.env.GITHUB_STEP_SUMMARY ?? null, limpeza, titulo }) {
  fs.mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `relatorio-${relatorio.ambiente.plataforma}.json`)
  fs.writeFileSync(arquivo, `${JSON.stringify(relatorio, null, 2)}\n`)
  for (const log of logs) {
    if (!log || !fs.existsSync(log)) continue
    const limpo = limparTexto(fs.readFileSync(log, 'utf8'), limpeza)
    fs.writeFileSync(path.join(pasta, path.basename(log)), limpo)
  }
  if (resumo) fs.appendFileSync(resumo, resumoMarkdown(relatorio, titulo))
  return arquivo
}

module.exports = {
  TENTATIVAS_PADRAO,
  comandoDeReproducao,
  criarRelatorio,
  fecharRelatorio,
  gravarEvidencia,
  limparTexto,
  resumoMarkdown,
  rodarSessaoComTentativas,
  tentativasDaExecucao,
}
