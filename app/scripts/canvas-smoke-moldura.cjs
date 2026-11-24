'use strict'

/**
 * Controles da moldura do canvas que não tinham teste (task 3ec91f95-497e-818f-b9f2-f9710605c303): cada `checar…` aciona
 * o controle e confere o efeito no DOM. Os cliques são `dispatchEvent` (a janela escondida não entrega RAF, e a checagem
 * de estabilidade do Playwright expiraria); teclado e mouse usam o Playwright direto.
 *
 * Cada check parte do canvas da fixture de sobreposições (`prepararCanvas`: um grupo, um arquivo, sete agentes, uma
 * Página Web) e deixa o app como achou: o próximo recarrega e recomeça.
 */

const { prepararCanvas, garantirSidebarAberta, abrirSecaoFerramentas } = require('./canvas-smoke-sobreposicoes.cjs')

const TIMEOUT_MS = process.platform === 'win32' ? 20_000 : 5_000
const POLLING_MS = 100

function falhar(mensagem, detalhe) {
  throw new Error(`[canvas-smoke:moldura] ${mensagem}${detalhe === undefined ? '' : `: ${JSON.stringify(detalhe)}`}`)
}

const mainEval = (page, expressao) => page.evaluate((fonte) => window.felixo.devtools.mainEval(fonte), expressao)

/** Janela e canvas de partida: fixture limpa, 1280x800, sidebar aberta. */
async function prepararCenario(page) {
  await prepararCanvas(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForFunction(() => window.innerWidth === 1280, null, { timeout: TIMEOUT_MS, polling: POLLING_MS })
  await page.waitForTimeout(400)
  await garantirSidebarAberta(page)
  // A barra de status é a fonte da contagem de blocos (o DOM só tem o que está à vista) e se atualiza depois do recarregamento.
  await esperar(page, () => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) >= 10, null, 'a barra de status não mostrou os blocos da fixture')
}

/** Clica o primeiro botão de `raiz` cujo nome (aria-label, título ou texto) casa com `padrao`. Devolve se achou. */
async function clicar(page, raiz, padrao) {
  return page.evaluate(
    ([seletor, fonte]) => {
      const regex = new RegExp(fonte)
      // O nome visível, o aria-label e o título contam: um botão com `title` longo tem o rótulo curto só no texto.
      const botao = [...document.querySelectorAll(`${seletor} button, ${seletor} [role="button"], ${seletor} [role="tab"]`)].find((el) =>
        [el.getAttribute('aria-label'), el.textContent?.trim(), el.title].some((nome) => nome && regex.test(nome)),
      )
      if (!botao) return false
      botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    },
    [raiz, padrao.source],
  )
}

async function exigirClique(page, raiz, padrao, o_que) {
  if (!(await clicar(page, raiz, padrao))) falhar(`controle não encontrado: ${o_que}`, { raiz, padrao: padrao.source })
}

async function esperar(page, condicao, argumento, mensagem) {
  const ok = await page.waitForFunction(condicao, argumento, { timeout: TIMEOUT_MS, polling: POLLING_MS }).then(() => true, () => false)
  if (!ok) falhar(mensagem)
}

const contarNos = (page) =>
  page.evaluate(() => {
    const total = {}
    for (const no of document.querySelectorAll('.react-flow__node')) {
      const tipo = (no.className.match(/react-flow__node-(\w+)/) || [])[1]
      total[tipo] = (total[tipo] ?? 0) + 1
    }
    total.todos = Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1])
    return total
  })

const transformDoCanvas = (page) =>
  page.evaluate(() => {
    const v = document.querySelector('.react-flow__viewport')
    const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(v).transform)
    const [escala, , , , x, y] = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0]
    return { escala, x, y }
  })

/** Tecla no elemento focado (ou no body): a janela escondida não entrega o teclado do Playwright de forma confiável. */
const teclar = (page, key) =>
  page.evaluate((k) => {
    const alvo = document.activeElement ?? document.body
    for (const tipo of ['keydown', 'keyup']) alvo.dispatchEvent(new KeyboardEvent(tipo, { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, bubbles: true, cancelable: true }))
  }, key)

/** Seleciona um bloco pelo clique de verdade (o React Flow seleciona no pointerdown/click). */
async function selecionarBloco(page, id, extra = {}) {
  await page.locator(`[data-id="${id}"]`).first().click({ force: true, position: { x: 12, y: 12 }, ...extra })
  await esperar(page, (alvo) => document.querySelector(`[data-id="${alvo}"]`)?.classList.contains('selected'), id, `o bloco ${id} não ficou selecionado`)
}

