'use strict'

/**
 * Painéis de ferramenta do canvas sem teste de interface (task 3ec91f95-497e-81ca-8319-ee657b0b6492), começando pelo
 * Source Control. Cada `checar…` aciona os controles do painel e confere o efeito (e, quando há, a persistência).
 *
 * Os cliques são `dispatchEvent` (a janela escondida não entrega RAF). O Git usa um repositório de fixture, criado aqui
 * com um remoto local (`--bare`), e entra como projeto pelo mesmo caminho do app: o botão "Adicionar pasta" do painel
 * Projetos, cujo seletor nativo a instância de automação troca pela pasta combinada (FELIXO_DEVTOOLS_PROJECT_FOLDER).
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { prepararCanvas, garantirSidebarAberta, abrirSecaoFerramentas } = require('./canvas-smoke-sobreposicoes.cjs')

// O CI (Linux sob xvfb, macOS) é mais lento que a máquina local: o mesmo prazo largo em todo lugar.
const TIMEOUT_MS = 20_000
const POLLING_MS = 100

function falhar(mensagem, detalhe) {
  throw new Error(`[canvas-smoke:paineis] ${mensagem}${detalhe === undefined ? '' : `: ${JSON.stringify(detalhe)}`}`)
}

// ---------------------------------------------------------------------------
// Fixture: um repositório com remoto, uma branch extra, uma alteração e um arquivo novo
// ---------------------------------------------------------------------------

let repositorio = null

/** Cria (uma vez) o repositório de fixture e devolve a pasta. */
function criarRepositorioDeFixture() {
  if (repositorio) return repositorio
  // Desenvolvimento: reaproveita um repositório já criado (o app precisa subir com a pasta no ambiente).
  if (process.env.FELIXO_SMOKE_REPO && fs.existsSync(process.env.FELIXO_SMOKE_REPO)) return (repositorio = process.env.FELIXO_SMOKE_REPO)
  // O nome da pasta é o do projeto na lista (único por rodada); o remoto fica ao lado, fora do repositório.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-gitfx-'))
  const remoto = `${dir}-remoto.git`
  fs.mkdirSync(remoto)
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(remoto, 'init', '-q', '--bare', '-b', 'main')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'smoke@felixo.test')
  git(dir, 'config', 'user.name', 'Smoke')
  git(dir, 'config', 'core.autocrlf', 'false')
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src', 'a.txt'), 'um\n')
  fs.writeFileSync(path.join(dir, 'b.txt'), 'dois\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'inicial')
  git(dir, 'remote', 'add', 'origin', remoto)
  git(dir, 'push', '-q', '-u', 'origin', 'main')
  git(dir, 'branch', 'outra')
  fs.writeFileSync(path.join(dir, 'src', 'a.txt'), 'um\nmudou\n')
  fs.writeFileSync(path.join(dir, 'novo.txt'), 'novo\n')
  repositorio = dir
  return dir
}

/** As variáveis de ambiente que a sessão precisa para o seletor de pasta apontar a fixture. */
/** Devolve o repositório ao estado de partida (rodadas repetidas no mesmo app): branch main, uma alteração e um arquivo novo. */
function restaurarFixture(dir) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('checkout', '-q', '-f', 'main')
  git('reset', '-q', 'origin/main')
  git('checkout', '-q', '--', '.')
  git('clean', '-fdq')
  fs.writeFileSync(path.join(dir, 'src', 'a.txt'), 'um\nmudou\n')
  fs.writeFileSync(path.join(dir, 'novo.txt'), 'novo\n')
}

function ambienteDosPaineis() {
  return { FELIXO_DEVTOOLS_PROJECT_FOLDER: criarRepositorioDeFixture() }
}

// ---------------------------------------------------------------------------
// Helpers do renderer
// ---------------------------------------------------------------------------

async function clicar(page, raiz, padrao) {
  return page.evaluate(
    ([seletor, fonte]) => {
      const regex = new RegExp(fonte)
      const alvo = [...document.querySelectorAll(`${seletor} button, ${seletor} [role="button"], ${seletor} [role="tab"], ${seletor} [role="option"], ${seletor} [role="treeitem"]`)].find((el) =>
        [el.getAttribute('aria-label'), el.textContent?.trim(), el.title].some((nome) => nome && regex.test(nome)),
      )
      if (!alvo || alvo.disabled || alvo.getAttribute('aria-disabled') === 'true') return false
      alvo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    },
    [raiz, padrao.source],
  )
}

/**
 * Clica o controle quando ele existe e está habilitado: um painel ocupado (git rodando, IPC em voo) desabilita ou troca os botões,
 * e um clique nesse intervalo é ignorado. Tenta até o prazo; depois de clicar, dá um respiro para o painel assentar.
 */
async function exigirClique(page, raiz, padrao, o_que) {
  const limite = Date.now() + TIMEOUT_MS
  while (Date.now() < limite) {
    if (await clicar(page, raiz, padrao)) {
      await page.waitForTimeout(250)
      return
    }
    await page.waitForTimeout(POLLING_MS)
  }
  // O texto do painel na hora da falha vai na mensagem: no CI não há como olhar a tela.
  const visivel = await page.evaluate((sel) => (document.querySelector(sel)?.innerText ?? '').replace(/s+/g, ' ').slice(0, 320), raiz).catch(() => '')
  falhar(`controle não encontrado (ou desabilitado): ${o_que}`, { raiz, padrao: padrao.source, visivel })
}

async function esperar(page, condicao, argumento, mensagem) {
  const ok = await page.waitForFunction(condicao, argumento, { timeout: TIMEOUT_MS, polling: POLLING_MS }).then(() => true, () => false)
  if (!ok) falhar(mensagem)
}

/** Digita num campo React pelo setter nativo + evento `input` (não depende de o campo estar visível/estável na janela escondida). */
async function preencher(page, seletor, valor) {
  const ok = await page.evaluate(
    ([sel, texto]) => {
      const campo = document.querySelector(sel)
      if (!campo) return false
      const prototipo = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototipo, 'value').set.call(campo, texto)
      campo.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    [seletor, valor],
  )
  if (!ok) falhar('campo não encontrado', { seletor })
}

