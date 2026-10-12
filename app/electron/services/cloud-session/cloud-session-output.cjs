'use strict'

/**
 * Leitura da saída do `claude --cloud` — só funções puras.
 *
 * Formato medido num PTY real (Claude Code 2.1.287): o CLI cria a sessão em
 * poucos segundos e sai com código 0, imprimindo três linhas.
 *
 *   Created cloud session: <título>
 *   View: https://claude.ai/code/session_<ID>?from=cli&m=0
 *   Resume with: claude --teleport session_<ID>
 *
 * Na primeira vez numa pasta, antes disso, a TUI mostra a tela "Quick safety
 * check: Is this a project you created or one you trust?" e espera uma tecla.
 *
 * O PTY quebra linhas em 120 colunas e entrega a saída em pedaços de tamanho
 * arbitrário; por isso o parser trabalha sobre o texto ACUMULADO e devolve
 * `incomplete` enquanto o que chegou não prova nada.
 */

const { classifyFailure } = require('../accounts/failure-taxonomy.cjs')
const { redactSecrets } = require('../official-cli-account-status.cjs')

const CLOUD_SESSION_ERROR_CODES = Object.freeze([
  'trust-required',
  'login-required',
  'limit-reached',
  'repo-too-large',
  'network',
  'timeout',
  'interrupted',
  'invalid-input',
  'busy',
  'unknown',
])

/** Mensagens para a pessoa, em português; o cartão mostra exatamente estas. */
const CLOUD_SESSION_ERROR_MESSAGES = Object.freeze({
  'trust-required':
    'O Claude ainda não confia nesta pasta. Abra o Claude uma vez nela, confie na pasta e tente de novo.',
  'login-required':
    'A conta escolhida não está logada com assinatura. Entre pelo login do Claude e tente de novo.',
  'limit-reached': 'A conta atingiu um limite de uso. Veja Configurações > Uso no Claude.',
  'repo-too-large': 'O repositório é grande demais para enviar à nuvem (limite de 100 MB).',
  network: 'Falha de rede ao falar com o Claude. Confira a conexão.',
  timeout:
    'O Claude demorou demais para responder. A sessão pode ter sido criada: confira em claude.ai/code.',
  interrupted:
    'O app foi fechado durante o disparo. A sessão pode ter sido criada: confira em claude.ai/code.',
  'invalid-input': 'A tarefa ou a pasta não é válida.',
  busy: 'Já existe uma operação em andamento neste cartão.',
  unknown: 'O Claude devolveu uma resposta que o app não reconheceu.',
})