// ---------------------------------------------------------------------------

/** Notificações: marcar lida, remover, marcar todas, filtros, busca, limpar lidas e mudo. */
async function checarPainelDeNotificacoes(page) {
  await prepararCenario(page)
  const agora = Date.now()
  const nova = (id, nodeId, lida) => ({ id, nodeId, createdAt: agora - 1000, readAt: lida ? agora : null, snapshot: { activity: 'idle', previewLines: [`feito ${id}`] } })
  await page.evaluate((historico) => localStorage.setItem('felixo:notification-history', JSON.stringify(historico)), [
    nova('n1', 'sob-terminal', false),
    nova('n2', 'sob-agente-1', false),
    nova('n3', 'sob-agente-2', true),
  ])
  await page.reload()
  await page.waitForSelector('.felixo-zoom-pill', { timeout: TIMEOUT_MS * 3 })
  await exigirClique(page, 'nav.felixo-activity-rail', /Notificações/, 'sino do trilho')
  const painel = '[data-felixo-canvas-panel="notifications"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })

  const naoLidas = () =>
    page.evaluate((sel) => Number(/Não lidas \((\d+)\)/.exec(document.querySelector(sel)?.textContent ?? '')?.[1] ?? NaN), painel)
  const remover = () => page.evaluate((sel) => document.querySelectorAll(`${sel} button[aria-label^="Remover notificação"]`).length, painel)

  // Mudo: o rótulo alterna.
  await exigirClique(page, painel, /^Mutar notificações$/, 'Mutar')
  await esperar(page, (sel) => Boolean(document.querySelector(`${sel} button[aria-label="Ativar som das notificações"]`)), painel, 'Mutar não trocou para "Ativar som"')
  await exigirClique(page, painel, /^Ativar som das notificações$/, 'Ativar som')

  // Busca: filtra a lista e "Limpar busca" a devolve. Contagens relativas: os agentes da fixture geram notificações próprias.
  const totalAntes = await remover()
  await page.locator(`${painel} input[aria-label="Buscar notificações"]`).fill('sobreposição')
  await esperar(page, (sel) => document.querySelectorAll(`${sel} button[aria-label^="Remover notificação"]`).length === 1, painel, 'a busca não filtrou a lista')
  await exigirClique(page, painel, /^Limpar busca$/, 'Limpar busca')
  await esperar(page, ([sel, n]) => document.querySelectorAll(`${sel} button[aria-label^="Remover notificação"]`).length >= n, [painel, totalAntes], '"Limpar busca" não devolveu a lista')

  // Marcar como lida baixa o contador de não lidas.
  const antes = await naoLidas()
  await exigirClique(page, painel, /^Marcar como lida: Agente sobreposição$/, 'Marcar como lida')
  await esperar(page, ([sel, n]) => Number(/Não lidas \((\d+)\)/.exec(document.querySelector(sel)?.textContent ?? '')?.[1]) === n, [painel, antes - 1], 'marcar como lida não baixou o contador')

  // Remover tira o item.
  const antesDeRemover = await remover()
  await exigirClique(page, painel, /^Remover notificação: Agente extra 1$/, 'Remover notificação')
  await esperar(page, ([sel, n]) => document.querySelectorAll(`${sel} button[aria-label^="Remover notificação"]`).length < n, [painel, antesDeRemover], 'remover não tirou o item')

  // Marcar todas zera as não lidas; o filtro do histórico mostra as lidas; limpar lidas esvazia o histórico.
  // Os agentes de mentira da fixture seguem gerando notificações, então "Não lidas (0)" dura poucos quadros: um observador
  // instalado antes do clique registra se o contador chegou a zero.
  await page.evaluate((sel) => {
    window.__zerou = false
    new MutationObserver(() => {
      // Sem não lidas a aba perde o número: "Não lidas" sozinho (ou (0)) quer dizer zerado.
      const texto = document.querySelector(sel)?.textContent ?? ''
      if (/Não lidas \(0\)/.test(texto) || !/Não lidas \(\d+\)/.test(texto)) window.__zerou = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  }, painel)
  await exigirClique(page, painel, /^Marcar todas como lidas$/, 'Marcar todas')
  await esperar(page, () => window.__zerou === true, null, 'marcar todas não zerou as não lidas')
  await exigirClique(page, painel, /^Histórico/, 'aba Histórico')
  const historicoAntes = await page.evaluate((sel) => Number(/Histórico \((\d+)\)/.exec(document.querySelector(sel)?.textContent ?? '')?.[1]), painel)
  // Contador a ser observado (os agentes da fixture repõem notificações logo depois): basta cair em algum momento.
  await page.evaluate(([sel, n]) => {
    window.__caiu = false
    new MutationObserver(() => {
      if (Number(/Histórico \((\d+)\)/.exec(document.querySelector(sel)?.textContent ?? '')?.[1] ?? 0) < n) window.__caiu = true
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  }, [painel, historicoAntes])
  await exigirClique(page, painel, /^Limpar notificações lidas$/, 'Limpar lidas')
  await esperar(page, () => window.__caiu === true, null, '"Limpar lidas" não reduziu o histórico')
}

/** Limpar (destrutivo): o confirm cancelado não apaga; aceito, o overlay de operação aparece enquanto limpa e some ao terminar. */
async function checarLimparComOverlay(page) {
  await prepararCenario(page)
  const antes = (await contarNos(page)).todos
  const dialogos = []
  const aoDialogo = (dialogo) => {
    dialogos.push(dialogo.message().slice(0, 20))
    void (dialogos.length === 1 ? dialogo.dismiss() : dialogo.accept()).catch(() => {})
  }
  page.on('dialog', aoDialogo)
  try {
    await exigirClique(page, '[data-felixo-region="sidebar"] .felixo-sidebar-content', /Excluir todos os blocos/, 'Limpar')
    await page.waitForTimeout(500)
    if ((await contarNos(page)).todos !== antes) falhar('cancelar o confirm apagou blocos')

    // A limpeza é rápida (poucos quadros): o overlay não dá para amostrar. Um observador instalado antes do clique registra se ele
    // chegou a existir, e o fim confere que não ficou de pé.
    const overlay = '[data-felixo-region="canvas"] div.cursor-wait[aria-hidden="true"]'
    await page.evaluate((sel) => {
      window.__viuOverlay = false
      new MutationObserver(() => {
        if (document.querySelector(sel)) window.__viuOverlay = true
      }).observe(document.body, { childList: true, subtree: true })
    }, overlay)
    await exigirClique(page, '[data-felixo-region="sidebar"] .felixo-sidebar-content', /Excluir todos os blocos/, 'Limpar (aceitar)')
    await esperar(page, () => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === 0, null, 'o Limpar aceito não apagou os blocos')
    await esperar(page, (sel) => !document.querySelector(sel), overlay, 'o overlay de operação ficou de pé depois do Limpar')
    if (!(await page.evaluate(() => window.__viuOverlay))) falhar('o overlay de operação nunca apareceu durante o Limpar')
  } finally {
    page.off('dialog', aoDialogo)
  }
}

/** Criar: Novo bloco, Grupo, Página Web válida, Abrir imagem e Abrir arquivo existente. */
async function checarCriarBlocos(page) {
  await prepararCenario(page)
  const raiz = '[data-felixo-region="sidebar"] .felixo-sidebar-content'
  const base = await contarNos(page)

  const criarNomeado = async (rotulo, tipo) => {
    await exigirClique(page, raiz, new RegExp(`^${rotulo}`), rotulo)
    const grupo = `${raiz} [role="group"][aria-label="Criar bloco ${rotulo}"]`
    await page.locator(grupo).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
    // O total vem da barra de status: um bloco criado fora da área visível não está no DOM (o React Flow só monta o que se vê).
    const alvo = (await contarNos(page)).todos
    await page.locator(`${grupo} input`).first().press('Enter')
    await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, alvo, `"${rotulo}" (${tipo}) não criou o bloco`)
  }
  await criarNomeado('Novo bloco', 'file')
  await criarNomeado('Grupo', 'group')

  // Página Web: endereço válido cria o bloco.
  await exigirClique(page, raiz, /^Página Web/, 'Página Web')
  const grupoWeb = `${raiz} [role="group"][aria-label="Criar bloco Página Web"]`
  await page.locator(grupoWeb).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const webs = (await contarNos(page)).todos
  await page.locator(`${grupoWeb} input[aria-label="Endereço do site"]`).fill('https://example.com/')
  await page.locator(`${grupoWeb} input[aria-label="Endereço do site"]`).press('Enter')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, webs, 'uma Página Web válida não criou o bloco')

  // Abrir imagem / Abrir arquivo existente: os seletores nativos são trocados por respostas do main.
  const os = require('node:os')
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-moldura-'))
  const png = path.join(dir, 'pixel.png')
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
  const md = path.join(dir, 'existente.md')
  fs.writeFileSync(md, '# existente\n')
  const js = (valor) => JSON.stringify(valor)
  try {
    await mainEval(
      page,
      `(() => { const ipc = mainWindow.webContents.ipc; for (const c of ['files:pick-image', 'text-file:pick']) ipc.removeHandler(c);
        ipc.handle('files:pick-image', () => ({ ok: true, canceled: false, path: ${js(png)}, name: 'pixel.png', size: 70, type: 'image/png' }));
        ipc.handle('text-file:pick', () => ({ ok: true, canceled: false, path: ${js(md)}, name: 'existente.md' })); return true })()`,
    )
    const antesImagem = (await contarNos(page)).todos
    await exigirClique(page, raiz, /^Abrir imagem/, 'Abrir imagem')
    await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, antesImagem, '"Abrir imagem" não criou o bloco')

    const antesArquivo = (await contarNos(page)).todos
    await exigirClique(page, raiz, /^Novo bloco/, 'Novo bloco (para Abrir arquivo existente)')
    await exigirClique(page, raiz, /^Abrir arquivo existente/, 'Abrir arquivo existente…')
    await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) > n, antesArquivo, '"Abrir arquivo existente…" não criou o bloco')
  } finally {
    await mainEval(page, `(() => { const ipc = mainWindow.webContents.ipc; for (const c of ['files:pick-image', 'text-file:pick']) ipc.removeHandler(c); return true })()`).catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  }
  if ((await contarNos(page)).todos <= base.todos) falhar('nenhum bloco novo no fim de Criar')
}

