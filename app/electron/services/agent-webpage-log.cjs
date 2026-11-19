'use strict'

/**
 * @module agent-webpage-log
 * Registro curto do que acontece num bloco Página Web (mensagens do console,
 * navegações e falhas de carga), para o agente ler com `felixo browser logs`
 * depois da permissão da pessoa. Vive só em memória, por webContents, e guarda
 * as últimas `LIMITE` entradas: nada vai a disco e nada sai daqui sem passar
 * pela redação de `redigirLogs`.
 *
 * Rede: método, endereço (query redigida), status e tipo, sem corpo nem
 * cabeçalhos. Vem do `webContents.debugger` (domínio `Network` do CDP), anexado
 * só ao webview e sem porta aberta, e não do `webRequest` da sessão, que é
 * ouvinte único e o app já usa.
 */

const { redactSensitiveText } = require('./git-secret-redaction.cjs')
const { redactUrlSecrets } = require('./url-secret-redaction.cjs')

const LIMITE = 200
const TEXTO_MAX = 500
const NIVEIS = ['verbose', 'info', 'warning', 'error']

/** @type {WeakMap<object, { entradas: object[], total: number }>} */
const registros = new WeakMap()

function registroDe(wc) {
  let registro = registros.get(wc)
  if (!registro) {
    registro = { entradas: [], total: 0 }
    registros.set(wc, registro)
  }
  return registro
}

function anotar(wc, entrada) {
  const registro = registroDe(wc)
  registro.total += 1
  registro.entradas.push({ em: new Date().toISOString(), ...entrada })
  if (registro.entradas.length > LIMITE) registro.entradas.shift()
}

/** Anota que um script de usuário rodou (ou falhou ao injetar) nesta página; aparece em `browser logs`. */
function anotarScript(wc, script, erro) {
  anotar(wc, erro ? { tipo: 'script', nivel: 'error', texto: `script "${script.nome}" não rodou: ${erro instanceof Error ? erro.message : String(erro)}` } : { tipo: 'script', nivel: 'info', texto: `script "${script.nome}" rodou` })
}

/** Liga os ouvintes num webContents de bloco Página Web (chamado uma vez, na criação). */
function observarPagina(wc) {
  if (!wc || typeof wc.on !== 'function' || registros.has(wc)) return
  registroDe(wc)
  wc.on('console-message', (event, nivel, mensagem, linha, origem) => {
    // Electron novo entrega um objeto de evento; o antigo, os argumentos soltos.
    const dados = event && typeof event === 'object' && 'message' in event ? event : { level: nivel, message: mensagem, lineNumber: linha, sourceId: origem }
    const level = typeof dados.level === 'number' ? (NIVEIS[dados.level] ?? 'info') : String(dados.level ?? 'info')
    anotar(wc, { tipo: 'console', nivel: level, texto: String(dados.message ?? ''), origem: String(dados.sourceId ?? ''), linha: dados.lineNumber })
  })
  observarRede(wc)
  wc.on('did-navigate', (_event, url) => anotar(wc, { tipo: 'navegacao', url: String(url ?? '') }))
  wc.on('did-navigate-in-page', (_event, url) => anotar(wc, { tipo: 'navegacao', url: String(url ?? '') }))
  wc.on('did-fail-load', (_event, codigo, descricao, url) => anotar(wc, { tipo: 'erro-de-carga', codigo, texto: String(descricao ?? ''), url: String(url ?? '') }))
}

/**
 * Requisições do bloco pelo CDP. `attach` falha se outro debugger já estiver ligado (o DevTools do
 * próprio bloco, por exemplo): então o bloco só fica sem log de rede, o resto continua.
 */
function observarRede(wc) {
  const dbg = wc.debugger
  if (!dbg || typeof dbg.attach !== 'function') return
  /** @type {Map<string, { metodo: string, url: string, recurso: string }>} */
  const pendentes = new Map()
  try {
    dbg.attach('1.3')
    void Promise.resolve(dbg.sendCommand('Network.enable')).catch(() => {})
  } catch {
    return
  }
  dbg.on('message', (_event, metodo, params) => {
    if (metodo === 'Network.requestWillBeSent') {
      pendentes.set(params.requestId, { metodo: params.request?.method ?? 'GET', url: String(params.request?.url ?? ''), recurso: String(params.type ?? '') })
    } else if (metodo === 'Network.responseReceived') {
      const base = pendentes.get(params.requestId)
      if (base) {
        pendentes.delete(params.requestId)
        anotar(wc, { tipo: 'rede', metodo: base.metodo, url: base.url, status: params.response?.status, recurso: base.recurso })
      }
    } else if (metodo === 'Network.loadingFailed') {
      const base = pendentes.get(params.requestId)
      pendentes.delete(params.requestId)
      // Sem a requisição de origem (cancelada antes de sair) não há o que contar.
      if (base) anotar(wc, { tipo: 'rede', metodo: base.metodo, url: base.url, status: 0, recurso: base.recurso, texto: String(params.errorText ?? 'falhou') })
    }
    if (pendentes.size > LIMITE) pendentes.delete(pendentes.keys().next().value)
  })
}

/** Redação antes de entregar: segredo em texto e em endereço, texto cortado. */
function redigirLogs(entradas, redact = redactSensitiveText) {
  return entradas.map((entrada) => ({
    ...entrada,
    ...(entrada.texto !== undefined ? { texto: redact(String(entrada.texto)).slice(0, TEXTO_MAX) } : {}),
    ...(entrada.url !== undefined ? { url: redactUrlSecrets(entrada.url) } : {}),
    ...(entrada.origem !== undefined ? { origem: redactUrlSecrets(entrada.origem) } : {}),
  }))
}

/** O que o agente recebe: as últimas entradas, já redigidas, e quantas houve desde que o bloco abriu. */
function lerLogs(wc, redact) {
  const registro = registros.get(wc) ?? { entradas: [], total: 0 }
  return { entradas: redigirLogs(registro.entradas, redact), total: registro.total, limite: LIMITE }
}

module.exports = { LIMITE, anotarScript, lerLogs, observarPagina, redigirLogs }
