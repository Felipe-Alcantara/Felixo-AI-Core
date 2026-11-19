'use strict'

const path = require('node:path')
const electron = require('electron')

const { observeAgentRequests } = require('./agent-request-watcher.cjs')
const { criarRepositorioDePedidos, pedidoAindaVale } = require('./fetch-all/agent-requests.cjs')
const { casaUrl, criarGerenciadorDeScripts, definirGerenciador, executarScriptsEm } = require('./agent-userscripts.cjs')

const SCRIPT_ACTION = 'pagina-script'

/** Avisa a interface que um agente propôs um script e espera a pessoa. */
const SCRIPTS_CHANNEL = 'canvas:agent-scripts'

const NAO_PENDENTE = 'Esse pedido não está mais pendente.'
const EXPIROU = 'O pedido expirou sem resposta da pessoa.'

/**
 * Scripts de usuário que um agente propõe (`felixo browser script add`), o
 * "Tampermonkey nativo". Instalar NUNCA é automático: o pedido fica pendente
 * até a pessoa ler o código no painel de aprovações e aceitar. O que chega do
 * renderer é só o id e a escolha; o código instalado é o do pedido gravado.
 *
 * Remover, ativar e desativar só reduzem o que roda (ou religam o que a
 * pessoa já aprovou), então o app os atende sozinho, sem cartão.
 *
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | undefined, appPaths: { agentRequests: string, config: string }, dependencies?: object }} options
 */
function registerAgentScriptIpcHandlers({ getMainWindow, appPaths, dependencies = {} }) {
  const pedidos = (dependencies.createRequests ?? criarRepositorioDePedidos)({ pasta: appPaths.agentRequests })
  const agora = dependencies.agora ?? (() => Date.now())
  const ipc = dependencies.ipcMain ?? electron.ipcMain
  const gerenciador = dependencies.gerenciador ?? criarGerenciadorDeScripts({ arquivo: path.join(appPaths.config, 'userscripts.json') })
  /** Webviews abertos agora: o script novo roda neles sem esperar a próxima navegação. */
  const listarWebviews =
    dependencies.listarWebviews ?? (() => electron.webContents.getAllWebContents().filter((wc) => wc.getType() === 'webview'))
  definirGerenciador(gerenciador)

  const pendentes = () => pedidos.listarPendentes({ acao: SCRIPT_ACTION }).filter((pedido) => pedido.operacao === 'registrar')

  function atenderOperacoesSimples() {
    for (const pedido of pedidos.listarPendentes({ acao: SCRIPT_ACTION })) {
      if (pedido.operacao === 'registrar') continue
      let ok = false
      if (pedido.operacao === 'remover') ok = gerenciador.remover(pedido.scriptId)
      else if (pedido.operacao === 'ativar') ok = gerenciador.definirAtivo(pedido.scriptId, true)
      else if (pedido.operacao === 'desativar') ok = gerenciador.definirAtivo(pedido.scriptId, false)
      pedidos.resolver(pedido.id, {
        aceito: ok,
        resultado: ok ? { ok: true, operacao: pedido.operacao, scriptId: pedido.scriptId } : { ok: false, message: `Script não encontrado: ${pedido.scriptId}` },
      })
    }
  }

  function avisar() {
    const window = getMainWindow?.()
    if (window && !window.isDestroyed()) window.webContents.send(SCRIPTS_CHANNEL, { requests: pendentes() })
  }

  atenderOperacoesSimples()
  const watcher = (dependencies.observeRequests ?? observeAgentRequests)(appPaths.agentRequests, () => {
    atenderOperacoesSimples()
    avisar()
  })

  ipc.handle('canvas:list-agent-scripts', () => guard(() => ({ requests: pendentes() })))

  ipc.handle('canvas:decide-agent-script', (_event, params) =>
    guard(async () => {
      const id = typeof params?.id === 'string' ? params.id.trim() : ''
      const pedido = id ? pedidos.ler(id) : null
      if (!pedido || pedido.estado !== 'pendente' || pedido.acao !== SCRIPT_ACTION || pedido.operacao !== 'registrar') {
        return { resolved: null, message: NAO_PENDENTE }
      }
      if (!pedidoAindaVale(pedido, agora())) {
        return { resolved: pedidos.resolver(id, { aceito: false, resultado: { ok: false, recusadoPor: 'app', expirou: true, message: EXPIROU } }), message: EXPIROU }
      }
      if (params?.aceitar !== true) {
        return { resolved: pedidos.resolver(id, { aceito: false, resultado: { ok: false, recusadoPor: 'pessoa', message: 'A pessoa recusou instalar o script.' } }) }
      }
      let registro
      try {
        registro = gerenciador.adicionar({ nome: pedido.nome, match: pedido.match, codigo: pedido.codigo, mundo: pedido.mundo })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível instalar o script.'
        return { resolved: pedidos.resolver(id, { aceito: false, resultado: { ok: false, recusadoPor: 'app', message } }), message }
      }
      let aplicadoEm = 0
      for (const wc of listarWebviews()) aplicadoEm += await executarScriptsEm(wc, { paraUrl: (url) => (casaUrl(registro.match, url) ? [registro] : []) })
      return { resolved: pedidos.resolver(id, { aceito: true, resultado: { ok: true, scriptId: registro.id, nome: registro.nome, aplicadoEmPaginasAbertas: aplicadoEm } }) }
    }),
  )

  return { pedidos, gerenciador, pararDeObservarPedidos: () => watcher?.close() }
}

async function guard(run) {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : 'Falha ao tratar o script.' }
  }
}

module.exports = { SCRIPT_ACTION, SCRIPTS_CHANNEL, registerAgentScriptIpcHandlers }