/** Organizar: os modos, Selecionar/Mover e o Enquadrar da sidebar. */
async function checarOrganizarEEnquadrar(page) {
  await prepararCenario(page)
  const raiz = '[data-felixo-region="sidebar"] .felixo-sidebar-content'
  const posicoes = () =>
    page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map((n) => [n.getAttribute('data-id'), n.style.transform])))

  const antes = await posicoes()
  await exigirClique(page, raiz, /^Organizar \d+ blocos/, 'Organizar')
  await esperar(page, (ant) => [...document.querySelectorAll('.react-flow__node')].some((n) => n.style.transform !== ant[n.getAttribute('data-id')]), antes, 'Organizar não moveu nenhum bloco')

  // Os três modos (um por botão do grupo): cada um organiza sem perder bloco.
  const total = (await contarNos(page)).todos
  for (const modo of ['single', 'by-repository', 'by-repository-row']) {
    await exigirClique(page, raiz, /^Modos de organização$/, 'Modos de organização')
    await page.locator('#canvas-organize-modes').waitFor({ state: 'visible', timeout: TIMEOUT_MS })
    const botoes = await page.evaluate(() => [...document.querySelectorAll('#canvas-organize-modes button')].map((b) => (b.textContent || '').trim()))
    if (botoes.length !== 3) falhar('o grupo de modos deveria ter 3 botões', botoes)
    const indice = ['single', 'by-repository', 'by-repository-row'].indexOf(modo)
    await page.evaluate((i) => document.querySelectorAll('#canvas-organize-modes button')[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })), indice)
    await page.waitForTimeout(500)
    if ((await contarNos(page)).todos !== total) falhar(`o modo ${modo} mudou a quantidade de blocos`)
  }

  // Selecionar/Mover alterna o rótulo; Enquadrar muda o viewport.
  await exigirClique(page, raiz, /^Modo seleção/, 'Selecionar/Mover')
  await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /Modo (mover|pan)/i.test(b.getAttribute('aria-label') || b.title || b.textContent || '')), raiz, 'Selecionar/Mover não alternou o modo')
  await exigirClique(page, raiz, /^Modo (mover|pan)/i, 'Mover (voltar)')
  const transform = await transformDoCanvas(page)
  await page.evaluate(() => window.felixo && 0)
  await exigirClique(page, '.felixo-zoom-pill', /^Reduzir zoom/, 'Reduzir zoom (para o Enquadrar mudar algo)')
  await page.waitForTimeout(700)
  const reduzido = await transformDoCanvas(page)
  if (reduzido.escala === transform.escala) falhar('Reduzir zoom não mudou a escala')
  await exigirClique(page, raiz, /^Enquadrar/, 'Enquadrar (sidebar)')
  await esperar(page, (e) => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('.react-flow__viewport')).transform); return m && Number(m[1].split(',')[0]) !== e }, reduzido.escala, 'Enquadrar não mudou o viewport')
}