const CREATED_MARKER = 'Created cloud session:'
// Os rótulos valem só no começo da linha: o título que a pessoa escreveu pode
// conter "View:" ou "Resume with:", e uma sessão já criada (e cobrada) não pode
// virar erro por causa disso.
const VIEW_LABEL = /\n[ \t]*View:/
const RESUME_LABEL = /\n[ \t]*Resume with:/
const TITLE_MAX = 200
const TITLE_FALLBACK = 'Sessão na nuvem'
const URL_MAX = 300
// Só o host oficial, caminho `/code/session_<ID>` e query opcional.
const SESSION_URL_PATTERN = /^https:\/\/claude\.ai\/code\/(session_[A-Za-z0-9]+)(?:\?[^\s#]*)?$/
const TELEPORT_PATTERN = /claude --teleport (session_[A-Za-z0-9]+)/

/**
 * Remove sequências de controle do terminal. "Cursor 1 coluna à direita"
 * (ESC[nC) vira espaço, porque é assim que a TUI desenha o espaço entre
 * palavras — apagá-lo colaria as palavras.
 *
 * @param {unknown} text
 * @returns {string}
 */
function stripAnsi(text) {
  return String(text ?? '')
    .replace(/\x1b\[(\d*)C/g, (_match, count) => ' '.repeat(Math.max(1, Number(count) || 1)))
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g, '')
}

/**
 * @param {unknown} url
 * @returns {boolean}
 */
function isCloudSessionUrl(url) {
  return typeof url === 'string' && url.length <= URL_MAX && SESSION_URL_PATTERN.test(url)
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function isFollowUpSent(raw) {
  return /Sent to cloud session\./.test(stripAnsi(raw))
}

function normalizeTitle(segment) {
  const title = segment.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
  return title || TITLE_FALLBACK
}

function errorResult(code, message = CLOUD_SESSION_ERROR_MESSAGES[code]) {
  return { kind: 'error', code, message }
}

/** Sem linha de sessão: é a tela de confiança, uma falha conhecida ou ainda nada. */
function classifyWithoutSession(text) {
  if (/Is this a project you created or one you trust/i.test(text)) {
    return { kind: 'trust-required' }
  }

  const { failureClass } = classifyFailure({ text, origin: 'pty', providerId: 'claude' })
  switch (failureClass) {
    case 'limit':
    case 'billing':
      return errorResult('limit-reached')
    case 'auth':
      return errorResult('login-required')
    case 'network':
      return errorResult('network')
    case 'timeout':
      return errorResult('timeout')
    default:
      return { kind: 'incomplete' }
  }
}

/**
 * @typedef {'trust-required' | 'login-required' | 'limit-reached' | 'repo-too-large' |
 *   'network' | 'timeout' | 'interrupted' | 'invalid-input' | 'busy' | 'unknown'} CloudSessionErrorCode
 *
 * @typedef {{ kind: 'created', session: { id: string, url: string, title: string } }
 *   | { kind: 'trust-required' }
 *   | { kind: 'incomplete' }
 *   | { kind: 'error', code: CloudSessionErrorCode, message: string }} ParseResult
 */

/**
 * Lê o texto acumulado do PTY.
 *
 * @param {unknown} raw
 * @param {{ final?: boolean }} [options] `final` = o processo já saiu; aceita a
 *   última linha sem quebra. Antes disso, uma linha sem `\n` pode estar cortada
 *   no meio do ID e é tratada como incompleta.
 * @returns {ParseResult}
 */
function parseCloudSessionOutput(raw, { final = false } = {}) {
  const text = stripAnsi(raw).replace(/\r/g, '')
  const createdAt = text.indexOf(CREATED_MARKER)
  if (createdAt === -1) {
    return classifyWithoutSession(text)
  }

  const afterCreated = text.slice(createdAt + CREATED_MARKER.length)
  const view = VIEW_LABEL.exec(afterCreated)
  if (!view) {
    return { kind: 'incomplete' }
  }

  const afterView = afterCreated.slice(view.index + view[0].length)
  const resume = RESUME_LABEL.exec(afterView)
  if (!resume) {
    return { kind: 'incomplete' }
  }

  const resumeText = afterView.slice(resume.index + resume[0].length)
  const lineEnd = resumeText.indexOf('\n')
  if (lineEnd === -1 && !final) {
    return { kind: 'incomplete' }
  }

  const teleport = TELEPORT_PATTERN.exec(lineEnd === -1 ? resumeText : resumeText.slice(0, lineEnd))
  if (!teleport) {
    return final ? errorResult('unknown') : { kind: 'incomplete' }
  }

  // A URL pode vir quebrada em duas linhas pelo PTY: sem espaço nenhum nela.
  const url = afterView.slice(0, resume.index).replace(/\s+/g, '')
  const match = SESSION_URL_PATTERN.exec(url)
  if (!match || url.length > URL_MAX) {
    return errorResult('unknown')
  }
  if (match[1] !== teleport[1]) {
    return errorResult('unknown')
  }

  return {
    kind: 'created',
    session: { id: match[1], url, title: normalizeTitle(afterCreated.slice(0, view.index)) },
  }
}

/**
 * Últimas linhas da saída, sem controle de terminal e sem segredo — o que o
 * cartão pode mostrar quando a saída não foi reconhecida.
 *
 * @param {unknown} raw
 * @param {number} [maxLines]
 * @returns {string}
 */
function summarizeTail(raw, maxLines = 20) {
  const lines = stripAnsi(raw)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
  return redactSecrets(lines.slice(-maxLines).join('\n'))
}

module.exports = {
  CLOUD_SESSION_ERROR_CODES,
  CLOUD_SESSION_ERROR_MESSAGES,
  isCloudSessionUrl,
  isFollowUpSent,
  parseCloudSessionOutput,
  stripAnsi,
  summarizeTail,
}