/** Espera (do lado do Node) um arquivo sumir do disco. */
async function esperarArquivoAusente(arquivo, mensagem) {
  for (let i = 0; i < 60 && fs.existsSync(arquivo); i += 1) await new Promise((resolve) => setTimeout(resolve, 100))
  if (fs.existsSync(arquivo)) falhar(mensagem, arquivo)
}

/** Espera a saída de um comando git no repositório satisfazer o predicado. */
async function esperarGit(dir, args, predicado, mensagem) {
  let saida = ''
  for (let i = 0; i < 60; i += 1) {
    saida = execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
    if (predicado(saida)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  falhar(mensagem, saida)
}

const textoDoPainel = (page, painel) => page.evaluate((sel) => document.querySelector(sel)?.innerText ?? '', painel)

async function prepararJanela(page) {
  await prepararCanvas(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForFunction(() => window.innerWidth === 1280, null, { timeout: TIMEOUT_MS, polling: POLLING_MS })
  await page.waitForTimeout(400)
  await garantirSidebarAberta(page)
}

/** Abre uma ferramenta da seção "Ferramentas" da sidebar pelo rótulo e espera o painel. */
async function abrirFerramenta(page, rotulo, painel) {
  await garantirSidebarAberta(page)
  await abrirSecaoFerramentas(page)
  await exigirClique(page, '[aria-label="Ferramentas auxiliares"]', new RegExp(rotulo), rotulo)
  await page.locator(`[data-felixo-canvas-panel="${painel}"]`).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
}

/** O repositório de fixture entra como projeto pelo botão "Adicionar pasta" do painel Projetos (a primeira vez). */
async function garantirProjetoDeFixture(page) {
  const nome = path.basename(criarRepositorioDeFixture())
  await exigirClique(page, 'nav.felixo-activity-rail', /^Projetos$/, 'Projetos (trilho)')
  const painel = '[data-felixo-canvas-panel="projects"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const ja = await page.evaluate(([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome])
  if (!ja) {
    await exigirClique(page, painel, /^Adicionar pasta$/, 'Adicionar pasta')
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'a pasta de fixture não entrou na lista de projetos')
  }
  await exigirClique(page, painel, /^Fechar painel/, 'Fechar Projetos')
  await page.locator(painel).waitFor({ state: 'hidden', timeout: TIMEOUT_MS })
}

// ---------------------------------------------------------------------------
// Source Control
// ---------------------------------------------------------------------------

/**
 * Source Control de ponta a ponta no repositório de fixture: escolher o repositório, o explorador (filtro, "só o que
 * mudou", abrir arquivo limpo e com alteração), stage e unstage por arquivo e em massa, descartar (destrutivo, com
 * confirmação), commit, Histórico (marca "não enviado"), trocar de branch, Push e Pull.
 */
async function checarSourceControl(page) {
  const dir = criarRepositorioDeFixture()
  const nome = path.basename(dir)
  restaurarFixture(dir)
  await prepararJanela(page)
  await garantirProjetoDeFixture(page)
  await abrirFerramenta(page, 'Source Control', 'git')
  const painel = '[data-felixo-canvas-panel="git"]'
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    // Escolher o repositório.
    await exigirClique(page, painel, /^Repositório$/, 'seletor de repositório')
    await exigirClique(page, 'body', new RegExp(nome), 'opção do repositório')
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n) && /Alterações/i.test(document.querySelector(sel)?.innerText ?? ''), [painel, nome], 'o painel não carregou o repositório escolhido')
    await esperar(page, (sel) => /novo\.txt/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'as alterações do repositório não apareceram')

    // Explorador: filtro e "só o que mudou".
    await preencher(page, `${painel} input[aria-label="Filtrar arquivos do repositório"]`, 'b.tx')
    await esperar(page, (sel) => !/novo\.txt/.test(document.querySelector(`${sel} [role="tree"]`)?.innerText ?? '') && /b\.txt/.test(document.querySelector(`${sel} [role="tree"]`)?.innerText ?? ''), painel, 'o filtro do explorador não filtrou')
    await preencher(page, `${painel} input[aria-label="Filtrar arquivos do repositório"]`, '')
    await exigirClique(page, painel, /^Mostrar só o que mudou$/, 'só o que mudou')
    await esperar(page, (sel) => !/b\.txt/.test(document.querySelector(`${sel} [role="tree"]`)?.innerText ?? ''), painel, '"só o que mudou" não escondeu o arquivo limpo')
    await exigirClique(page, painel, /^Mostrar todo o repositório$/, 'só o que mudou (desligar)')
    await esperar(page, (sel) => /b\.txt/.test(document.querySelector(`${sel} [role="tree"]`)?.innerText ?? ''), painel, 'desligar "só o que mudou" não trouxe o arquivo limpo de volta')

    // Abrir arquivo limpo (conteúdo) e com alteração (diff).
    await exigirClique(page, `${painel} [role="tree"]`, /^b\.txt/, 'arquivo limpo b.txt')
    await esperar(page, (sel) => /dois/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'abrir o arquivo limpo não mostrou o conteúdo')
    await exigirClique(page, `${painel} [role="tree"]`, /^src\/a\.txt|^a\.txt/, 'arquivo alterado a.txt')
    await esperar(page, (sel) => /mudou/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'abrir o arquivo alterado não mostrou o diff')

    // Stage por arquivo, descartar (confirmado) e stage em massa.
    await exigirClique(page, painel, /^Adicionar ao stage: src\/a\.txt$/, 'stage de a.txt')
    await esperar(page, (sel) => Boolean(document.querySelector(`${sel} button[aria-label^="Tirar do stage: src/a.txt"]`)), painel, 'o stage de a.txt não mostrou o controle de remover do stage')
    await exigirClique(page, painel, /^Tirar do stage: src\/a\.txt$/, 'unstage de a.txt')
    await esperar(page, (sel) => Boolean(document.querySelector(`${sel} button[aria-label^="Adicionar ao stage: src/a.txt"]`)), painel, 'o unstage de a.txt não devolveu o arquivo às alterações')
    // Um clique durante outra operação do painel (busy) é ignorado: espera os botões voltarem a ficar habilitados.
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button[aria-label^="Descartar"]`)].every((b) => !b.disabled), painel, 'os botões de descartar seguiram desabilitados')
    await page.waitForTimeout(600)
    await exigirClique(page, painel, /^Descartar alterações: novo\.txt$/, 'descartar novo.txt')
    await esperarArquivoAusente(path.join(dir, 'novo.txt'), 'descartar não removeu o arquivo novo do disco')
    await exigirClique(page, painel, /^Adicionar tudo ao stage$/, 'adicionar tudo ao stage')

    // Commit: a mensagem habilita o botão e o Histórico mostra o commit com a marca "não enviado".
    await preencher(page, `${painel} textarea[aria-label="Mensagem do commit"], ${painel} input[aria-label="Mensagem do commit"]`, 'commit do smoke')
    await exigirClique(page, painel, /^Criar commit/, 'Criar commit')
    await exigirClique(page, painel, /^Histórico/, 'aba Histórico')
    await esperar(page, (sel) => /commit do smoke/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o commit novo não apareceu no Histórico')
    const historico = await textoDoPainel(page, painel)
    if (!/inicial/.test(historico)) falhar('o Histórico não trouxe o commit anterior', historico.slice(0, 300))
    if (!/não enviado|nao enviado/i.test(historico)) falhar('o commit local não veio marcado como "não enviado"', historico.slice(0, 400))

    // Push envia; a marca some.
    await exigirClique(page, painel, /^Push/, 'Push')
    await esperar(page, (sel) => !/não enviado|nao enviado/i.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o Push não limpou a marca "não enviado"')
    const noRemoto = execFileSync('git', ['log', '--oneline', 'origin/main'], { cwd: dir, encoding: 'utf8' })
    if (!/commit do smoke/.test(noRemoto)) falhar('o Push não levou o commit ao remoto', noRemoto)

    // Pull com o remoto em dia não pode falhar.
    await exigirClique(page, painel, /^Pull/, 'Pull')
    await page.waitForTimeout(800)
    if (/erro|falha/i.test(await page.evaluate((sel) => document.querySelector(`${sel} [role="alert"]`)?.innerText ?? '', painel))) falhar('o Pull com o remoto em dia mostrou erro')

    // Trocar de branch.
    await exigirClique(page, painel, /^Branch$/, 'seletor de branch')
    await exigirClique(page, 'body', /^outra$/, 'branch "outra"')
    await esperarGit(dir, ['branch', '--show-current'], (saida) => saida === 'outra', 'trocar de branch pelo painel não mudou a branch do repositório')
  } finally {
    page.off('dialog', aceitar)
  }
}

// ---------------------------------------------------------------------------
// Pedidos de escrita dos agentes (a porta de confirmação contra prompt injection)
// ---------------------------------------------------------------------------

/** Registra um pedido de escrita no perfil isolado (o que `felixo canvas escrever` faz) e devolve o pedido. */
function registrarPedidoDeEscrita({ idDoElemento, conteudo, limparAntigos = false }) {
  const { readState } = require('../electron/cli/felixo-devtools.cjs')
  const { criarRepositorioDePedidos } = require('../electron/services/fetch-all/agent-requests.cjs')
  const estado = readState()
  if (!estado?.userData || estado.realProfile) falhar('gravar pedidos só é permitido num perfil isolado do felixo devtools')
  const pedidos = criarRepositorioDePedidos({ pasta: path.join(estado.userData, 'agent-requests') })
  // Pedidos de rodadas anteriores no mesmo perfil ficariam na frente da fila: recusa o que sobrou.
  for (const antigo of limparAntigos ? pedidos.listarPendentes({ acao: 'canvas-escrever' }) : []) {
    pedidos.resolver(antigo.id, { aceito: false, resultado: { ok: false, recusadoPor: 'smoke', message: 'pedido de rodada anterior' } })
  }
  return { pedidos, pedido: pedidos.registrar('canvas-escrever', { idDoElemento, conteudo, origem: 'canvas-smoke' }) }
}

/**
 * Pedidos de escrita: o agente PROPÕE, a pessoa decide. Aceitar escreve no bloco (e o pedido vira `aceito`); recusar não
 * muda nada (e vira `recusado`). O painel só mostra pendentes, e o bloco só muda depois do aceite.
 */
async function checarPedidosDeEscrita(page) {
  await prepararJanela(page)
  // O bloco que o agente pode escrever é a nota (blocos de arquivo ainda não aceitam escrita por agente).
  await page.evaluate(() => window.felixo.canvas.save({ id: 'smk-nota', type: 'note', position: { x: 60, y: 60 }, width: 240, height: 180, data: { text: 'texto antigo', label: 'Nota do smoke' } }))
  const painel = '[data-felixo-canvas-panel="agent-canvas-write-requests"]'
  // O painel mostra o mais antigo primeiro: o primeiro registrado é o que será recusado.
  const recusado = registrarPedidoDeEscrita({ idDoElemento: 'smk-nota', conteudo: 'texto recusado do agente', limparAntigos: true })
  const aceito = registrarPedidoDeEscrita({ idDoElemento: 'smk-nota', conteudo: 'texto aceito do agente' })
  await abrirFerramenta(page, 'Pedidos de escrita', 'agent-canvas-write-requests')
  await esperar(page, (sel) => /texto aceito do agente|aceito do agente/.test(document.querySelector(sel)?.innerText ?? '') || document.querySelectorAll(`${sel} button`).length > 2, painel, 'os pedidos pendentes não apareceram no painel')

  // O que está gravado no canvas (o DOM só tem os blocos à vista): a fonte da verdade da escrita.
  const textoDoBloco = () =>
    page.evaluate(async () => {
      const lista = await window.felixo.canvas.list()
      return (lista.nodes ?? lista).find((no) => no.id === 'smk-nota')?.data?.text ?? ''
    })
  if (/texto (aceito|recusado) do agente/.test(await textoDoBloco())) falhar('o bloco já tinha o texto do pedido antes de a pessoa decidir')

  // Recusar o primeiro da fila: nada muda no bloco e o pedido vira recusado.
  await exigirClique(page, painel, /^Recusar/, 'Recusar')
  await esperarPedido(aceito.pedidos, recusado.pedido.id, 'recusado')
  if (/texto recusado do agente/.test(await textoDoBloco())) falhar('recusar escreveu no bloco')

  // Aceitar o que sobrou (o segundo): o pedido vira aceito e o bloco muda.
  await exigirClique(page, painel, /^Aceitar e escrever/, 'Aceitar e escrever')
  await esperarPedido(aceito.pedidos, aceito.pedido.id, 'aceito')
  for (let i = 0; i < 40 && !/texto aceito do agente/.test(await textoDoBloco()); i += 1) await page.waitForTimeout(100)
  if (!/texto aceito do agente/.test(await textoDoBloco())) falhar('aceitar não escreveu o texto no bloco')
}

async function esperarPedido(pedidos, id, estadoEsperado) {
  let estado = null
  for (let i = 0; i < 80; i += 1) {
    estado = pedidos.ler(id)?.estado ?? null
    if (estado === estadoEsperado) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  falhar(`o pedido ${id} deveria estar "${estadoEsperado}"`, estado)
}

// ---------------------------------------------------------------------------
// Moldura comum dos painéis, Busca, QA Logger e Notas
// ---------------------------------------------------------------------------

const totalDeBlocos = (page) =>
  page.evaluate(() => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]))

/** Moldura do painel (CanvasPanel): Recolher/Expandir, a alça de largura (setas, Home) e Fechar. */
async function checarMolduraDosPaineis(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Notas', 'notes')
  const painel = '[data-felixo-canvas-panel="notes"]'
  const largura = () => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().width, painel)
  const alturaDoCorpo = () => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().height, painel)

  // Recolher esconde o corpo (a altura cai); Expandir devolve.
  const cheia = await alturaDoCorpo()
  await exigirClique(page, painel, /^Recolher painel Notas$/, 'Recolher')
  await esperar(page, ([sel, h]) => document.querySelector(sel).getBoundingClientRect().height < h - 20, [painel, cheia], 'Recolher não diminuiu o painel')
  const recolhida = await alturaDoCorpo()
  await exigirClique(page, painel, /^Expandir painel Notas$/, 'Expandir')
  // O conteúdo ainda pode estar chegando (a altura cresce com a lista): basta ter voltado acima da altura recolhida.
  await esperar(page, ([sel, h]) => document.querySelector(sel).getBoundingClientRect().height > h + 20, [painel, recolhida], 'Expandir não devolveu o corpo do painel')

  // Alça de largura: seta alarga, Home volta.
  const alca = '[role="separator"][aria-label="Redimensionar painel Notas"]'
  const inicial = await largura()
  const tecla = (key) => page.evaluate(([sel, k]) => document.querySelector(sel).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })), [alca, key])
  await page.evaluate((sel) => document.querySelector(sel).focus(), alca)
  await tecla('ArrowRight')
  await esperar(page, ([sel, w]) => document.querySelector(sel).getBoundingClientRect().width > w, [painel, inicial], 'a seta não alargou o painel')
  await tecla('Home')
  await esperar(page, ([sel, w]) => Math.abs(document.querySelector(sel).getBoundingClientRect().width - w) < 1.5, [painel, inicial], 'Home não devolveu a largura do painel')

  // Fechar tira o painel da tela.
  await exigirClique(page, painel, /^Fechar painel Notas$/, 'Fechar')
  await page.locator(painel).waitFor({ state: 'hidden', timeout: TIMEOUT_MS })
}

/** Busca: digitar acha o bloco, e o clique no resultado o seleciona (e fecha o painel). */
async function checarBuscaDeBlocos(page) {
  await prepararJanela(page)
  await page.evaluate(() => document.querySelector('[data-canvas-tool-trigger="search"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })))
  const painel = '[data-felixo-canvas-panel="search"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  await preencher(page, `${painel} input`, 'Arquivo baixo')
  await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /Arquivo baixo/.test(b.textContent ?? '')), painel, 'a busca não achou o bloco pelo título')
  await preencher(page, `${painel} input`, 'xyz-inexistente-xyz')
  await esperar(page, (sel) => ![...document.querySelectorAll(`${sel} button`)].some((b) => /Arquivo baixo/.test(b.textContent ?? '')), painel, 'um termo sem correspondência continuou mostrando o bloco')
  await preencher(page, `${painel} input`, 'Arquivo baixo')
  await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /Arquivo baixo/.test(b.textContent ?? '')), painel, 'a busca não voltou a achar o bloco')
  await exigirClique(page, painel, /Arquivo baixo/, 'resultado "Arquivo baixo"')
  await esperar(page, () => document.querySelector('[data-id="sob-arquivo"]')?.classList.contains('selected'), null, 'o clique no resultado não selecionou o bloco')
}

/** QA Logger: Limpar esvazia o painel e o histórico em disco; o relatório é gerado sem derrubar o painel. */
async function checarQaLogger(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'QA Logger', 'qa-logger')
  const painel = '[data-felixo-canvas-panel="qa-logger"]'
  await page.evaluate(() => window.felixo.qaLogger.log({ level: 'info', scope: 'smoke', message: 'entrada do smoke para limpar', details: null }))
  await esperar(page, (sel) => /entrada do smoke para limpar/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'a entrada gravada não apareceu no painel')
  await exigirClique(page, painel, /^Limpar$/, 'Limpar')
  await esperar(page, (sel) => !/entrada do smoke para limpar/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'Limpar não esvaziou o painel')
  const restantes = await page.evaluate(async () => (await window.felixo.qaLogger.getEntries()).filter((e) => e.message === 'entrada do smoke para limpar').length)
  if (restantes !== 0) falhar('Limpar não esvaziou o histórico em memória', restantes)
  await exigirClique(page, painel, /^Reportar problema/, 'Reportar problema')
  await esperar(page, (sel) => document.querySelector(sel) !== null && !/Gerando…/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o relatório de QA ficou "Gerando…"')
}

/** Modelos: um modelo gravado aparece na lista e Remover o apaga (conferido no main, que é a fonte). */
async function checarModelos(page) {
  await prepararJanela(page)
  const id = `smoke-modelo-${Date.now() % 100000}`
  const nome = `Modelo do smoke ${id}`
  const existe = () => page.evaluate(async (modeloId) => ((await window.felixo.models.list()).models ?? []).some((m) => m.id === modeloId), id)
  const salvo = await page.evaluate((m) => window.felixo.models.save(m), { id, name: nome, command: 'smoke-cli', source: 'smoke', cliType: 'claude' })
  if (!salvo?.ok) falhar('não foi possível gravar o modelo de fixture', salvo)
  try {
    await abrirFerramenta(page, 'Modelos', 'models')
    const painel = '[data-felixo-canvas-panel="models"]'
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'o modelo gravado não apareceu na lista do painel')
    await exigirClique(page, painel, new RegExp(`^Remover ${nome}$`), 'Remover o modelo')
    await esperar(page, ([sel, n]) => !(document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'Remover não tirou o modelo da lista')
    if (await existe()) falhar('Remover não apagou o modelo no processo principal', id)
  } finally {
    await page.evaluate((modeloId) => window.felixo.models.delete(modeloId), id).catch(() => {})
  }
}

/** Orquestrador: alterar um limite e marcar o modelo como preferido, Salvar, e conferir o que o main gravou (as configurações voltam ao original no fim). */
async function checarOrquestrador(page) {
  await prepararJanela(page)
  const id = `smoke-orq-${Date.now() % 100000}`
  const nome = `Modelo orquestrador ${id}`
  const original = await page.evaluate(() => window.felixo.settings.loadOrchestrator())
  const salvo = await page.evaluate((m) => window.felixo.models.save(m), { id, name: nome, command: 'smoke-cli', source: 'smoke', cliType: 'claude' })
  if (!salvo?.ok) falhar('não foi possível gravar o modelo de fixture', salvo)
  try {
    await abrirFerramenta(page, 'Orquestrador', 'orchestrator')
    const painel = '[data-felixo-canvas-panel="orchestrator"]'
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'o formulário do orquestrador não carregou o modelo')
    const campo = await marcarCampoPorRotulo(page, painel, 'Agentes por rodada')
    await preencher(page, campo, '7')
    await page.evaluate(([sel, n]) => {
      const cartao = [...document.querySelectorAll(`${sel} div`)].filter((el) => (el.textContent ?? '').includes(n) && el.querySelector('input[type="checkbox"]')).pop()
      const preferido = [...(cartao?.querySelectorAll('label') ?? [])].find((l) => /Preferido/.test(l.textContent ?? ''))
      preferido?.querySelector('input')?.click()
    }, [painel, nome])
    await exigirClique(page, painel, /^Salvar$/, 'Salvar o orquestrador')
    await esperar(page, (sel) => /Salvo/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o painel não mostrou "Salvo"')
    const gravado = await page.evaluate(() => window.felixo.settings.loadOrchestrator())
    const dados = gravado?.settings ?? gravado
    if (dados?.maxAgentsPerTurn !== 7) falhar('o limite de agentes por rodada não foi gravado', dados)
    if (!(dados?.preferredModelIds ?? []).includes(id)) falhar('o modelo preferido não foi gravado', dados)
  } finally {
    await page.evaluate((o) => window.felixo.settings.saveOrchestrator(o?.settings ?? o), original).catch(() => {})
    await page.evaluate((modeloId) => window.felixo.models.delete(modeloId), id).catch(() => {})
  }
}

/** Notas: criar blocos (nota e desenho), criar, editar e remover uma nota salva. */
async function checarNotas(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Notas', 'notes')
  const painel = '[data-felixo-canvas-panel="notes"]'
  const antes = await totalDeBlocos(page)
  await exigirClique(page, painel, /^Nova nota$/, 'Nova nota (bloco)')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, antes, 'Nova nota não criou o bloco')
  await exigirClique(page, painel, /^Novo desenho$/, 'Novo desenho')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 2, antes, 'Novo desenho não criou o bloco')

  // Nota salva: criar, editar (autosave com debounce) e remover.
  const salvas = () => page.evaluate(async () => ((await window.felixo.notes.list()).notes ?? []).filter((n) => n.title.startsWith('Nota do smoke') || n.title === 'Nova nota').map((n) => ({ id: n.id, title: n.title, content: n.content })))
  await exigirClique(page, painel, /^Nova$/, 'Nova (nota salva)')
  await esperar(page, () => document.querySelectorAll('[data-felixo-canvas-panel="notes"] textarea[placeholder="Conteúdo…"]').length > 0, null, 'a nota salva não apareceu no painel')
  await preencher(page, `${painel} textarea[placeholder="Conteúdo…"]`, 'conteúdo digitado no smoke')
  let gravadas = []
  for (let k = 0; k < 40; k += 1) {
    gravadas = await salvas()
    if (gravadas.some((n) => n.content === 'conteúdo digitado no smoke')) break
    await page.waitForTimeout(150)
  }
  if (!gravadas.some((n) => n.content === 'conteúdo digitado no smoke')) falhar('a edição da nota salva não foi gravada (autosave)', gravadas)
  await exigirClique(page, painel, /^Remover nota$/, 'Remover nota')
  await esperar(page, () => document.querySelectorAll('[data-felixo-canvas-panel="notes"] textarea[placeholder="Conteúdo…"]').length === 0, null, 'Remover nota não tirou a nota da lista')
  if ((await salvas()).some((n) => n.content === 'conteúdo digitado no smoke')) falhar('Remover nota não apagou a nota gravada')
}

// ---------------------------------------------------------------------------
// Prompts, Skills e Presets de agente
// ---------------------------------------------------------------------------

/** O campo ligado a um `<label>` pelo texto (nome visível), para formulários sem aria-label. */
async function marcarCampoPorRotulo(page, painel, rotulo) {
  const marca = `smk-${Math.random().toString(36).slice(2, 8)}`
  const ok = await page.evaluate(
    ([sel, texto, id]) => {
      const rotuloEl = [...document.querySelectorAll(`${sel} label`)].find((l) => (l.textContent ?? '').trim().startsWith(texto))
      const campo = rotuloEl?.htmlFor ? document.getElementById(rotuloEl.htmlFor) : rotuloEl?.querySelector('input,textarea,select')
      if (!campo) return false
      campo.setAttribute('data-smk', id)
      return true
    },
    [painel, rotulo, marca],
  )
  if (!ok) falhar('campo por rótulo não encontrado', { painel, rotulo })
  return `${painel} [data-smk="${marca}"]`
}

/** Prompts: criar um prompt próprio (gravado) e isolar o catálogo pelo filtro. */
async function checarPrompts(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Prompts', 'prompts')
  const painel = '[data-felixo-canvas-panel="prompts"]'
  const nome = `Prompt do smoke ${Date.now() % 100000}`
  const gravados = (n) => page.evaluate(async (alvo) => ((await window.felixo.automations.list()).automations ?? []).filter((a) => a.name === alvo), n)
  const esperarGravado = async (n, predicado, mensagem) => {
    let lista = []
    for (let k = 0; k < 40; k += 1) {
      lista = await gravados(n)
      if (predicado(lista)) return lista
      await page.waitForTimeout(150)
    }
    return falhar(mensagem, lista)
  }
  await exigirClique(page, painel, /^Novo prompt$/, 'Novo prompt')
  await preencher(page, `${painel} input[placeholder="Nome do prompt"]`, nome)
  await preencher(page, `${painel} textarea[placeholder="Texto do prompt…"]`, 'texto do prompt do smoke')
  await exigirClique(page, painel, /^Criar prompt$/, 'Criar prompt')
  await esperarGravado(nome, (l) => l.length === 1, 'o prompt criado não foi gravado')
  // O filtro isola o prompt criado e esconde o catálogo.
  await preencher(page, `${painel} input[placeholder^="Filtrar"]`, nome)
  await esperar(page, (sel) => !/Revisar codigo/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o filtro não escondeu o catálogo')
  await preencher(page, `${painel} input[placeholder^="Filtrar"]`, '')
  await esperar(page, (sel) => /Revisar codigo/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'limpar o filtro não trouxe o catálogo de volta')

  // Limpeza do que a rodada criou (a remoção pela interface é da linha do prompt, que só existe com o grupo aberto).
  await page.evaluate(async (n) => {
    for (const a of ((await window.felixo.automations.list()).automations ?? []).filter((x) => x.name === n)) await window.felixo.automations.delete(a.id)
  }, nome)
}

/**
 * Detalhe do preset de prompt: "Ver" abre o texto completo, a edição vira rascunho (Cancelar/Salvar só aparecem sujos), Salvar grava
 * uma versão personalizada no main, "Restaurar padrão" a descarta e "Voltar à lista" devolve a lista. A edição criada é removida no fim.
 */
async function checarDetalheDoPrompt(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Prompts', 'prompts')
  const painelLista = '[data-felixo-canvas-panel="prompts"]'
  const painel = '[data-felixo-canvas-panel="prompt-detail"]'
  const preset = 'Revisar codigo'
  const gravados = () => page.evaluate(async (alvo) => ((await window.felixo.automations.list()).automations ?? []).filter((a) => a.name === alvo), preset)
  const limpar = () =>
    page.evaluate(async (alvo) => {
      for (const a of ((await window.felixo.automations.list()).automations ?? []).filter((x) => x.name === alvo)) await window.felixo.automations.delete(a.id)
    }, preset)
  const textoDoDetalhe = () => page.evaluate((sel) => document.querySelector(`${sel} textarea`)?.value ?? null, painel)
  const temBotao = (rotulo) => page.evaluate(([sel, r]) => [...document.querySelectorAll(`${sel} button`)].some((b) => new RegExp(r).test((b.textContent ?? '').trim())), [painel, rotulo])
  await limpar()
  try {
    await preencher(page, `${painelLista} input[placeholder^="Filtrar"]`, preset)
    await exigirClique(page, painelLista, /^Ver$/, 'Ver (detalhe do preset)')
    const abriu = await page.waitForFunction((sel) => (document.querySelector(`${sel} textarea`)?.value ?? '').length > 0, painel, { timeout: TIMEOUT_MS, polling: POLLING_MS }).then(() => true, () => false)
    if (!abriu) falhar('o detalhe não mostrou o texto do preset', (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 400))
    const original = await textoDoDetalhe()
    if ((await temBotao('^(Salvar|Cancelar)$'))) falhar('Salvar/Cancelar apareceram sem edição')
    // Cancelar descarta o rascunho e nada é gravado.
    await preencher(page, `${painel} textarea`, 'rascunho descartado')
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Cancelar$/.test((b.textContent ?? '').trim())), painel, 'a edição não mostrou Cancelar')
    await exigirClique(page, painel, /^Cancelar$/, 'Cancelar (rascunho)')
    await esperar(page, ([sel, t]) => document.querySelector(`${sel} textarea`)?.value === t, [painel, original], 'Cancelar não devolveu o texto original')
    if ((await gravados()).length !== 0) falhar('Cancelar gravou o rascunho')
    // Salvar grava a versão personalizada.
    await preencher(page, `${painel} textarea`, 'texto salvo pelo detalhe')
    await exigirClique(page, painel, /^Salvar$/, 'Salvar (detalhe do preset)')
    let lista = await gravados()
    for (let k = 0; k < 40 && lista[0]?.prompt !== 'texto salvo pelo detalhe'; k += 1) {
      await page.waitForTimeout(150)
      lista = await gravados()
    }
    if (lista[0]?.prompt !== 'texto salvo pelo detalhe') falhar('Salvar não gravou o texto editado no main', lista)
    // Restaurar padrão descarta a versão personalizada e volta ao texto do preset.
    await exigirClique(page, painel, /Restaurar padrão/, 'Restaurar padrão')
    for (let k = 0; k < 40 && (await gravados()).length !== 0; k += 1) await page.waitForTimeout(150)
    if ((await gravados()).length !== 0) falhar('Restaurar padrão não removeu a versão personalizada do main')
    await exigirClique(page, painel, /Voltar à lista/, 'Voltar à lista')
    await esperar(page, (sel) => document.querySelector(sel) !== null, painelLista, 'Voltar à lista não trouxe a lista de volta')
  } finally {
    await limpar()
  }
}

/** Skills: criar uma skill própria (gravada), ocultar e restaurar uma da biblioteca, e remover a própria. */
async function checarSkills(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Skills', 'skills')
  const painel = '[data-felixo-canvas-panel="skills"]'
  const nome = `Skill do smoke ${Date.now() % 100000}`
  const proprias = () =>
    page.evaluate(async (n) => {
      const r = await window.felixo.canvas.getSkills()
      return (Array.isArray(r) ? r : (r?.skills ?? [])).filter((k) => k.name === n)
    }, nome)

  // Sobras de rodadas que falharam no meio: tira as skills próprias do smoke antes de começar.
  await page.evaluate(async () => {
    const r = await window.felixo.canvas.getSkills()
    const lista = Array.isArray(r) ? r : (r?.skills ?? [])
    if (lista.some((k) => /^Skill do smoke/.test(k.name))) await window.felixo.canvas.setSkills(lista.filter((k) => !/^Skill do smoke/.test(k.name)))
  })
  await page.reload()
  await page.waitForSelector('.felixo-zoom-pill', { timeout: TIMEOUT_MS * 3 })
  await abrirFerramenta(page, 'Skills', 'skills')
  await exigirClique(page, painel, /^Nova skill$/, 'Nova skill')
  await preencher(page, `${painel} input[placeholder="Nome"]`, nome)
  await preencher(page, `${painel} input[placeholder="Caminho do arquivo da skill"]`, path.join(os.tmpdir(), 'SKILL-smoke.md'))
  await exigirClique(page, painel, /^Salvar$/, 'Salvar skill')
  await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'a skill criada não entrou na lista')
  for (let k = 0; k < 30 && (await proprias()).length === 0; k += 1) await page.waitForTimeout(150)
  if ((await proprias()).length !== 1) falhar('a skill criada não foi gravada')

  // Ocultar uma skill da biblioteca e restaurá-la.
  const ocultas = () => page.evaluate((sel) => Number(/Ocultas \((\d+)\)/.exec(document.querySelector(sel)?.innerText ?? '')?.[1] ?? 0), painel)
  const antes = await ocultas()
  await exigirClique(page, painel, /^Não enviar a skill/, 'ocultar skill da biblioteca')
  await esperar(page, ([sel, n]) => Number(/Ocultas \((\d+)\)/.exec(document.querySelector(sel)?.innerText ?? '')?.[1] ?? 0) === n + 1, [painel, antes], 'ocultar não aumentou o contador de ocultas')
  await exigirClique(page, painel, /^Ocultas \(/, 'abrir as ocultas')
  await exigirClique(page, painel, /^(Restaurar|Voltar a enviar)/, 'restaurar a skill oculta')
  await esperar(page, ([sel, n]) => Number(/Ocultas \((\d+)\)/.exec(document.querySelector(sel)?.innerText ?? '')?.[1] ?? 0) === n, [painel, antes], 'restaurar não devolveu a skill')

  // Remover a skill própria.
  const removida = await page.evaluate(([sel, n]) => {
    const linha = [...document.querySelectorAll(`${sel} li`)].find((el) => (el.textContent ?? '').includes(n))
    const botao = linha && [...linha.querySelectorAll('button')].find((b) => /^Remover/.test((b.getAttribute('aria-label') || b.title || b.textContent || '').trim()))
    if (!botao) return false
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }, [painel, nome])
  if (!removida) falhar('o botão Remover da skill própria não foi encontrado na linha dela')
  for (let k = 0; k < 30 && (await proprias()).length !== 0; k += 1) await page.waitForTimeout(150)
  if ((await proprias()).length !== 0) falhar('Remover não apagou a skill gravada')
}

/** Presets de agente: criar, duplicar e excluir um preset próprio (gravados). */
async function checarPresetsDeAgente(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Presets de agente', 'agent-presets')
  const painel = '[data-felixo-canvas-panel="agent-presets"]'
  const nome = `Preset do smoke ${Date.now() % 100000}`
  const gravados = () => page.evaluate(async (n) => ((await window.felixo.agentPresets.list()).presets ?? []).filter((p) => p.name.startsWith(n)), nome)

  await exigirClique(page, painel, /^Novo preset$/, 'Novo preset')
  const campoNome = await marcarCampoPorRotulo(page, painel, 'Nome')
  await preencher(page, campoNome, nome)
  await exigirClique(page, painel, /^Salvar$/, 'Salvar preset')
  for (let k = 0; k < 30 && (await gravados()).length === 0; k += 1) await page.waitForTimeout(150)
  if ((await gravados()).length !== 1) falhar('o preset criado não foi gravado', await gravados())

  await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'o preset criado não entrou na lista')
  await page.evaluate(([sel, n]) => {
    const linha = [...document.querySelectorAll(`${sel} li, ${sel} [role="listitem"]`)].find((el) => (el.textContent ?? '').includes(n))
    ;[...linha.querySelectorAll('button')].find((b) => /^Duplicar/.test((b.textContent ?? '').trim()))?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  }, [painel, nome])
  for (let k = 0; k < 30 && (await gravados()).length < 2; k += 1) await page.waitForTimeout(150)
  if ((await gravados()).length !== 2) falhar('Duplicar não criou o segundo preset', (await gravados()).map((p) => p.name))

  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    for (let rodada = 0; rodada < 2; rodada += 1) {
      await page.evaluate(([sel, n]) => {
        const linha = [...document.querySelectorAll(`${sel} li, ${sel} [role="listitem"]`)].find((el) => (el.textContent ?? '').includes(n))
        ;[...linha.querySelectorAll('button')].find((b) => /Excluir|Remover/.test(b.getAttribute('aria-label') || b.title || b.textContent || ''))?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      }, [painel, nome])
      await page.waitForTimeout(600)
    }
    for (let k = 0; k < 30 && (await gravados()).length !== 0; k += 1) await page.waitForTimeout(150)
    if ((await gravados()).length !== 0) falhar('Excluir não apagou os presets gravados', (await gravados()).map((p) => p.name))
  } finally {
    page.off('dialog', aceitar)
  }
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

/** Projetos: adicionar a pasta pelo seletor e remover em dois toques (o primeiro só pede confirmação). */
async function checarProjetos(page) {
  const dir = criarRepositorioDeFixture()
  const nome = path.basename(dir)
  await prepararJanela(page)
  await exigirClique(page, 'nav.felixo-activity-rail', /^Projetos$/, 'Projetos (trilho)')
  const painel = '[data-felixo-canvas-panel="projects"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const botoes = () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button`)].map((b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim()), painel)
  const listados = async () => (await page.evaluate((sel) => document.querySelector(sel)?.innerText ?? '', painel)).includes(nome)

  if (!(await listados())) {
    await exigirClique(page, painel, /^Adicionar pasta$/, 'Adicionar pasta')
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'a pasta adicionada não entrou na lista')
  }

  // Remover em dois toques: o primeiro não remove (pede confirmação), o segundo remove.
  await exigirClique(page, painel, new RegExp(`^Remover ${nome}`), 'Remover (primeiro toque)')
  if (!(await listados())) falhar('o primeiro toque em Remover já removeu o projeto', await botoes())
  const pediu = await botoes()
  if (!pediu.includes('Cancelar') || !pediu.includes('Remover')) falhar('o primeiro toque não pediu confirmação (Remover/Cancelar)', pediu)
  // Cancelar mantém o projeto; o toque seguinte pede de novo; a confirmação remove.
  await exigirClique(page, painel, /^Cancelar$/, 'Cancelar a remoção')
  if (!(await listados())) falhar('Cancelar removeu o projeto')
  await exigirClique(page, painel, new RegExp(`^Remover ${nome}`), 'Remover (segundo pedido)')
  await exigirClique(page, painel, /^Remover$/, 'Remover (confirmar)')
  await esperar(page, ([sel, n]) => !(document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'confirmar a remoção não tirou o projeto da lista')
}

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