/** Atalhos: Delete e Backspace apagam a seleção, Q alterna o modo, Shift soma à seleção. */
async function checarAtalhosDoCanvas(page) {
  await prepararCenario(page)
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    await atalhosDoCanvas(page)
  } finally {
    page.off('dialog', aceitar)
  }
}

async function atalhosDoCanvas(page) {
  const rotuloModo = () =>
    page.evaluate(() => [...document.querySelectorAll('.felixo-sidebar-content button')].map((b) => b.getAttribute('aria-label') || b.title || '').find((t) => /^Modo (seleção|mover|pan)/i.test(t)) ?? null)

  await selecionarBloco(page, 'sob-agente-6')
  const antes = (await contarNos(page)).todos
  await page.keyboard.press('Delete')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n - 1, antes, 'Delete não apagou o bloco selecionado')

  await selecionarBloco(page, 'sob-agente-5')
  await page.keyboard.press('Backspace')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n - 2, antes, 'Backspace não apagou o bloco selecionado')

  // Q alterna Selecionar/Mover quando o canvas tem o foco.
  const modo = await rotuloModo()
  await page.locator('.react-flow__pane').first().click({ force: true, position: { x: 40, y: 40 } })
  await teclar(page, 'q')
  await esperar(page, (m) => [...document.querySelectorAll('.felixo-sidebar-content button')].map((b) => b.getAttribute('aria-label') || b.title || '').find((t) => /^Modo (seleção|mover|pan)/i.test(t)) !== m, modo, 'Q não alternou o modo')
  await teclar(page, 'q')

  // Shift soma à seleção. Blocos que não se sobrepõem: os agentes da fixture se cobrem, e o clique cairia em outro bloco.
  await selecionarBloco(page, 'sob-arquivo')
  await page.keyboard.down('Shift')
  await page.locator('[data-id="sob-web"]').first().click({ force: true, position: { x: 12, y: 12 } })
  await page.waitForTimeout(400)
  await page.keyboard.up('Shift')
  const selecionados = await page.evaluate(() => document.querySelectorAll('.react-flow__node.selected').length)
  if (selecionados < 2) falhar('Shift+clique não somou o segundo bloco à seleção', { selecionados })
}

