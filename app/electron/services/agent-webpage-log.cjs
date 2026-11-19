'use strict'

/**
 * @module agent-webpage-log
 * Registro curto do que acontece num bloco Página Web (mensagens do console,
 * navegações e falhas de carga), para o agente ler com `felixo browser logs`
 * depois da permissão da pessoa. Vive só em memória, por webContents, e guarda
 * as últimas `LIMITE` entradas: nada vai a disco e nada sai daqui sem passar
 * pela redação de `redigirLogs`.
 *
 * Não grava requisições de rede: o `webRequest` da sessão é um ouvinte único
 * que o app já usa para outras coisas, e trocá-lo mexeria nelas.
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
  wc.on('did-navigate', (_event, url) => anotar(wc, { tipo: 'navegacao', url: String(url ?? '') }))
  wc.on('did-navigate-in-page', (_event, url) => anotar(wc, { tipo: 'navegacao', url: String(url ?? '') }))
  wc.on('did-fail-load', (_event, codigo, descricao, url) => anotar(wc, { tipo: 'erro-de-carga', codigo, texto: String(descricao ?? ''), url: String(url ?? '') }))
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

module.exports = { LIMITE, lerLogs, observarPagina, redigirLogs }
