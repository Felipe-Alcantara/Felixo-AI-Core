'use strict'

/**
 * @module canvas-agent-read
 * Fatia 1 (leitura) da task "Canvas — agentes leem e editam qualquer
 * elemento do canvas": um agente lista os elementos da instância atual e lê
 * o conteúdo de um deles — terminal, nota, arquivo. Escrita fica para uma
 * fatia futura (o próprio roteiro da task pede leitura primeiro).
 *
 * Puro e testável: recebe os nós já carregados (`canvasRepository.list()`),
 * as sessões de terminal já carregadas (`terminalLogStore.getSessions()`) e
 * uma função de redação — nunca abre o repositório nem o store sozinho, quem
 * monta essas dependências é o handler IPC (`agent-canvas-read-ipc-handlers.cjs`).
 */

const path = require('node:path')

/** Tipos com leitura suportada nesta fatia. Os demais respondem `ok:false` com uma mensagem clara, não um erro. */
const TIPOS_SUPORTADOS = new Set(['terminal', 'note', 'file'])

const MAX_LINHAS_TERMINAL_PADRAO = 200

/**
 * Rótulo curto pra cada nó, pro `canvas-listar` — a mesma heurística que os
 * cabeçalhos dos blocos já usam (label explícito, senão um resumo do tipo).
 *
 * @param {{ id: string, type: string, data?: Record<string, unknown> }} node
 * @returns {string}
 */
function descreverElemento(node) {
  const data = node.data && typeof node.data === 'object' ? node.data : {}
  const label = typeof data.label === 'string' && data.label.trim() ? data.label.trim() : null

  if (label) return label
  if (node.type === 'note') return primeriaLinha(typeof data.text === 'string' ? data.text : '') || 'Nota sem título'
  if (node.type === 'file') return (typeof data.fileLabel === 'string' && data.fileLabel) || path.basename(String(data.filePath || data.fileName || '')) || 'Arquivo'
  if (node.type === 'webpage') return typeof data.url === 'string' ? data.url : 'Página web'
  return node.type
}

function primeriaLinha(texto) {
  const linha = texto.split(/\r?\n/).find((item) => item.trim())
  return linha ? linha.trim().slice(0, 80) : ''
}

/**
 * @param {Array<{ id: string, type: string, data?: Record<string, unknown> }>} nodes
 * @returns {Array<{ id: string, type: string, label: string, leituraSuportada: boolean }>}
 */
function listarElementos(nodes) {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    label: descreverElemento(node),
    leituraSuportada: TIPOS_SUPORTADOS.has(node.type),
  }))
}

/**
 * Concatena os chunks de uma sessão de terminal (na ordem que
 * `terminalLogStore.getSessions()` já entrega) e devolve só as últimas
 * `maxLinhas` linhas — ler um terminal alheio inteiro, com milhares de
 * linhas de scrollback, não é o que "ler o terminal" costuma significar.
 *
 * @param {{ chunks?: Array<{ chunk?: string }> }} session
 * @param {number} maxLinhas
 * @returns {string}
 */
function ultimasLinhasDaSessao(session, maxLinhas) {
  const textoCompleto = (session?.chunks ?? []).map((chunk) => chunk?.chunk ?? '').join('')
  // Sem isso, um texto terminado em \n (o caso comum) split em N+1 "linhas"
  // — a última sempre vazia — e a linha de verdade mais antiga das N pedidas
  // seria descartada no lugar dela.
  const semQuebraFinal = textoCompleto.replace(/\r?\n$/, '')
  if (!semQuebraFinal) return ''
  const linhas = semQuebraFinal.split(/\r?\n/)
  return linhas.slice(-Math.max(1, maxLinhas)).join('\n')
}

/**
 * Lê o conteúdo de um elemento do canvas pelo id.
 *
 * @param {{
 *   id: string,
 *   nodes: Array<{ id: string, type: string, data?: Record<string, unknown> }>,
 *   terminalSessions: Array<{ sessionId: string, chunks?: Array<{ chunk?: string }> }>,
 *   readFile: (absolutePath: string) => Promise<string>,
 *   redact: (text: string) => string,
 *   canvasFilesDir: string,
 *   maxLinhasTerminal?: number,
 * }} options
 * @returns {Promise<{ ok: boolean, id: string, type?: string, label?: string, content?: string, message?: string }>}
 */
async function lerElemento({ id, nodes, terminalSessions, readFile, redact, canvasFilesDir, maxLinhasTerminal = MAX_LINHAS_TERMINAL_PADRAO }) {
  const node = nodes.find((item) => item.id === id)
  if (!node) {
    return { ok: false, id, message: `Nenhum elemento com id "${id}" neste canvas.` }
  }

  const label = descreverElemento(node)
  const data = node.data && typeof node.data === 'object' ? node.data : {}

  if (node.type === 'terminal') {
    // O id do próprio nó é o sessionId — não existe um campo separado
    // guardando isso (ver comentário em TerminalNodeData); é assim que o
    // resto do app (pty-ipc-handlers.cjs) já referencia a sessão.
    const session = terminalSessions.find((item) => item.sessionId === id)
    if (!session) {
      return { ok: true, id, type: node.type, label, content: '', message: 'Terminal sem saída registrada ainda.' }
    }
    return { ok: true, id, type: node.type, label, content: redact(ultimasLinhasDaSessao(session, maxLinhasTerminal)) }
  }

  if (node.type === 'note') {
    return { ok: true, id, type: node.type, label, content: redact(typeof data.text === 'string' ? data.text : '') }
  }

  if (node.type === 'file') {
    const caminho = resolverCaminhoDoArquivo(data, canvasFilesDir)
    if (!caminho) {
      return { ok: false, id, type: node.type, label, message: 'Este bloco de arquivo ainda não aponta pra nenhum caminho.' }
    }
    try {
      const conteudo = await readFile(caminho)
      return { ok: true, id, type: node.type, label, content: redact(conteudo) }
    } catch (error) {
      return { ok: false, id, type: node.type, label, message: `Não foi possível ler o arquivo: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  return { ok: false, id, type: node.type, label, message: `Tipo de bloco "${node.type}" ainda não tem leitura nesta fatia da task.` }
}

/**
 * `fileName` é relativo à pasta de arquivos do app (bloco que o próprio
 * canvas criou); `filePath` é absoluto (bloco apontando pra um arquivo que
 * já existia). Mutuamente exclusivos — ver `FileNodeData`.
 *
 * @param {Record<string, unknown>} data
 * @param {string} canvasFilesDir
 * @returns {string}
 */
function resolverCaminhoDoArquivo(data, canvasFilesDir) {
  if (typeof data.filePath === 'string' && data.filePath.trim()) return data.filePath.trim()
  if (typeof data.fileName === 'string' && data.fileName.trim()) return path.join(canvasFilesDir, data.fileName.trim())
  return ''
}

module.exports = {
  TIPOS_SUPORTADOS,
  MAX_LINHAS_TERMINAL_PADRAO,
  descreverElemento,
  lerElemento,
  listarElementos,
  resolverCaminhoDoArquivo,
  ultimasLinhasDaSessao,
}