/** Trilho: Projetos e Configurações abrem o painel. */
async function checarTrilhoProjetosEConfiguracoes(page) {
  await prepararCenario(page)
  for (const [rotulo, painel] of [[/^Projetos$/, 'projects'], [/^Configurações$/, 'settings']]) {
    await exigirClique(page, 'nav.felixo-activity-rail', rotulo, String(rotulo))
    await page.locator(`[data-felixo-canvas-panel="${painel}"]`).waitFor({ state: 'visible', timeout: TIMEOUT_MS }).catch(() => falhar(`o painel ${painel} não abriu pelo trilho`))
    await page.locator(`[data-felixo-canvas-panel="${painel}"] button[aria-label^="Fechar painel"]`).first().dispatchEvent('click')
    await page.locator(`[data-felixo-canvas-panel="${painel}"]`).waitFor({ state: 'hidden', timeout: TIMEOUT_MS })
  }
}

/** Alça de largura da sidebar: setas, Shift+setas, Home e duplo clique. */
async function checarAlcaDaSidebar(page) {
  await prepararCenario(page)
  const alca = '[role="separator"][aria-label="Redimensionar sidebar"]'
  const largura = () => page.evaluate(() => document.querySelector('[data-felixo-region="sidebar"]').getBoundingClientRect().width)
  const tecla = (key, shift = false) =>
    page.evaluate(([sel, k, s]) => document.querySelector(sel).dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: s, bubbles: true, cancelable: true })), [alca, key, shift])

  const inicial = await largura()
  await page.locator(alca).focus()
  await tecla('ArrowRight')
  await esperar(page, ([sel, w]) => document.querySelector('[data-felixo-region="sidebar"]').getBoundingClientRect().width > w, [alca, inicial], 'ArrowRight não alargou a sidebar')
  const passo = (await largura()) - inicial
  await tecla('ArrowRight', true)
  await esperar(page, ([sel, w]) => document.querySelector('[data-felixo-region="sidebar"]').getBoundingClientRect().width - w > 0, [alca, inicial + passo], 'Shift+ArrowRight não alargou mais que a seta')
  await tecla('ArrowLeft')
  await tecla('Home')
  await esperar(page, ([sel, w]) => Math.abs(document.querySelector('[data-felixo-region="sidebar"]').getBoundingClientRect().width - w) < 1.5, [alca, inicial], 'Home não voltou a sidebar à largura padrão')
  // Duplo clique também restaura.
  await tecla('ArrowRight', true)
  await page.locator(alca).dispatchEvent('dblclick')
  await esperar(page, ([sel, w]) => Math.abs(document.querySelector('[data-felixo-region="sidebar"]').getBoundingClientRect().width - w) < 1.5, [alca, inicial], 'o duplo clique não restaurou a largura da sidebar')
}

