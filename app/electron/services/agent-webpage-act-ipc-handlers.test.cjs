require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')
const { registerAgentWebpageActIpcHandlers } = require('./agent-webpage-act-ipc-handlers.cjs')
const { classificarCampo } = require('./agent-webpage-field.cjs')
const { agirNaPagina } = require('./agent-webpage-act.cjs')

const JANELA = { webContents: { id: 1, send() {} }, isDestroyed: () => false }
const GUEST = { id: 7, isDestroyed: () => false, getType: () => 'webview', hostWebContents: { id: 1 } }

function montar(extras = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-act-'))
  const appPaths = { agentRequests: path.join(raiz, 'agent-requests') }
  const chamadas = []
  const relogio = { t: Date.parse('2026-11-18T12:00:00Z') }
  const controller = registerAgentWebpageActIpcHandlers({
    getMainWindow: () => JANELA,
    appPaths,
    dependencies: {
      ipcMain: { handle() {} },
      observeRequests: () => null,
      agora: () => relogio.t,
      fromId: (id) => (id === 7 ? GUEST : id === 8 ? { ...GUEST, getType: () => 'window' } : null),
      agirNaPagina: async (args) => {
        chamadas.push(args)
        return args.tipo === 'clicar'
          ? { ok: true, tipo: 'clicar', x: args.x, y: args.y, url: 'https://example.com/' }
          : { ok: true, tipo: 'digitar', caracteres: args.texto.length, url: 'https://example.com/' }
      },
      ...extras,
    },
  })
  const repositorio = criarRepositorioDePedidos({ pasta: appPaths.agentRequests, agora: () => relogio.t })
  const clicar = () => repositorio.registrar('pagina-agir', { idDoElemento: 'w1', tipo: 'clicar', x: 10, y: 20 })
  const digitar = (texto = 'segredo-123') =>
    repositorio.registrar('pagina-agir', { idDoElemento: 'w1', tipo: 'digitar', texto })
  return { controller, repositorio, clicar, digitar, chamadas, relogio }
}
const aprovar = (p, extra = {}) => ({ id: p.id, aprovar: true, idDoElemento: 'w1', tipo: p.tipo, webContentsId: 7, ...extra })

test('sem sessão o pedido espera o cartão e nada acontece na página', () => {
  const { controller, clicar, chamadas } = montar()
  clicar()
  assert.equal(controller.listRequests().length, 1)
  assert.equal(chamadas.length, 0)
  assert.deepEqual(controller.listSessions(), [])
})

test('permitir abre a sessão de 5 min e age; o próximo pedido do bloco é atendido sem cartão', async () => {
  const { controller, clicar, chamadas, repositorio, relogio } = montar()
  const primeiro = clicar()
  await controller.decide(aprovar(primeiro))
  assert.equal(repositorio.ler(primeiro.id).estado, 'aceito')
  assert.equal(controller.listSessions().length, 1)
  assert.equal(controller.listSessions()[0].expiraEm - relogio.t, 5 * 60 * 1000)

  const segundo = clicar()
  assert.equal(controller.listRequests().length, 0)
  await controller.aoMudarAFila()
  assert.equal(repositorio.ler(segundo.id).estado, 'aceito')
  assert.equal(chamadas.length, 2)
  controller.pararDeObservarPedidos()
})

test('a sessão acaba no prazo: o pedido volta a pedir o cartão', async () => {
  const { controller, clicar, relogio } = montar()
  await controller.decide(aprovar(clicar()))
  relogio.t += 5 * 60 * 1000 + 1
  assert.deepEqual(controller.listSessions(), [])
  clicar()
  assert.equal(controller.listRequests().length, 1)
  controller.pararDeObservarPedidos()
})

test('encerrar na hora acaba a sessão e o pedido seguinte volta ao cartão', async () => {
  const { controller, clicar } = montar()
  await controller.decide(aprovar(clicar()))
  assert.equal(controller.encerrarSessao('w1').encerrada, true)
  clicar()
  assert.equal(controller.listRequests().length, 1)
})

test('recusar não abre sessão nem age', async () => {
  const { controller, clicar, chamadas, repositorio } = montar()
  const p = clicar()
  await controller.decide({ ...aprovar(p), aprovar: false })
  assert.equal(chamadas.length, 0)
  assert.equal(controller.listSessions().length, 0)
  assert.equal(repositorio.ler(p.id).resultado.recusadoPor, 'pessoa')
})

test('webContents que não é webview da janela não abre sessão e o pedido segue pendente', async () => {
  const { controller, clicar, repositorio } = montar()
  const p = clicar()
  const r = await controller.decide(aprovar(p, { webContentsId: 8 }))
  assert.equal(r.ok, false)
  assert.equal(controller.listSessions().length, 0)
  assert.equal(repositorio.ler(p.id).estado, 'pendente')
})