/**
 * Configurações: a instrução enviada ao ligar um arquivo a um agente é editada, salva ("Salvo") e fica gravada no main; o
 * valor original é devolvido ao fim (o perfil é do smoke, mas a rodada seguinte parte do padrão).
 */
async function checarConfiguracoes(page) {
  await prepararJanela(page)
  await exigirClique(page, 'nav.felixo-activity-rail', /^Configurações$/, 'Configurações (trilho)')
  const painel = '[data-felixo-canvas-panel="settings"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  // As duas instruções de arquivo (a de ligar e a de diagnóstico) ficam gravadas no main; qual delas o primeiro campo edita não
  // importa para o efeito: o texto salvo precisa estar gravado numa delas, e os dois valores originais voltam ao fim.
  const lerGravados = () =>
    page.evaluate(async () => ({
      ligar: (await window.felixo.canvas.getFileLinkPrompt())?.prompt ?? null,
      diagnostico: (await window.felixo.canvas.getFileBootstrapPrompt())?.prompt ?? null,
      qualidade: (await window.felixo.canvas.getQualityStandard())?.prompt ?? null,
    }))
  await esperar(page, (sel) => document.querySelectorAll(`${sel} textarea`).length > 0, painel, 'a seção de instruções não carregou os campos')
  const antes = await lerGravados()
  await page.waitForTimeout(800) // os campos preenchem depois da leitura do main
  const original = await page.evaluate((sel) => document.querySelector(`${sel} textarea`).value, painel)
  const novo = `${original}
linha do smoke`
  try {
    await preencher(page, `${painel} textarea`, novo)
    await page.evaluate((sel) => [...document.querySelectorAll(`${sel} button`)].find((b) => /^Salvar$/.test((b.textContent ?? '').trim()))?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })), painel)
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Salvo$/.test((b.textContent ?? '').trim())), painel, 'o botão não mostrou "Salvo" depois de salvar')
    let depois = await lerGravados()
    for (let k = 0; k < 30 && ![depois.ligar, depois.diagnostico, depois.qualidade].includes(novo); k += 1) {
      await page.waitForTimeout(100)
      depois = await lerGravados()
    }
    if (![depois.ligar, depois.diagnostico, depois.qualidade].includes(novo)) falhar('o texto salvo não ficou gravado no main', { esperado: novo.slice(-30), gravado: Object.fromEntries(Object.entries(depois).map(([k, v]) => [k, v === null ? null : v.slice(-30)])) })
  } finally {
    await page.evaluate(async (v) => {
      await window.felixo.canvas.setFileLinkPrompt(v.ligar ?? '')
      await window.felixo.canvas.setFileBootstrapPrompt(v.diagnostico ?? '')
      await window.felixo.canvas.setQualityStandard({ prompt: v.qualidade ?? '' })
    }, antes)
  }
}