/** Campo de comando da barra: o clique abre a Busca. */
async function checarCampoDeComandoDaTopbar(page) {
  await prepararCenario(page)
  await page.locator('[data-felixo-region="topbar"] .felixo-command-trigger').first().dispatchEvent('click')
  await page.locator('[data-felixo-canvas-panel="search"]').waitFor({ state: 'visible', timeout: TIMEOUT_MS }).catch(() => falhar('o clique no campo de comando não abriu a Busca'))
}

/** Ditado: o botão alterna o estado de gravação (sem microfone o aviso aparece e pode ser fechado). */
async function checarBotaoDeDitado(page) {
  await prepararCenario(page)
  const botao = '[data-felixo-region="topbar"] button[aria-label^="Ditar por voz"], button[aria-label^="Ditar por voz"]'
  const antes = await page.evaluate((sel) => document.querySelector(sel)?.outerHTML ?? null, botao)
  if (!antes) falhar('botão de ditado ausente')
  await page.locator(botao).first().dispatchEvent('click')
  // Sem microfone/chave o ditado responde com um aviso ou muda o botão: o estado precisa mudar.
  await esperar(
    page,
    ([sel, html]) => document.querySelector(sel)?.outerHTML !== html || Boolean(document.querySelector('[role="alert"], [role="status"]:not([data-felixo-tour-avoid])')),
    [botao, antes],
    'o clique no ditado não mudou nada na tela',
  )
}

/** Barra de status: com um bloco selecionado, Remover o apaga. */
async function checarRemoverDaBarraDeStatus(page) {
  await prepararCenario(page)
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    await removerDaBarraDeStatus(page)
  } finally {
    page.off('dialog', aceitar)
  }
}

async function removerDaBarraDeStatus(page) {
  await selecionarBloco(page, 'sob-agente-4')
  const antes = (await contarNos(page)).todos
  await esperar(page, () => Boolean(document.querySelector('.felixo-canvas-statusbar button[aria-label^="Remover"]')), null, 'o botão Remover não apareceu com um bloco selecionado')
  await exigirClique(page, '.felixo-canvas-statusbar', /^Remover/, 'Remover (barra de status)')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n - 1, antes, 'Remover da barra de status não apagou o bloco')
}

/** Pílula de zoom: aumentar zoom e o cadeado. */
async function checarPilulaDeZoom(page) {
  await prepararCenario(page)
  const antes = await transformDoCanvas(page)
  await exigirClique(page, '.felixo-zoom-pill', /^Aumentar zoom/, 'Aumentar zoom')
  await esperar(page, (e) => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('.react-flow__viewport')).transform); return m && Number(m[1].split(',')[0]) > e }, antes.escala, 'Aumentar zoom não aumentou a escala')

  const rotulos = () => page.evaluate(() => [...document.querySelectorAll('.felixo-zoom-pill button')].map((b) => b.getAttribute('aria-label')))
  if (!(await rotulos()).includes('Travar o canvas')) falhar('o cadeado não está destravado de partida', await rotulos())
  await exigirClique(page, '.felixo-zoom-pill', /^Travar o canvas/, 'Cadeado')
  await esperar(page, () => [...document.querySelectorAll('.felixo-zoom-pill button')].some((b) => /^Destravar/.test(b.getAttribute('aria-label') || '')), null, 'o cadeado não passou a "Destravar"')
  // Travado, o Limpar fica desabilitado (a trava vale para o canvas inteiro).
  const limparDesabilitado = await page.evaluate(() => document.querySelector('.felixo-sidebar-danger')?.disabled)
  if (!limparDesabilitado) falhar('com o canvas travado o Limpar continuou habilitado')
  await exigirClique(page, '.felixo-zoom-pill', /^Destravar/, 'Cadeado (destravar)')
  await esperar(page, () => [...document.querySelectorAll('.felixo-zoom-pill button')].some((b) => /^Travar o canvas/.test(b.getAttribute('aria-label') || '')), null, 'o cadeado não voltou a "Travar"')
}

