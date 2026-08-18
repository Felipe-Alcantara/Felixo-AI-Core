'use strict'

/**
 * O que estes testes protegem: o ⌘+W não voltar sozinho.
 *
 * Ele nunca foi escolhido — veio embutido no menu padrão do Electron. Qualquer
 * refatoração que troque este template por `role: 'windowMenu'` ou `role:
 * 'close'` reintroduz o atalho em silêncio, porque o role carrega o acelerador
 * junto. Por isso a asserção é sobre o ACELERADOR, não sobre o item.
 *
 * A plataforma é injetada para o menu do macOS ser exercitável em Linux — que
 * é a única máquina disponível para este trabalho.
 */

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  construirTemplateDoMenu,
  instalarMenuDoApp,
  temAcelerador,
} = require('./app-menu.cjs')

/** Achata o template em itens, para procurar por label em qualquer nível. */
function todosOsItens(template) {
  return template.flatMap((item) => [item, ...todosOsItens(item.submenu ?? [])])
}

function rolesDe(template) {
  return todosOsItens(template)
    .map((item) => item.role)
    .filter(Boolean)
}

test('no macOS, NENHUM item do menu usa Cmd+W', () => {
  const template = construirTemplateDoMenu({ plataforma: 'darwin' })

  assert.equal(temAcelerador(template, 'Cmd+W'), false)
  assert.equal(temAcelerador(template, 'CmdOrCtrl+W'), false)
})

test('no Windows e no Linux também não sobra Ctrl+W', () => {
  for (const plataforma of ['win32', 'linux']) {
    const template = construirTemplateDoMenu({ plataforma })

    assert.equal(
      temAcelerador(template, 'CmdOrCtrl+W'),
      false,
      `sobrou Ctrl+W em ${plataforma}`,
    )
  }
})

test('fechar janela continua existindo — só perde o atalho', () => {
  const template = construirTemplateDoMenu({ plataforma: 'darwin' })
  const fechar = todosOsItens(template).find((item) => item.label === 'Fechar janela')

  assert.ok(fechar, 'o item de fechar janela sumiu do menu')
  assert.equal(fechar.accelerator, undefined)
  assert.equal(typeof fechar.click, 'function')
})

test('nenhum item de fechar usa role: close, que traria o atalho de volta', () => {
  const template = construirTemplateDoMenu({ plataforma: 'darwin' })

  assert.equal(rolesDe(template).includes('close'), false)
  assert.equal(rolesDe(template).includes('windowMenu'), false)
})

test('o menu do macOS mantém os roles de edição', () => {
  // Sem estes, o app fica sem copiar e colar no macOS: lá esses atalhos vêm do
  // MENU, não do sistema. Seria trocar um incômodo por um pior.
  const roles = rolesDe(construirTemplateDoMenu({ plataforma: 'darwin' }))

  for (const obrigatorio of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
    assert.ok(roles.includes(obrigatorio), `faltou o role ${obrigatorio}`)
  }
})

test('sair (Cmd+Q) continua disponível — o alvo é o fechamento acidental', () => {
  const roles = rolesDe(construirTemplateDoMenu({ plataforma: 'darwin' }))

  assert.ok(roles.includes('quit'))
})

test('só o macOS ganha o menu do aplicativo', () => {
  const mac = construirTemplateDoMenu({ plataforma: 'darwin', nomeDoApp: 'Felixo AI Core' })
  const linux = construirTemplateDoMenu({ plataforma: 'linux' })

  assert.equal(mac[0].label, 'Felixo AI Core')
  assert.equal(rolesDe(linux).includes('quit'), false)
})

test('clicar em fechar janela fecha a janela recebida', () => {
  const template = construirTemplateDoMenu({ plataforma: 'darwin' })
  const fechar = todosOsItens(template).find((item) => item.label === 'Fechar janela')

  let fechou = false
  fechar.click(null, { close: () => { fechou = true } })

  assert.equal(fechou, true)
})

test('clicar em fechar sem janela focada não estoura', () => {
  const template = construirTemplateDoMenu({ plataforma: 'linux' })
  const fechar = todosOsItens(template).find((item) => item.label === 'Fechar janela')

  assert.doesNotThrow(() => fechar.click(null, undefined))
})

test('instalar constrói a partir do template e aplica no app', () => {
  const chamadas = []
  const Menu = {
    buildFromTemplate: (template) => {
      chamadas.push(['build', template])
      return { menu: true }
    },
    setApplicationMenu: (menu) => chamadas.push(['set', menu]),
  }

  const template = instalarMenuDoApp({ Menu, plataforma: 'darwin' })

  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[0][0], 'build')
  assert.deepEqual(chamadas[0][1], template)
  assert.deepEqual(chamadas[1], ['set', { menu: true }])
})