/** Os checks na ordem da sessão J: cada um recomeça da fixture (`prepararJanela`), então a ordem só importa para o Git (depois de Projetos). */
const CHECKS_DOS_PAINEIS = [
  checarMolduraDosPaineis,
  checarBuscaDeBlocos,
  checarProjetos,
  checarSourceControl,
  checarPedidosDeEscrita,
  checarNotas,
  checarPrompts,
  checarDetalheDoPrompt,
  checarSkills,
  checarPresetsDeAgente,
  checarQaLogger,
  checarConfiguracoes,
  checarModelos,
  checarOrquestrador,
]

async function executarChecksDosPaineis(page) {
  for (const check of CHECKS_DOS_PAINEIS) {
    await check(page)
    console.log(`[canvas-smoke:paineis] ${check.name}: ok`)
  }
}

module.exports = {
  CHECKS_DOS_PAINEIS,
  ambienteDosPaineis,
  executarChecksDosPaineis,
  checarBuscaDeBlocos,
  checarConfiguracoes,
  checarDetalheDoPrompt,
  checarModelos,
  checarMolduraDosPaineis,
  checarNotas,
  checarOrquestrador,
  checarPedidosDeEscrita,
  checarPresetsDeAgente,
  checarProjetos,
  checarPrompts,
  checarSkills,
  checarQaLogger,
  checarSourceControl,
  criarRepositorioDeFixture,
}