/** Mini Map: a roda dá zoom e o arrasto desloca o canvas. */
async function checarMiniMap(page) {
  await prepararCenario(page)
  const caixa = await page.evaluate(() => {
    const r = document.querySelector('.react-flow__minimap')?.getBoundingClientRect()
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  })
  if (!caixa) falhar('Mini Map ausente')
  const antes = await transformDoCanvas(page)
  await page.mouse.move(caixa.x + caixa.w / 2, caixa.y + caixa.h / 2)
  await page.mouse.wheel(0, -300)
  await esperar(page, (e) => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('.react-flow__viewport')).transform); return m && Number(m[1].split(',')[0]) !== e }, antes.escala, 'a roda sobre o Mini Map não deu zoom')
  const meio = await transformDoCanvas(page)
  await page.mouse.move(caixa.x + caixa.w * 0.5, caixa.y + caixa.h * 0.5)
  await page.mouse.down()
  await page.mouse.move(caixa.x + caixa.w * 0.2, caixa.y + caixa.h * 0.2, { steps: 6 })
  await page.mouse.up()
  await esperar(page, (e) => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('.react-flow__viewport')).transform); const [, , , , x, y] = m[1].split(',').map(Number); return x !== e.x || y !== e.y }, meio, 'arrastar o Mini Map não deslocou o canvas')
}

/** Inspector Elementos: envio em massa, reordenar por Alt+setas e Shift+setas global. */
async function checarInspectorElementos(page) {
  await prepararCenario(page)
  // Aberto: o puck só existe recolhido.
  await page.evaluate(() => {
    const puck = document.querySelector('button[aria-label="Abrir elementos"]')
    if (puck && puck.tabIndex === 0) puck.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await esperar(page, () => Boolean(document.querySelector('ul [data-element-row]')) && document.querySelector('button[aria-label="Recolher elementos"]')?.offsetParent !== null, null, 'o inspector Elementos não abriu')

  // Envio em massa: o modo mostra um campo de mensagem por terminal e desliga ao alternar de novo.
  const campos = () => page.evaluate(() => document.querySelectorAll('input[aria-label^="Mensagem para"], textarea[aria-label^="Mensagem para"]').length)
  if ((await campos()) !== 0) falhar('o modo em massa já começou ligado')
  await exigirClique(page, 'body', /^Alternar modo de enviar mensagens em massa$/, 'modo em massa')
  await esperar(page, () => document.querySelectorAll('[aria-label^="Mensagem para"]').length > 0, null, 'o modo em massa não mostrou os campos de mensagem')
  await exigirClique(page, 'body', /^Alternar modo de enviar mensagens em massa$/, 'modo em massa (desligar)')
  await esperar(page, () => document.querySelectorAll('[aria-label^="Mensagem para"]').length === 0, null, 'alternar de novo não escondeu os campos')

  const ordem = () =>
    page.evaluate(() => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelector('[data-element-row]'))
      return [...ul.querySelectorAll('[data-element-row]')].map((li) => li.innerText.replace(/\s+/g, ' ').replace(/^\d+ /, '').trim().slice(0, 30))
    })
  const teclaNaLista = (key, extra) =>
    page.evaluate(([k, mods]) => {
      const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelector('[data-element-row]'))
      ul.focus()
      ul.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
    }, [key, extra])

  // Alt+↓ move a linha ativa (a primeira) uma posição para baixo.
  const inicial = await ordem()
  await teclaNaLista('ArrowDown', { altKey: true })
  await esperar(page, (ini) => {
    const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelector('[data-element-row]'))
    const atual = [...ul.querySelectorAll('[data-element-row]')].map((li) => li.innerText.replace(/\s+/g, ' ').replace(/^\d+ /, '').trim().slice(0, 30))
    return atual[0] === ini[1] && atual[1] === ini[0]
  }, inicial, 'Alt+↓ não moveu a linha ativa para baixo')
  const aposAlt = await ordem()

  // Shift+↓ (global, fora de campo) move o cursor: o próximo Alt+↓ move OUTRA linha.
  await page.evaluate(() => {
    document.body.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(300)
  await teclaNaLista('ArrowDown', { altKey: true })
  await esperar(page, (ant) => {
    const ul = [...document.querySelectorAll('ul')].find((u) => u.querySelector('[data-element-row]'))
    const atual = [...ul.querySelectorAll('[data-element-row]')].map((li) => li.innerText.replace(/\s+/g, ' ').replace(/^\d+ /, '').trim().slice(0, 30))
    return atual.join('|') !== ant.join('|') && atual[0] === ant[0] && atual[1] === ant[1]
  }, aposAlt, 'Shift+↓ não moveu o cursor para outra linha (o Alt+↓ seguinte mexeu na mesma)')
}

/**
 * Topo legível em larguras de monitor comuns: o nome "Felixo AI Core" ao lado do logotipo não pode ficar sob a caixa de
 * busca nem sair da barra. A busca é centralizada (`left: 50%`) e a marca é fixa à esquerda, então o risco é a busca crescer
 * por cima da marca. Mede em 1280, 1440, 1600 e 1920 px (o viewport maior que a janela é o caso da captura da sessão F).
 */
async function checarTopoLegivelEmLarguras(page) {
  await prepararCenario(page)
  const medidas = []
  try {
    for (const largura of [1280, 1440, 1600, 1920]) {
      // Viewport emulado, como na captura da sessão F. A janela de verdade não é redimensionada: o app grava o tamanho dela
      // no perfil, e a sessão seguinte abriria com outra largura (a lista de Prompts da sessão J media 416 em vez de 420).
      await page.setViewportSize({ width: largura, height: 1100 })
      await page.waitForFunction((w) => window.innerWidth === w, largura, { timeout: TIMEOUT_MS, polling: POLLING_MS })
      await page.waitForTimeout(300)
      const topo = await page.evaluate(() => {
        const caixa = (el) => {
          const r = el?.getBoundingClientRect()
          return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null
        }
        const marca = document.querySelector('.felixo-topbar-brand')
        const busca = document.querySelector('.felixo-command-trigger')
        const texto = marca?.querySelector('.felixo-lockup-text') ?? marca
        const r = texto?.getBoundingClientRect()
        // O que está na frente do meio do nome: tem de ser a própria marca, não a caixa de busca.
        const alvo = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
        return {
          janela: window.innerWidth,
          marca: caixa(marca),
          nome: caixa(texto),
          busca: caixa(busca),
          frente: alvo ? (alvo.closest('.felixo-command-trigger') ? 'busca' : alvo.closest('.felixo-topbar-brand') ? 'marca' : alvo.tagName) : null,
        }
      })
      medidas.push(topo)
      if (!topo.marca || !topo.nome || !topo.busca) falhar(`o topo em ${largura} px não tem marca ou busca`, topo)
      if (topo.nome.right > topo.busca.left + 1) falhar(`em ${largura} px a caixa de busca cobre o nome do app`, topo)
      if (topo.frente === 'busca') falhar(`em ${largura} px a busca está na frente do nome do app`, topo)
      if (topo.busca.left < topo.marca.right) falhar(`em ${largura} px a busca começa antes do fim da área da marca`, topo)
      if (topo.busca.right > topo.janela || topo.nome.left < 0) falhar(`em ${largura} px o topo sai da janela`, topo)
    }
    console.log(`[canvas-smoke:moldura] checarTopoLegivelEmLarguras: ${medidas.map((m) => `${m.janela}px nome até ${Math.round(m.nome.right)} / busca de ${Math.round(m.busca.left)}`).join('; ')}`)
  } finally {
    await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {})
  }
}