test('campo de senha na sessão: o cartão pede confirmação por campo e confirmar digita uma vez, sem expor o texto', async () => {
  const { controller, clicar, digitar, repositorio } = montar({
    agirNaPagina: async (args) => {
      if (args.tipo === 'clicar') return { ok: true, tipo: 'clicar', x: args.x, y: args.y, url: 'u' }
      if (!args.confirmouCampoSensivel) return { ok: false, precisaConfirmar: 'senha' }
      return { ok: true, tipo: 'digitar', caracteres: args.texto.length, campoSensivel: 'senha', url: 'u' }
    },
  })
  await controller.decide(aprovar(clicar()))
  const p = digitar('senha-super-secreta')
  await controller.aoMudarAFila()
  assert.equal(repositorio.ler(p.id).estado, 'pendente')
  const [cartao] = controller.listRequests()
  assert.equal(cartao.campoSensivel, 'senha')
  assert.equal(cartao.caracteres, 19)
  assert.doesNotMatch(JSON.stringify(cartao), /senha-super-secreta/)

  const sem = await controller.decide(aprovar(p))
  assert.equal(sem.ok, false)
  assert.equal(repositorio.ler(p.id).estado, 'pendente')

  await controller.decide(aprovar(p, { confirmarCampo: true }))
  const gravado = repositorio.ler(p.id)
  assert.equal(gravado.estado, 'aceito')
  assert.equal(gravado.resultado.caracteres, 19)
  assert.doesNotMatch(JSON.stringify(gravado), /senha-super-secreta/)
})

test('o texto digitado some do arquivo do pedido depois do desfecho', async () => {
  const { controller, digitar, repositorio } = montar()
  const p = digitar('texto-que-nao-deve-ficar')
  assert.match(JSON.stringify(repositorio.ler(p.id)), /texto-que-nao-deve-ficar/)
  await controller.decide(aprovar(p))
  assert.doesNotMatch(JSON.stringify(repositorio.ler(p.id)), /texto-que-nao-deve-ficar/)
})

test('classificarCampo: senha, cartão por autocomplete e por nomes comuns; campo comum fica livre', () => {
  assert.equal(classificarCampo({ tag: 'input', type: 'password' }), 'senha')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', autocomplete: 'current-password' }), 'senha')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', name: 'user_senha' }), 'senha')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', autocomplete: 'cc-number' }), 'pagamento')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', autocomplete: 'section-x cc-exp' }), 'pagamento')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', name: 'cardnumber' }), 'pagamento')
  assert.equal(classificarCampo({ tag: 'input', type: 'tel', placeholder: 'CVV' }), 'pagamento')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', ariaLabel: 'Número do cartão' }), 'pagamento')
  assert.equal(classificarCampo({ tag: 'input', type: 'text', name: 'email', autocomplete: 'email' }), null)
  assert.equal(classificarCampo({ tag: 'textarea', name: 'mensagem' }), null)
})

test('agirNaPagina: clique manda mouse down/up; sem campo em foco recusa; sensível sem confirmação não digita', async () => {
  const eventos = []
  let digitado = null
  const guest = (campo) => ({
    getURL: () => 'https://example.com/p?token=abc',
    sendInputEvent: (e) => eventos.push(e.type),
    insertText: (t) => {
      digitado = t
    },
    executeJavaScriptInIsolatedWorld: async () => campo,
  })
  const clique = await agirNaPagina({ guest: guest(null), tipo: 'clicar', x: 5, y: 6 })
  assert.deepEqual(eventos, ['mouseMove', 'mouseDown', 'mouseUp'])
  assert.doesNotMatch(clique.url, /token/)

  const semFoco = await agirNaPagina({ guest: guest({ editavel: false }), tipo: 'digitar', texto: 'x' })
  assert.equal(semFoco.ok, false)
  assert.equal(digitado, null)

  const sensivel = await agirNaPagina({
    guest: guest({ editavel: true, sensivel: 'pagamento' }),
    tipo: 'digitar',
    texto: '4111',
  })
  assert.equal(sensivel.precisaConfirmar, 'pagamento')
  assert.equal(digitado, null)

  const confirmado = await agirNaPagina({
    guest: guest({ editavel: true, sensivel: 'pagamento' }),
    tipo: 'digitar',
    texto: '4111',
    confirmouCampoSensivel: true,
  })
  assert.equal(digitado, '4111')
  assert.equal(confirmado.caracteres, 4)
  assert.doesNotMatch(JSON.stringify(confirmado), /4111/)
})

test('pagina-agir recusa tipo fora da lista, coordenada ruim e texto vazio', () => {
  const r = criarRepositorioDePedidos({ pasta: fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-act-n-')) })
  assert.throws(() => r.registrar('pagina-agir', { idDoElemento: 'w', tipo: 'eval', texto: 'x' }), /não reconhecida/)
  assert.throws(() => r.registrar('pagina-agir', { idDoElemento: 'w', tipo: 'clicar', x: -1, y: 2 }), /x e y/)
  assert.throws(() => r.registrar('pagina-agir', { idDoElemento: 'w', tipo: 'clicar', x: 'abc', y: 2 }), /x e y/)
  assert.throws(() => r.registrar('pagina-agir', { idDoElemento: 'w', tipo: 'digitar', texto: '' }), /texto/)
  assert.equal(r.registrar('pagina-agir', { idDoElemento: 'w', tipo: 'clicar', x: '10.4', y: '20' }).x, 10)
})
