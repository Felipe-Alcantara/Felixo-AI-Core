/**
 * @module app-menu
 * Menu de aplicação próprio — existe para TIRAR um atalho, não para adicionar.
 *
 * O app nunca definiu menu. Sem menu próprio, vale o menu padrão do Electron,
 * que no macOS entrega `Close Window` com o acelerador ⌘+W de graça. Ninguém
 * escolheu esse atalho; ele veio junto. E no Mac a tecla ⌘ fica fisicamente
 * onde no Windows fica o Alt, então quem alterna entre os dois sistemas acerta
 * ⌘+W sem querer — fechando a janela e levando os terminais junto.
 *
 * ATENÇÃO ao mexer aqui: no macOS, ⌘+C, ⌘+V, ⌘+A e ⌘+Z vêm DO MENU, não do
 * sistema. Um menu sem os *roles* de edição deixa o app sem copiar e colar —
 * troca um incômodo por um pior. É por isso que este arquivo repõe cada role
 * em vez de simplesmente apagar o menu.
 *
 * O que muda em relação ao padrão: o item de fechar janela continua existindo
 * (dá para fechar de propósito, pelo menu), mas SEM acelerador. Fechar passa a
 * exigir intenção.
 */

/**
 * Monta o template do menu para uma plataforma.
 *
 * Recebe a plataforma em vez de ler `process.platform` para o teste conseguir
 * exercitar o menu do macOS rodando em Linux — que é exatamente a situação em
 * que este arquivo foi escrito.
 *
 * @param {object} [options]
 * @param {string} [options.plataforma] - 'darwin', 'win32', 'linux'.
 * @param {string} [options.nomeDoApp]
 * @returns {Array<object>}
 */
function construirTemplateDoMenu({ plataforma = process.platform, nomeDoApp = 'Felixo AI Core' } = {}) {
  const ehMac = plataforma === 'darwin'

  /**
   * Fechar janela sem acelerador.
   *
   * `role: 'close'` traria ⌘+W/Ctrl+W embutido, então o item é declarado à mão.
   * `accelerator: undefined` não basta em todos os casos — o role é que carrega
   * o atalho, e por isso ele não é usado aqui.
   */
  const fecharJanela = {
    label: 'Fechar janela',
    click: (_item, janela) => janela?.close(),
  }

  const menuDeJanela = {
    label: 'Janela',
    submenu: [
      { role: 'minimize', label: 'Minimizar' },
      ...(ehMac
        ? [
            { role: 'zoom', label: 'Zoom' },
            { type: 'separator' },
            { role: 'front', label: 'Trazer tudo para a frente' },
            { type: 'separator' },
          ]
        : [{ type: 'separator' }]),
      fecharJanela,
    ],
  }

  const menuDeEdicao = {
    label: 'Editar',
    submenu: [
      { role: 'undo', label: 'Desfazer' },
      { role: 'redo', label: 'Refazer' },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Colar' },
      ...(ehMac ? [{ role: 'pasteAndMatchStyle', label: 'Colar e igualar estilo' }] : []),
      { role: 'delete', label: 'Excluir' },
      { role: 'selectAll', label: 'Selecionar tudo' },
    ],
  }

  const menuDeVisualizacao = {
    label: 'Exibir',
    submenu: [
      { role: 'reload', label: 'Recarregar' },
      { role: 'forceReload', label: 'Recarregar ignorando cache' },
      { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Tela cheia' },
    ],
  }

  // O menu do aplicativo (macOS) mantém ⌘+Q: sair é uma decisão deliberada e
  // continua disponível. O que esta mudança combate é o fechamento ACIDENTAL.
  const menuDoApp = {
    label: nomeDoApp,
    submenu: [
      { role: 'about', label: `Sobre o ${nomeDoApp}` },
      { type: 'separator' },
      { role: 'services', label: 'Serviços' },
      { type: 'separator' },
      { role: 'hide', label: `Ocultar ${nomeDoApp}` },
      { role: 'hideOthers', label: 'Ocultar outros' },
      { role: 'unhide', label: 'Mostrar tudo' },
      { type: 'separator' },
      { role: 'quit', label: `Sair do ${nomeDoApp}` },
    ],
  }

  return [
    ...(ehMac ? [menuDoApp] : []),
    menuDeEdicao,
    menuDeVisualizacao,
    menuDeJanela,
  ]
}

/**
 * Existe algum item do menu com este acelerador?
 *
 * Usada pelos testes para provar que ⌘+W não fecha janela — a asserção que
 * trava a regressão. Percorre submenu recursivamente porque o item pode estar
 * em qualquer nível.
 *
 * @param {Array<object>} template
 * @param {string} acelerador
 * @returns {boolean}
 */
function temAcelerador(template, acelerador) {
  const alvo = String(acelerador).toLowerCase()

  const percorrer = (itens) =>
    (itens ?? []).some((item) => {
      if (String(item.accelerator ?? '').toLowerCase() === alvo) {
        return true
      }

      return percorrer(item.submenu)
    })

  return percorrer(template)
}

/**
 * Instala o menu no app.
 *
 * @param {object} deps
 * @param {{ buildFromTemplate: Function, setApplicationMenu: Function }} deps.Menu
 * @param {string} [deps.plataforma]
 * @param {string} [deps.nomeDoApp]
 * @returns {Array<object>} O template aplicado, para inspeção em teste.
 */
function instalarMenuDoApp({ Menu, plataforma, nomeDoApp } = {}) {
  const template = construirTemplateDoMenu({ plataforma, nomeDoApp })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  return template
}

module.exports = {
  construirTemplateDoMenu,
  instalarMenuDoApp,
  temAcelerador,
}