/** Os checks na ordem do smoke: cada um recomeça da fixture (`prepararCenario`), então a ordem não importa. */
const CHECKS_DA_MOLDURA = [
  checarPainelDeNotificacoes,
  checarLimparComOverlay,
  checarCriarBlocos,
  checarOrganizarEEnquadrar,
  checarAtalhosDoCanvas,
  checarTrilhoProjetosEConfiguracoes,
  checarAlcaDaSidebar,
  checarCampoDeComandoDaTopbar,
  checarBotaoDeDitado,
  checarRemoverDaBarraDeStatus,
  checarPilulaDeZoom,
  checarMiniMap,
  checarInspectorElementos,
  checarTopoLegivelEmLarguras,
]

async function executarChecksDaMoldura(page) {
  for (const check of CHECKS_DA_MOLDURA) {
    await check(page)
    console.log(`[canvas-smoke:moldura] ${check.name}: ok`)
  }
}

module.exports = {
  CHECKS_DA_MOLDURA,
  executarChecksDaMoldura,
  checarAlcaDaSidebar,
  checarAtalhosDoCanvas,
  checarBotaoDeDitado,
  checarCampoDeComandoDaTopbar,
  checarCriarBlocos,
  checarInspectorElementos,
  checarLimparComOverlay,
  checarMiniMap,
  checarOrganizarEEnquadrar,
  checarPainelDeNotificacoes,
  checarPilulaDeZoom,
  checarRemoverDaBarraDeStatus,
  checarTopoLegivelEmLarguras,
  checarTrilhoProjetosEConfiguracoes,
}
