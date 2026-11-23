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

let exportacao = null

/** O arquivo onde o "Salvar como" da automação grava o canvas exportado (a pasta é criada uma vez). */
function arquivoDeExportacao() {
  if (!exportacao) exportacao = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-export-')), 'canvas-do-smoke.fxcanvas')
  return exportacao
}

function ambienteDosPaineis() {
  return { FELIXO_DEVTOOLS_PROJECT_FOLDER: criarRepositorioDeFixture(), FELIXO_DEVTOOLS_SAVE_FILE: arquivoDeExportacao() }
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
  const visivel = await page.evaluate((sel) => (document.querySelector(sel)?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 900), raiz).catch(() => '')
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
  // A fila ordena por `pedidoEm` (precisão de milissegundo): dois pedidos no mesmo instante ficam sem ordem definida.
  await new Promise((resolve) => setTimeout(resolve, 20))
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

/** Moldura comum: lista → detalhe do Prompts troca o panelId sem remontar; cada vista tem de usar a própria largura gravada. */
async function checarLarguraPorVistaDoPainel(page) {
  await prepararJanela(page)
  const chaves = ['felixo:canvas-panel-width:prompts', 'felixo:canvas-panel-width:prompt-detail']
  await page.evaluate(([lista, detalhe]) => {
    window.localStorage.setItem(lista, '420')
    window.localStorage.setItem(detalhe, '540')
  }, chaves)
  try {
    await abrirFerramenta(page, 'Prompts', 'prompts')
    const largura = (painel) => page.evaluate((sel) => document.querySelector(sel)?.getBoundingClientRect().width ?? 0, `[data-felixo-canvas-panel="${painel}"]`)
    const lista = Math.round(await largura('prompts'))
    if (Math.abs(lista - 420) > 2) falhar('a lista de Prompts não usou a largura gravada', lista)
    await esperar(page, () => [...document.querySelectorAll('[data-felixo-canvas-panel="prompts"] button')].some((b) => /^Ver$/.test((b.textContent ?? '').trim())), null, 'não há prompt com o botão Ver')
    await exigirClique(page, '[data-felixo-canvas-panel="prompts"]', /^Ver$/, 'Ver o detalhe do prompt')
    await page.locator('[data-felixo-canvas-panel="prompt-detail"]').waitFor({ state: 'visible', timeout: TIMEOUT_MS })
    await page.waitForTimeout(500)
    const detalhe = Math.round(await largura('prompt-detail'))
    if (Math.abs(detalhe - 540) > 2) falhar('o detalhe do prompt herdou a largura da lista em vez da própria', { lista, detalhe })
  } finally {
    await page.evaluate((ks) => ks.forEach((k) => window.localStorage.removeItem(k)), chaves).catch(() => {})
  }
}

/**
 * Fetch All: varre uma raiz de fixture com dois clones atrasados em relação ao remoto, ignora um deles, executa o plano com a
 * confirmação (só o clone considerado avança, conferido com git) e volta a considerar a pasta ignorada. As raízes e as pastas
 * ignoradas originais voltam ao fim.
 */
async function checarFetchAll(page) {
  await prepararJanela(page)
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-fetchall-'))
  const raiz = path.join(base, 'raiz')
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const configurar = (dir) => {
    git(dir, 'config', 'user.email', 'smoke@felixo.test')
    git(dir, 'config', 'user.name', 'Smoke')
    git(dir, 'config', 'core.autocrlf', 'false')
  }
  // O remoto e o clone que o empurra ficam fora da raiz varrida; dentro dela só os dois clones que ficam para trás.
  const remoto = path.join(base, 'remoto.git')
  const semente = path.join(base, 'semente')
  fs.mkdirSync(remoto)
  git(remoto, 'init', '-q', '--bare', '-b', 'main')
  git(base, '-c', 'core.autocrlf=false', 'clone', '-q', remoto, semente)
  configurar(semente)
  git(semente, 'checkout', '-q', '-B', 'main')
  fs.writeFileSync(path.join(semente, 'a.txt'), 'um\n')
  git(semente, 'add', '.')
  git(semente, 'commit', '-qm', 'inicial')
  git(semente, 'push', '-q', '-u', 'origin', 'main')
  fs.mkdirSync(raiz)
  const considerado = path.join(raiz, 'repo-considerado')
  const ignorado = path.join(raiz, 'repo-ignorado')
  for (const destino of [considerado, ignorado]) {
    git(raiz, '-c', 'core.autocrlf=false', 'clone', '-q', remoto, destino)
    configurar(destino)
  }
  fs.writeFileSync(path.join(semente, 'a.txt'), 'um\ndois\n')
  git(semente, 'commit', '-qam', 'segundo')
  git(semente, 'push', '-q')
  const contagem = (dir) => Number(git(dir, 'rev-list', '--count', 'HEAD'))

  const lerConfiguracao = () => page.evaluate(async () => { const r = await window.felixo.fetchAll.getSettings(); return r?.settings ?? r })
  const original = await lerConfiguracao()
  const painel = '[data-felixo-canvas-panel="fetch-all"]'
  const textoDoFetchAll = () => textoDoPainel(page, painel)
  try {
    await page.evaluate((c) => window.felixo.fetchAll.saveSettings(c), { ...original, scanRoots: [raiz], ignoredPaths: [] })
    await abrirFerramenta(page, 'Fetch All', 'fetch-all')
    await exigirClique(page, painel, /^Varredura completa$/, 'Varredura completa')
    await esperar(page, (sel) => /repo-considerado/.test(document.querySelector(sel)?.innerText ?? '') && /repo-ignorado/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'a varredura não listou os dois clones da raiz')
    if (contagem(considerado) !== 1) falhar('a varredura não deveria alterar os repositórios (só o plano é montado)')

    // Ignorar pela linha do repositório: ele sai do plano e passa a constar em "Pastas ignoradas".
    const clicouNaLinha = await page.evaluate((sel) => {
      const linha = [...document.querySelectorAll(`${sel} li`)].find((li) => /repo-ignorado/.test(li.textContent ?? '') && li.querySelector('button[title^="Ignorar"]'))
      linha?.querySelector('button[title^="Ignorar"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return Boolean(linha)
    }, painel)
    if (!clicouNaLinha) falhar('a linha do repositório a ignorar não tem o botão de ignorar', await textoDoFetchAll())
    await esperar(page, (sel) => !/repo-ignorado/.test([...document.querySelectorAll(`${sel} li`)].map((li) => li.textContent).join(' ')) && /Pastas ignoradas \(1\)/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'ignorar não tirou o repositório do plano')

    // Executar o plano pede confirmação; só então o clone considerado avança (pull --ff-only).
    const depoisDeIgnorar = (await textoDoFetchAll()).replace(/\s+/g, ' ')
    if (!/Executar plano/.test(depoisDeIgnorar)) falhar('sem o botão Executar plano depois de ignorar', depoisDeIgnorar.slice(300, 1400))
    await exigirClique(page, painel, /^Executar plano$/, 'Executar plano')
    await exigirClique(page, painel, /^Confirmar execução$/, 'Confirmar execução')
    for (let k = 0; k < 60 && contagem(considerado) !== 2; k += 1) await page.waitForTimeout(150)
    if (contagem(considerado) !== 2) falhar('Executar plano não atualizou o repositório considerado', await textoDoFetchAll())
    if (contagem(ignorado) !== 1) falhar('Executar plano mexeu no repositório ignorado')

    // Voltar a varrer a pasta ignorada.
    await exigirClique(page, painel, /^Pastas ignoradas/, 'Pastas ignoradas (abrir)')
    await exigirClique(page, painel, /^Voltar a varrer esta pasta$/, 'Voltar a varrer esta pasta')
    await esperar(page, (sel) => /Pastas ignoradas \(0\)/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'Voltar a varrer não tirou a pasta da lista de ignoradas')
    const gravada = await lerConfiguracao()
    if ((gravada?.ignoredPaths ?? []).length !== 0) falhar('a pasta continua ignorada no main', gravada)
  } finally {
    await page.evaluate((c) => window.felixo.fetchAll.saveSettings(c), original).catch(() => {})
    fs.rmSync(base, { recursive: true, force: true })
  }
}

/** Lê um JSON que o app acabou de gravar: o arquivo pode existir antes de a escrita terminar, então repete por um instante. */
async function lerJsonQuandoPronto(page, arquivo) {
  let ultimo
  for (let k = 0; k < 30; k += 1) {
    try {
      return JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    } catch (erro) {
      ultimo = erro
      await page.waitForTimeout(100)
    }
  }
  return falhar('o arquivo gravado não é um JSON válido', String(ultimo))
}

/**
 * Exportar e importar o canvas: "Exportar canvas" grava o .fxcanvas (o "Salvar como" nativo da instância de automação aponta o
 * arquivo combinado) com os blocos à vista; com um bloco a mais criado depois, "Importar canvas" (o campo de arquivo, com a
 * confirmação aceita) devolve o canvas ao que foi exportado.
 */
async function checarExportarEImportarCanvas(page) {
  await prepararJanela(page)
  const arquivo = arquivoDeExportacao()
  fs.rmSync(arquivo, { force: true })
  const antes = await totalDeBlocos(page)
  await abrirSecaoFerramentas(page)
  await exigirClique(page, '[aria-label="Ferramentas auxiliares"]', /^Exportar canvas$/, 'Exportar canvas')
  for (let k = 0; k < 80 && !fs.existsSync(arquivo); k += 1) await page.waitForTimeout(100)
  if (!fs.existsSync(arquivo)) falhar('Exportar canvas não gravou o arquivo .fxcanvas', arquivo)
  const pacote = await lerJsonQuandoPronto(page, arquivo)
  if (!Array.isArray(pacote.nodes) || pacote.nodes.length !== antes) falhar('o arquivo exportado não tem os blocos do canvas', { blocos: antes, exportados: pacote.nodes?.length })

  // Um bloco a mais, e a importação (com a confirmação aceita) devolve o canvas ao exportado.
  await abrirFerramenta(page, 'Notas', 'notes')
  await exigirClique(page, '[data-felixo-canvas-panel="notes"]', /^Nova nota$/, 'Nova nota (bloco)')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, antes, 'Nova nota não criou o bloco')
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    await page.locator('input[type="file"][accept*="fxcanvas"]').setInputFiles(arquivo)
    await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n, antes, 'Importar canvas não devolveu o canvas ao exportado')
  } finally {
    page.off('dialog', aceitar)
  }

  // Recusar a confirmação da importação deixa o canvas como estava (um bloco a mais criado de novo continua lá).
  await abrirFerramenta(page, 'Notas', 'notes')
  await exigirClique(page, '[data-felixo-canvas-panel="notes"]', /^Nova nota$/, 'Nova nota (bloco)')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, antes, 'a segunda Nova nota não criou o bloco')
  const recusar = (dialogo) => void dialogo.dismiss().catch(() => {})
  page.on('dialog', recusar)
  try {
    await page.locator('input[type="file"][accept*="fxcanvas"]').setInputFiles(arquivo)
    await page.waitForTimeout(1500)
    const depois = await totalDeBlocos(page)
    if (depois !== antes + 1) falhar('recusar a confirmação da importação mudou o canvas', { esperado: antes + 1, atual: depois })
  } finally {
    page.off('dialog', recusar)
  }

  // Exportar com a saída dos terminais: grava um pacote válido no mesmo caminho.
  fs.rmSync(arquivo, { force: true })
  await abrirSecaoFerramentas(page)
  await exigirClique(page, '[aria-label="Ferramentas auxiliares"]', /^Exportar com a saída dos terminais$/, 'Exportar com a saída dos terminais')
  for (let k = 0; k < 80 && !fs.existsSync(arquivo); k += 1) await page.waitForTimeout(100)
  if (!fs.existsSync(arquivo)) falhar('Exportar com a saída dos terminais não gravou o arquivo', arquivo)
  const completo = await lerJsonQuandoPronto(page, arquivo)
  if (!Array.isArray(completo.nodes) || completo.nodes.length !== antes + 1) falhar('o pacote com a saída dos terminais não tem os blocos do canvas', { esperado: antes + 1, exportados: completo.nodes?.length })
}

/**
 * Limites e uso (aba Uso): Atualizar e Reconectar terminam a rodada sem erro, "Adicionar outra conta" cadastra uma conta local
 * (conferida no main) e Remover (com a confirmação aceita) a apaga. A conta de fixture é removida no fim mesmo se um passo falhar.
 */
async function checarLimitesEUso(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Limites e uso', 'agent-usage')
  const painel = '[data-felixo-canvas-panel="agent-usage"]'
  const rotulo = `Conta do smoke ${Date.now() % 100000}`
  const contasDoMain = () => page.evaluate(async () => { const r = await window.felixo.agentUsage.list(); return JSON.stringify(r?.dashboard ?? r) })
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    const carregou = await page.waitForFunction((sel) => !/Consultando as CLIs/.test(document.querySelector(sel)?.innerText ?? '') && document.querySelector(`${sel} [role="tabpanel"] button`) !== null, painel, { timeout: TIMEOUT_MS, polling: POLLING_MS }).then(() => true, () => false)
    if (!carregou) falhar('a aba Uso não terminou de carregar', (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 500))
    // Atualizar e Reconectar: o botão volta a ficar habilitado (a rodada terminou) e o painel segue com conteúdo.
    // A rodada consulta as CLIs de verdade (lenta em máquina com CLIs instaladas): o prazo é largo e o que se confere é que ela termina.
    const atualizarHabilitado = () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Atualizar$/.test((b.textContent ?? '').trim()) && !b.disabled), painel)
    // A rodada inicial (aberta junto com o painel) também precisa terminar antes do primeiro clique.
    await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Atualizar$/.test((b.textContent ?? '').trim()) && !b.disabled), painel, { timeout: 90_000, polling: POLLING_MS }).catch(() => {})
    for (const [padrao, nome] of [[/^Atualizar$/, 'Atualizar'], [/^Reconectar$/, 'Reconectar']]) {
      await exigirClique(page, painel, padrao, nome)
      const terminou = await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Atualizar$/.test((b.textContent ?? '').trim()) && !b.disabled), painel, { timeout: 90_000, polling: POLLING_MS }).then(() => true, () => false)
      if (!terminou || !(await atualizarHabilitado())) falhar(`${nome}: a rodada de consulta não terminou`, (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 400))
    }
    if (/Nenhuma CLI foi detectada/.test(await textoDoPainel(page, painel))) {
      // Runner sem CLI instalada: não há provider para receber a conta; Atualizar e Reconectar já foram conferidos.
      console.log('[canvas-smoke:paineis] checarLimitesEUso: nenhuma CLI detectada neste ambiente, Adicionar/Remover conta não verificados')
      return
    }
    if (!/Adicionar outra conta/.test(await textoDoPainel(page, painel))) falhar('o painel não oferece "Adicionar outra conta" (nenhum provider listado)', (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 500))
    await exigirClique(page, painel, /Adicionar outra conta/, 'Adicionar outra conta')
    await preencher(page, `${painel} input[placeholder^="Nome local"]`, rotulo)
    await exigirClique(page, painel, /^Adicionar ao painel$/, 'Adicionar ao painel')
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, rotulo], 'a conta adicionada não apareceu no painel')
    if (!(await contasDoMain()).includes(rotulo)) falhar('a conta adicionada não está no main')
    await exigirClique(page, painel, new RegExp(`^Remover a conta "${rotulo}" do painel$`), 'Remover a conta')
    await esperar(page, ([sel, n]) => !(document.querySelector(sel)?.innerText ?? '').includes(n), [painel, rotulo], 'Remover não tirou a conta do painel')
    if ((await contasDoMain()).includes(rotulo)) falhar('Remover não apagou a conta no main')
  } finally {
    page.off('dialog', aceitar)
    await page.evaluate(async (n) => {
      const r = await window.felixo.agentUsage.list()
      const grupos = r?.dashboard?.providers ?? r?.providers ?? []
      for (const g of grupos) for (const c of g.accounts ?? []) if (c.label === n) await window.felixo.agentUsage.removeAccount(c.id)
    }, rotulo).catch(() => {})
  }
}

/**
 * Limites e uso, filtro das contas: com seis contas a barra de busca aparece; digitar o nome de uma deixa só ela ("1 de N contas"),
 * "Limpar filtro" traz as outras de volta, o atalho "Precisa de atenção" liga e desliga (aria-pressed) e "Atualizar a conta" gira
 * (aria-busy) e termina. As contas de fixture são locais (provider codex, sem sessão) e saem no fim, mesmo se um passo falhar.
 */
async function checarFiltroDasContas(page) {
  await prepararJanela(page)
  const marca = `Filtro${Date.now() % 100000}`
  const rotulos = Array.from({ length: 6 }, (_, i) => `${marca}x${i + 1}`)
  const remover = () => page.evaluate(async (m) => {
    const r = await window.felixo.agentUsage.list()
    const grupos = r?.dashboard?.providers ?? r?.providers ?? []
    for (const g of grupos) for (const c of g.accounts ?? []) if ((c.label ?? '').startsWith(m)) await window.felixo.agentUsage.removeAccount(c.id)
  }, marca).catch(() => {})
  try {
    const criadas = await page.evaluate(async (nomes) => {
      let ok = 0
      for (const label of nomes) {
        const r = await window.felixo.agentUsage.addAccount({ providerId: 'codex', label })
        if (r?.account || r?.ok !== false) ok += 1
      }
      return ok
    }, rotulos)
    if (criadas !== rotulos.length) falhar('não foi possível cadastrar as contas de fixture do filtro', { criadas })
    await abrirFerramenta(page, 'Limites e uso', 'agent-usage')
    const painel = '[data-felixo-canvas-panel="agent-usage"]'
    const barra = `${painel} [data-felixo-agent-usage-filter]`
    const barraApareceu = await page.waitForFunction((sel) => document.querySelector(sel) !== null, barra, { timeout: 90_000, polling: POLLING_MS }).then(() => true, () => false)
    if (!barraApareceu) {
      console.log('[canvas-smoke:paineis] checarFiltroDasContas: o painel não listou as contas de fixture neste ambiente, filtro não verificado')
      return
    }
    // Busca digitada: só a conta procurada sobra e o contador diz isso.
    await preencher(page, `${barra} input[type="search"]`, rotulos[2])
    await esperar(page, ([sel, n]) => /^1 de \d+ contas?$/.test((document.querySelector(`${sel} [role="status"]`)?.textContent ?? '').trim()) && (document.querySelector(sel)?.parentElement?.innerText ?? '').includes(n), [barra, rotulos[2]], 'digitar o nome da conta não deixou só ela na lista')
    // Atualizar a conta: o botão da conta filtrada gira e a leitura termina (o botão volta a ficar livre).
    const botao = `${painel} [data-felixo-agent-usage-refresh-account]`
    await exigirClique(page, painel, new RegExp(`^Atualizar a conta "${rotulos[2]}"$`), 'Atualizar a conta')
    const terminou = await page.waitForFunction((sel) => { const b = document.querySelector(sel); return b !== null && b.getAttribute('aria-busy') !== 'true' && !b.disabled }, botao, { timeout: 90_000, polling: POLLING_MS }).then(() => true, () => false)
    if (!terminou) falhar('Atualizar a conta não terminou', (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 400))
    // Limpar filtro: as outras contas voltam e o contador some.
    await exigirClique(page, barra, /^Limpar filtro$/, 'Limpar filtro')
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.parentElement?.innerText ?? '').includes(n) && document.querySelector(`${sel} [role="status"]`) === null, [barra, rotulos[5]], 'Limpar filtro não trouxe as outras contas de volta')
    // Atalho "Precisa de atenção": liga e desliga.
    const atalho = (sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} button`)].find((b) => /^Precisa de atenção/.test((b.textContent ?? '').trim()))?.getAttribute('aria-pressed'), sel)
    await exigirClique(page, barra, /^Precisa de atenção/, 'Precisa de atenção (ligar)')
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Precisa de atenção/.test((b.textContent ?? '').trim()) && b.getAttribute('aria-pressed') === 'true'), barra, 'o atalho "Precisa de atenção" não ficou ligado')
    await exigirClique(page, barra, /^Precisa de atenção/, 'Precisa de atenção (desligar)')
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Precisa de atenção/.test((b.textContent ?? '').trim()) && b.getAttribute('aria-pressed') === 'false'), barra, 'o atalho "Precisa de atenção" não desligou')
    if ((await atalho(barra)) !== 'false') falhar('o atalho ficou ligado depois de desligar')
  } finally {
    await remover()
  }
}

/** Clica o elemento achado pelo seletor CSS completo (switch, combobox e demais controles sem nome de botão). */
async function clicarSeletor(page, seletor, o_que) {
  const limite = Date.now() + TIMEOUT_MS
  while (Date.now() < limite) {
    const ok = await page.evaluate((sel) => {
      const alvo = document.querySelector(sel)
      if (!alvo || alvo.disabled || alvo.getAttribute('aria-disabled') === 'true') return false
      alvo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    }, seletor)
    if (ok) {
      await page.waitForTimeout(250)
      return
    }
    await page.waitForTimeout(POLLING_MS)
  }
  falhar(`controle não encontrado (ou desabilitado): ${o_que}`, seletor)
}

/** Escolhe a opção (menu em portal) de um seletor FelixoSelect pelo nome do combobox. */
async function escolherNoSeletor(page, nomeDoSeletor, opcao) {
  await clicarSeletor(page, `[role="combobox"][aria-label="${nomeDoSeletor}"]`, nomeDoSeletor)
  await exigirClique(page, 'body', opcao, `${nomeDoSeletor}: ${opcao.source}`)
}

/**
 * Cadeia de contas (aba Cadeia): liga a cadeia, troca a estratégia, reordena duas contas pelos botões ↑/↓, declara a cobrança e o
 * multiplicador e confere cada efeito no main. Duas contas locais são criadas para o teste; o estado original da cadeia e as
 * contas voltam ao fim.
 */
async function checarCadeiaDeContas(page) {
  await prepararJanela(page)
  const estado = () => page.evaluate(async () => { const r = await window.felixo.accountChain.getState(); return r?.state ?? r })
  const original = await estado()
  const sufixo = Date.now() % 100000
  const rotulos = [`Cadeia A ${sufixo}`, `Cadeia B ${sufixo}`]
  const criadas = []
  try {
    for (const label of rotulos) {
      const r = await page.evaluate((p) => window.felixo.cliAccounts.create(p), { providerId: 'codex', label })
      if (!r?.ok) falhar('não foi possível criar a conta de fixture', r)
      criadas.push(r.account.id)
    }
    await abrirFerramenta(page, 'Limites e uso', 'agent-usage')
    const painel = '[data-felixo-canvas-panel="agent-usage"]'
    await exigirClique(page, painel, /^Cadeia$/, 'aba Cadeia')
    await esperar(page, () => document.querySelector('[role="switch"][aria-label="Cadeia de contas"]') !== null, null, 'a aba Cadeia não carregou o interruptor')
    if ((await estado()).settings.enabled) await clicarSeletor(page, '[role="switch"][aria-label="Cadeia de contas"]', 'desligar a cadeia (partida)')
    await clicarSeletor(page, '[role="switch"][aria-label="Cadeia de contas"]', 'ligar a cadeia')
    for (let k = 0; k < 40 && !(await estado()).settings.enabled; k += 1) await page.waitForTimeout(100)
    if (!(await estado()).settings.enabled) falhar('o interruptor não ligou a cadeia no main')

    // Estratégia: o menu troca o valor gravado.
    const antesDaEstrategia = (await estado()).settings.strategy
    const textoDaOpcao = await page.evaluate(async () => document.querySelector('[role="combobox"][aria-label="Estratégia da cadeia"]')?.textContent ?? '')
    await clicarSeletor(page, '[role="combobox"][aria-label="Estratégia da cadeia"]', 'Estratégia da cadeia')
    const opcoes = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? '').trim()))
    const outra = opcoes.find((t) => t.startsWith('Rodízio'))
    if (!outra) falhar('o menu de estratégia não ofereceu outra opção', { opcoes, textoDaOpcao })
    await page.evaluate((t) => [...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent ?? '').trim() === t)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })), outra)
    for (let k = 0; k < 40 && (await estado()).settings.strategy === antesDaEstrategia; k += 1) await page.waitForTimeout(100)
    if ((await estado()).settings.strategy === antesDaEstrategia) falhar('a estratégia escolhida não foi gravada', { antesDaEstrategia, opcoes })

    // Reordenar pelos botões: Mover para baixo/cima troca a posição das duas contas criadas.
    const ordemDe = async () => (await estado()).members.map((m) => m.label ?? m.accountId ?? m.id)
    const antes = await ordemDe()
    const alvo = rotulos[0]
    await exigirClique(page, painel, new RegExp(`^Mover ${alvo} para baixo$`), `Mover ${alvo} para baixo`)
    for (let k = 0; k < 40 && JSON.stringify(await ordemDe()) === JSON.stringify(antes); k += 1) await page.waitForTimeout(100)
    const depois = await ordemDe()
    if (JSON.stringify(depois) === JSON.stringify(antes)) falhar('Mover para baixo não mudou a ordem gravada', { antes })
    await exigirClique(page, painel, new RegExp(`^Mover ${alvo} para cima$`), `Mover ${alvo} para cima`)
    for (let k = 0; k < 40 && JSON.stringify(await ordemDe()) === JSON.stringify(depois); k += 1) await page.waitForTimeout(100)
    if (JSON.stringify(await ordemDe()) !== JSON.stringify(antes)) falhar('Mover para cima não devolveu a ordem', { antes, agora: await ordemDe() })

    // Cobrança declarada: o menu da conta grava a escolha.
    await clicarSeletor(page, `[role="combobox"][aria-label="Cobrança declarada de ${alvo}"]`, 'Cobrança declarada')
    await exigirClique(page, 'body', /^Assinatura/, 'Cobrança: Assinatura')
    for (let k = 0; k < 40 && !(await estado()).members.some((m) => m.billingDeclared === 'assinatura'); k += 1) await page.waitForTimeout(100)
    if (!(await estado()).members.some((m) => m.billingDeclared === 'assinatura')) falhar('a cobrança declarada não foi gravada', (await estado()).members.map((m) => m.billingDeclared))

    // Conferir agora: dispara a conferência do login da conta e o botão volta a ficar habilitado.
    await exigirClique(page, painel, new RegExp(`^Conferir agora o login de ${alvo}$`), 'Conferir agora o login')
    await esperar(page, ([sel, n]) => [...document.querySelectorAll(`${sel} button`)].some((b) => b.getAttribute('aria-label') === `Conferir agora o login de ${n}` && !b.disabled), [painel, alvo], 'Conferir agora não terminou')

    // Multiplicador declarado: valor válido grava, Enter confirma.
    const campo = `${painel} li input[inputmode="decimal"]`
    await preencher(page, campo, '3')
    await page.evaluate((sel) => document.querySelector(sel)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), campo)
    for (let k = 0; k < 40 && !(await estado()).members.some((m) => m.multiplierDeclared === 3); k += 1) await page.waitForTimeout(100)
    if (!(await estado()).members.some((m) => m.multiplierDeclared === 3)) falhar('o multiplicador declarado não foi gravado', (await estado()).members.map((m) => m.multiplierDeclared))

    // Aba Trocas: Atualizar recarrega o registro sem erro (sem terminal vivo a lista pode estar vazia).
    await exigirClique(page, painel, /^Trocas$/, 'aba Trocas')
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Atualizar$/.test((b.textContent ?? '').trim())), painel, 'a aba Trocas não carregou')
    await exigirClique(page, painel, /^Atualizar$/, 'Atualizar (trocas)')
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Atualizar$/.test((b.textContent ?? '').trim()) && !b.disabled) && !/Não foi possível/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'Atualizar (trocas) não terminou sem erro')
  } finally {
    if (original?.settings) await page.evaluate((c) => window.felixo.accountChain.updateSettings(c), { enabled: original.settings.enabled, strategy: original.settings.strategy }).catch(() => {})
    await page.evaluate(async (ids) => { for (const id of ids) await window.felixo.cliAccounts.remove(id, { confirmed: true }) }, criadas).catch(() => {})
  }
}

/**
 * Configurações: a rolagem do Claude Code (interruptor que grava a preferência local) e o ditado por voz (motor local/nuvem,
 * endereço, modelo e idioma gravados no main). O que depende de microfone e de chave de transcrição segue de fora. As duas
 * preferências voltam ao original no fim.
 */
async function checarRolagemEDitado(page) {
  await prepararJanela(page)
  await exigirClique(page, 'nav.felixo-activity-rail', /^Configurações$/, 'Configurações (trilho)')
  const painel = '[data-felixo-canvas-panel="settings"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const chave = 'felixo-ai-core.claude-terminal-scroll.v2'
  const lerRolagem = () => page.evaluate((k) => window.localStorage.getItem(k), chave)
  const lerDitado = () => page.evaluate(async () => (await window.felixo.speech.getConfig())?.config ?? null)
  const originalRolagem = await lerRolagem()
  const originalDitado = await lerDitado()
  try {
    // Rolagem do Claude: o interruptor grava a preferência e mostra o aviso; desligar volta.
    const interruptor = '[role="switch"][aria-label="Rolagem no terminal do Claude Code"]'
    await esperar(page, (sel) => document.querySelector(sel) !== null, interruptor, 'o interruptor da rolagem do Claude não apareceu')
    const estavaLigado = (await lerRolagem()) === 'on'
    await clicarSeletor(page, interruptor, 'ligar/desligar a rolagem do Claude')
    for (let k = 0; k < 30 && ((await lerRolagem()) === 'on') === estavaLigado; k += 1) await page.waitForTimeout(100)
    if (((await lerRolagem()) === 'on') === estavaLigado) falhar('o interruptor da rolagem não gravou a preferência', await lerRolagem())
    await clicarSeletor(page, interruptor, 'devolver a rolagem do Claude')
    for (let k = 0; k < 30 && ((await lerRolagem()) === 'on') !== estavaLigado; k += 1) await page.waitForTimeout(100)
    if (((await lerRolagem()) === 'on') !== estavaLigado) falhar('o segundo clique não devolveu a preferência da rolagem')

    // Ditado: modelo e idioma digitados e salvos ficam no main.
    if (!originalDitado) {
      console.log('[canvas-smoke:paineis] checarRolagemEDitado: configuração do ditado indisponível neste ambiente, campos do ditado não verificados')
      return
    }
    await esperar(page, (sel) => document.querySelector(`${sel} #dictation-model`) !== null, painel, 'a seção do ditado não carregou')
    await preencher(page, `${painel} #dictation-model`, 'modelo-do-smoke')
    await preencher(page, `${painel} #dictation-lang`, 'xx')
    await exigirClique(page, painel, /^Salvar endereço, modelo e idioma$/, 'Salvar endereço, modelo e idioma')
    await esperar(page, (sel) => /Configuração salva/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o ditado não confirmou "Configuração salva"')
    const gravado = await lerDitado()
    if (gravado?.model !== 'modelo-do-smoke' || gravado?.language !== 'xx') falhar('o modelo e o idioma do ditado não ficaram gravados no main', gravado)
  } finally {
    await page.evaluate(([k, v]) => { try { v === null ? window.localStorage.removeItem(k) : window.localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }, [chave, originalRolagem]).catch(() => {})
    if (originalDitado) await page.evaluate((c) => window.felixo.speech.saveConfig({ baseUrl: c.baseUrl, model: c.model, language: c.language }), originalDitado).catch(() => {})
  }
}

/**
 * Carregamento dos painéis (hospedeiro e chunks): com o módulo do painel Modelos atrasado, o painel mostra "Carregando Modelos…" e
 * depois abre; com o módulo recusado, mostra "Não foi possível carregar este painel." e "Recarregar app" recarrega a janela, que
 * volta com o painel carregando normalmente. As rotas são desfeitas ao fim.
 */
async function checarCarregamentoDosPaineis(page) {
  await prepararJanela(page)
  const modulo = /ModelsPanel/
  const abrirModelosPeloMenu = async () => {
    await garantirSidebarAberta(page)
    await abrirSecaoFerramentas(page)
    await exigirClique(page, '[aria-label="Ferramentas auxiliares"]', /^Modelos$/, 'Modelos')
  }
  try {
    // 1. Módulo lento: o painel de carregamento aparece e é trocado pelo painel de verdade.
    await page.route(modulo, async (rota) => {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      await rota.continue().catch(() => {})
    })
    await abrirModelosPeloMenu()
    await esperar(page, () => /Carregando Modelos/.test(document.querySelector('[data-felixo-canvas-panel="loading-models"]')?.innerText ?? ''), null, 'o painel não mostrou "Carregando Modelos…" enquanto o módulo demorava')
    await page.locator('[data-felixo-canvas-panel="models"]').waitFor({ state: 'visible', timeout: TIMEOUT_MS })
    await page.unroute(modulo)

    // 2. Módulo recusado (numa janela recarregada, sem o módulo em memória): mensagem de erro e botão para recarregar.
    await prepararJanela(page)
    await page.route(modulo, (rota) => rota.abort())
    await abrirModelosPeloMenu()
    await esperar(page, () => /Não foi possível carregar este painel/.test(document.querySelector('[data-felixo-canvas-panel="error-models"]')?.innerText ?? ''), null, 'o painel não mostrou o erro de carregamento com o módulo recusado')
    await page.unroute(modulo)
    // Recarregar app: a janela recarrega (o painel de erro some) e o painel carrega normalmente.
    await Promise.all([page.waitForEvent('load', { timeout: TIMEOUT_MS }), exigirClique(page, '[data-felixo-canvas-panel="error-models"]', /^Recarregar app$/, 'Recarregar app')])
    await page.waitForSelector('.felixo-zoom-pill', { timeout: TIMEOUT_MS })
    await garantirSidebarAberta(page)
    await abrirFerramenta(page, 'Modelos', 'models')
  } finally {
    await page.unroute(modulo).catch(() => {})
  }
}

/** Registra um pedido de agente de uma ação qualquer no perfil isolado (o que a CLI `felixo` faz) e devolve o repositório e o pedido. */
function registrarPedidoDeAgente(acao, detalhes) {
  const { readState } = require('../electron/cli/felixo-devtools.cjs')
  const { criarRepositorioDePedidos } = require('../electron/services/fetch-all/agent-requests.cjs')
  const estado = readState()
  if (!estado?.userData || estado.realProfile) falhar('gravar pedidos só é permitido num perfil isolado do felixo devtools')
  const pedidos = criarRepositorioDePedidos({ pasta: path.join(estado.userData, 'agent-requests') })
  return { pedidos, pedido: pedidos.registrar(acao, { origem: 'canvas-smoke', ...detalhes }) }
}

/**
 * Fetch All, o que a primeira rodada não alcança: pedidos de agente (Recusar e "Aplicar o plano revisado" depois de varrer),
 * o push de um repositório à frente, o commit automático de um repositório só com alteração e remover uma raiz. Tudo num
 * remoto local; as raízes e as pastas ignoradas originais voltam ao fim.
 */
async function checarFetchAllPedidosPushECommit(page) {
  await prepararJanela(page)
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-fetchall2-'))
  const raiz = path.join(base, 'raiz')
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const configurar = (dir) => {
    git(dir, 'config', 'user.email', 'smoke@felixo.test')
    git(dir, 'config', 'user.name', 'Smoke')
    git(dir, 'config', 'core.autocrlf', 'false')
  }
  const remoto = path.join(base, 'remoto.git')
  const semente = path.join(base, 'semente')
  fs.mkdirSync(remoto)
  git(remoto, 'init', '-q', '--bare', '-b', 'main')
  git(base, '-c', 'core.autocrlf=false', 'clone', '-q', remoto, semente)
  configurar(semente)
  git(semente, 'checkout', '-q', '-B', 'main')
  fs.writeFileSync(path.join(semente, 'a.txt'), 'um\n')
  git(semente, 'add', '.')
  git(semente, 'commit', '-qm', 'inicial')
  git(semente, 'push', '-q', '-u', 'origin', 'main')
  fs.mkdirSync(raiz)
  const adiante = path.join(raiz, 'repo-adiante')
  const sujo = path.join(raiz, 'repo-sujo')
  for (const destino of [adiante, sujo]) {
    git(raiz, '-c', 'core.autocrlf=false', 'clone', '-q', remoto, destino)
    configurar(destino)
  }
  // Um à frente do remoto (push) e outro só com uma alteração rastreada (commit automático).
  fs.writeFileSync(path.join(adiante, 'a.txt'), 'um\nlocal\n')
  git(adiante, 'commit', '-qam', 'local')
  fs.writeFileSync(path.join(sujo, 'a.txt'), 'um\nalterado\n')
  const noRemoto = () => Number(git(remoto, 'rev-list', '--count', 'main'))

  const lerConfiguracao = () => page.evaluate(async () => { const r = await window.felixo.fetchAll.getSettings(); return r?.settings ?? r })
  const original = await lerConfiguracao()
  const painel = '[data-felixo-canvas-panel="fetch-all"]'
  try {
    await page.evaluate((c) => window.felixo.fetchAll.saveSettings(c), { ...original, scanRoots: [raiz], ignoredPaths: [] })
    // O primeiro pedido é recusado pela pessoa; o segundo é aplicado depois de varrer.
    const primeiro = registrarPedidoDeAgente('executar-plano', {})
    await abrirFerramenta(page, 'Fetch All', 'fetch-all')
    await esperar(page, (sel) => /Um agente pediu para aplicar o plano/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o pedido do agente não apareceu no painel')
    await exigirClique(page, painel, /^Recusar$/, 'Recusar o pedido do agente')
    await esperarPedido(primeiro.pedidos, primeiro.pedido.id, 'recusado')
    if (noRemoto() !== 1) falhar('recusar o pedido não deveria enviar nada ao remoto')

    const segundo = registrarPedidoDeAgente('executar-plano', {})
    await esperar(page, (sel) => /Um agente pediu para aplicar o plano/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o segundo pedido do agente não apareceu')
    await exigirClique(page, painel, /^Varrer para revisar$/, 'Varrer para revisar')
    await exigirClique(page, painel, /^Aplicar o plano revisado$/, 'Aplicar o plano revisado')
    await esperarPedido(segundo.pedidos, segundo.pedido.id, 'aceito')
    for (let k = 0; k < 60 && noRemoto() !== 2; k += 1) await page.waitForTimeout(150)
    if (noRemoto() !== 2) falhar('aplicar o plano não enviou o commit do repositório à frente (push)', await textoDoPainel(page, painel))
    if (git(sujo, 'rev-list', '--count', 'HEAD') !== '1') falhar('aplicar o plano sem o commit automático não deveria commitar o repositório alterado')

    // Commit automático: só entra quem tem a alteração e não está atrás do remoto (o `repo-sujo` ficou atrás depois do push);
    // um clone novo, já no remoto atual e alterado, é o candidato.
    const sujo2 = path.join(raiz, 'repo-sujo-novo')
    git(raiz, '-c', 'core.autocrlf=false', 'clone', '-q', remoto, sujo2)
    configurar(sujo2)
    fs.writeFileSync(path.join(sujo2, 'a.txt'), 'um\nlocal\nnovo\n')
    await exigirClique(page, painel, /^Varredura completa$/, 'Varredura completa (2ª)')
    await esperar(page, (sel) => /Commitar automaticamente/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'a caixa do commit automático não apareceu para o repositório alterado')
    await page.evaluate((sel) => document.querySelector(`${sel} input[type="checkbox"]`)?.click(), painel)
    await exigirClique(page, painel, /^Executar plano$/, 'Executar plano (commit automático)')
    await exigirClique(page, painel, /^Confirmar execução$/, 'Confirmar execução (commit automático)')
    for (let k = 0; k < 80 && noRemoto() !== 3; k += 1) await page.waitForTimeout(150)
    if (noRemoto() !== 3) falhar('o commit automático não chegou ao remoto', await textoDoPainel(page, painel))
    if (git(sujo2, 'status', '--porcelain') !== '') falhar('o repositório alterado ficou com pendência depois do commit automático')

    // Adicionar pasta: o seletor da automação "escolhe" a pasta combinada e ela entra nas raízes; remover tira as duas.
    const pastaEscolhida = criarRepositorioDeFixture()
    await exigirClique(page, painel, /^Adicionar pasta$/, 'Adicionar pasta (raiz)')
    for (let k = 0; k < 40 && !((await lerConfiguracao())?.scanRoots ?? []).some((r) => path.resolve(r) === path.resolve(pastaEscolhida)); k += 1) await page.waitForTimeout(100)
    if (!((await lerConfiguracao())?.scanRoots ?? []).some((r) => path.resolve(r) === path.resolve(pastaEscolhida))) falhar('Adicionar pasta não gravou a pasta escolhida nas raízes', await lerConfiguracao())
    for (let rodada = 0; rodada < 2; rodada += 1) {
      await exigirClique(page, painel, /^Deixar de varrer /, 'Deixar de varrer a raiz')
      await page.waitForTimeout(400)
    }
    for (let k = 0; k < 40 && ((await lerConfiguracao())?.scanRoots ?? []).length !== 0; k += 1) await page.waitForTimeout(100)
    if (((await lerConfiguracao())?.scanRoots ?? []).length !== 0) falhar('remover as raízes não gravou a lista vazia', await lerConfiguracao())
  } finally {
    await page.evaluate((c) => window.felixo.fetchAll.saveSettings(c), original).catch(() => {})
    fs.rmSync(base, { recursive: true, force: true })
  }
}

/**
 * Orquestrador, o que o check anterior não alcança: o Modo (menu), a confirmação de ações sensíveis, um modelo marcado como
 * bloqueado (que desmarca o preferido, pois os dois se excluem) e os textos de contexto fixo e memórias. Salvar grava tudo no
 * main; a configuração original volta ao fim.
 */
async function checarOrquestradorModoBloqueioETextos(page) {
  await prepararJanela(page)
  const id = `smoke-orq2-${Date.now() % 100000}`
  const nome = `Modelo orquestrador ${id}`
  const lerGravado = () => page.evaluate(async () => { const r = await window.felixo.settings.loadOrchestrator(); return r?.settings ?? r })
  const original = await lerGravado()
  const salvo = await page.evaluate((m) => window.felixo.models.save(m), { id, name: nome, command: 'smoke-cli', source: 'smoke', cliType: 'claude' })
  if (!salvo?.ok) falhar('não foi possível gravar o modelo de fixture', salvo)
  try {
    await abrirFerramenta(page, 'Orquestrador', 'orchestrator')
    const painel = '[data-felixo-canvas-panel="orchestrator"]'
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'o formulário do orquestrador não carregou o modelo')
    await page.waitForTimeout(500) // o rascunho preenche depois da leitura do main

    // Modo: o menu troca para "Somente leitura".
    await escolherNoSeletor(page, 'Modo do orquestrador', /^Somente leitura/)

    // Confirmação de ações sensíveis: o primeiro caixa do painel (antes da lista de modelos) inverte o valor.
    // Sem nada gravado ainda, o padrão do app é pedir confirmação.
    const confirmacaoAntes = original?.requireConfirmationForSensitiveActions ?? true
    await page.evaluate((sel) => document.querySelector(`${sel} input[type="checkbox"]`)?.click(), painel)

    // Modelo: "Preferido" e depois "Bloqueado" no mesmo cartão (o segundo desmarca o primeiro).
    const marcar = (rotulo) => page.evaluate(([sel, n, r]) => {
      const cartao = [...document.querySelectorAll(`${sel} div`)].filter((el) => (el.textContent ?? '').includes(n) && el.querySelector('input[type="checkbox"]')).pop()
      const campo = [...(cartao?.querySelectorAll('label') ?? [])].find((l) => new RegExp(r).test(l.textContent ?? ''))?.querySelector('input')
      campo?.click()
      return Boolean(campo)
    }, [painel, nome, rotulo])
    if (!(await marcar('Preferido'))) falhar('o cartão do modelo não tem a caixa Preferido')
    if (!(await marcar('Bloqueado'))) falhar('o cartão do modelo não tem a caixa Bloqueado')

    await preencher(page, `${painel} textarea[placeholder^="Instruções enviadas"]`, 'contexto fixo do smoke')
    await preencher(page, `${painel} textarea[placeholder^="O que o orquestrador deve lembrar"]`, 'memória do smoke')
    await exigirClique(page, painel, /^Salvar$/, 'Salvar o orquestrador')
    await esperar(page, (sel) => /Salvo/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'o painel não mostrou "Salvo"')
    let gravado = await lerGravado()
    for (let k = 0; k < 30 && gravado?.customContext !== 'contexto fixo do smoke'; k += 1) {
      await page.waitForTimeout(100)
      gravado = await lerGravado()
    }
    if (gravado?.mode !== 'read_only') falhar('o modo escolhido não foi gravado', gravado?.mode)
    if (gravado?.requireConfirmationForSensitiveActions === confirmacaoAntes) falhar('a confirmação de ações sensíveis não foi invertida no main', gravado)
    if (!(gravado?.blockedModelIds ?? []).includes(id)) falhar('o modelo bloqueado não foi gravado', gravado)
    if ((gravado?.preferredModelIds ?? []).includes(id)) falhar('bloquear o modelo não o tirou dos preferidos', gravado)
    if (gravado?.customContext !== 'contexto fixo do smoke' || gravado?.globalMemories !== 'memória do smoke') falhar('os textos de contexto e memórias não foram gravados', gravado)
  } finally {
    await page.evaluate((o) => window.felixo.settings.saveOrchestrator(o), original).catch(() => {})
    await page.evaluate((modeloId) => window.felixo.models.delete(modeloId), id).catch(() => {})
  }
}

/**
 * Presets de agente, o que o check de criar/duplicar/excluir não alcança: Editar (o nome novo é gravado), Exportar (o arquivo
 * .fxpreset sai no caminho combinado da automação) e Importar (o arquivo exportado, depois de excluir o original, recria o preset).
 * Os presets do teste são removidos no fim.
 */
async function checarPresetsEditarExportarImportar(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Presets de agente', 'agent-presets')
  const painel = '[data-felixo-canvas-panel="agent-presets"]'
  const base = `Preset editável ${Date.now() % 100000}`
  const editado = `${base} editado`
  const gravados = () => page.evaluate(async (n) => ((await window.felixo.agentPresets.list()).presets ?? []).filter((p) => p.name.startsWith(n)), base)
  const arquivo = arquivoDeExportacao()
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  const acaoDaLinha = (nome, rotulo) => page.evaluate(([sel, n, r]) => {
    const linha = [...document.querySelectorAll(`${sel} li, ${sel} [role="listitem"]`)].find((el) => (el.textContent ?? '').includes(n))
    const botao = [...(linha?.querySelectorAll('button') ?? [])].find((b) => new RegExp(r).test((b.getAttribute('aria-label') || b.title || b.textContent || '').trim()))
    botao?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return Boolean(botao)
  }, [painel, nome, rotulo])
  try {
    await exigirClique(page, painel, /^Novo preset$/, 'Novo preset')
    await preencher(page, await marcarCampoPorRotulo(page, painel, 'Nome'), base)
    await exigirClique(page, painel, /^Salvar$/, 'Salvar preset')
    for (let k = 0; k < 30 && (await gravados()).length === 0; k += 1) await page.waitForTimeout(150)
    if ((await gravados()).length !== 1) falhar('o preset de partida não foi gravado', await gravados())

    // Editar: o nome novo substitui o antigo (a mesma linha gravada, sem criar outra).
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, base], 'o preset não entrou na lista')
    if (!(await acaoDaLinha(base, '^Editar')) ) falhar('a linha do preset não tem o botão Editar')
    await preencher(page, await marcarCampoPorRotulo(page, painel, 'Nome'), editado)
    await exigirClique(page, painel, /^Salvar$/, 'Salvar a edição')
    for (let k = 0; k < 30 && !(await gravados()).some((p) => p.name === editado); k += 1) await page.waitForTimeout(150)
    const aposEdicao = await gravados()
    if (aposEdicao.length !== 1 || aposEdicao[0].name !== editado) falhar('Editar não trocou o nome do preset gravado', aposEdicao.map((p) => p.name))

    // Exportar: o arquivo sai no caminho combinado, com o preset editado dentro.
    fs.rmSync(arquivo, { force: true })
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, editado], 'o preset editado não apareceu na lista')
    if (!(await acaoDaLinha(editado, 'Exportar'))) falhar('a linha do preset não tem o botão Exportar')
    for (let k = 0; k < 80 && !fs.existsSync(arquivo); k += 1) await page.waitForTimeout(100)
    if (!fs.existsSync(arquivo)) falhar('Exportar não gravou o arquivo do preset', arquivo)
    // O arquivo pode existir antes de a escrita terminar: lê de novo por um instante.
    for (let k = 0; k < 30 && !fs.readFileSync(arquivo, 'utf8').includes(editado); k += 1) await page.waitForTimeout(100)
    if (!fs.readFileSync(arquivo, 'utf8').includes(editado)) falhar('o arquivo exportado não traz o preset editado', fs.readFileSync(arquivo, 'utf8').slice(0, 200))

    // Importar: com o original excluído, o arquivo recria o preset.
    if (!(await acaoDaLinha(editado, 'Excluir|Remover'))) falhar('a linha do preset não tem o botão Excluir')
    for (let k = 0; k < 30 && (await gravados()).length !== 0; k += 1) await page.waitForTimeout(150)
    if ((await gravados()).length !== 0) falhar('Excluir não apagou o preset antes da importação')
    await page.locator('input[aria-label="Importar preset de agente"]').setInputFiles(arquivo)
    for (let k = 0; k < 40 && (await gravados()).length === 0; k += 1) await page.waitForTimeout(150)
    if ((await gravados()).length !== 1) falhar('Importar não recriou o preset exportado', await gravados())
  } finally {
    page.off('dialog', aceitar)
    await page.evaluate(async (n) => {
      for (const p of ((await window.felixo.agentPresets.list()).presets ?? []).filter((x) => x.name.startsWith(n))) await window.felixo.agentPresets.delete(p.id)
    }, base).catch(() => {})
  }
}

/**
 * Configurações, o que o check das instruções de arquivo não alcança: o Tema (menu que grava a preferência local) e o padrão de
 * qualidade (interruptor "Sempre lembrar o agente…" e o texto editado, salvo e gravado no main). O tema e o padrão originais voltam
 * ao fim.
 */
async function checarTemaEPadraoDeQualidade(page) {
  await prepararJanela(page)
  await exigirClique(page, 'nav.felixo-activity-rail', /^Configurações$/, 'Configurações (trilho)')
  const painel = '[data-felixo-canvas-panel="settings"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const chaveDoTema = 'felixo-ai-core.theme'
  const lerTema = () => page.evaluate((k) => window.localStorage.getItem(k), chaveDoTema)
  const lerPadrao = () => page.evaluate(async () => (await window.felixo.canvas.getQualityStandard()) ?? null)
  const temaOriginal = await lerTema()
  const padraoOriginal = await lerPadrao()
  try {
    // Tema: "Claro" grava a preferência e o documento passa a usá-la.
    await escolherNoSeletor(page, 'Tema', /^Claro/)
    for (let k = 0; k < 30 && (await lerTema()) !== 'light'; k += 1) await page.waitForTimeout(100)
    if ((await lerTema()) !== 'light') falhar('o tema Claro não ficou gravado', await lerTema())

    // Padrão de qualidade: o interruptor e o texto editados são gravados juntos pelo Salvar.
    const interruptor = '[role="switch"][aria-label="Sempre lembrar o agente do padrão de qualidade"]'
    await esperar(page, (sel) => document.querySelector(sel) !== null, interruptor, 'o interruptor do padrão de qualidade não apareceu')
    await page.waitForTimeout(600) // os campos preenchem depois da leitura do main
    const enabledAntes = Boolean(padraoOriginal?.enabled)
    await clicarSeletor(page, interruptor, 'interruptor do padrão de qualidade')
    let padrao
    const texto = 'padrão de qualidade do smoke'
    const alvo = await page.evaluate(([sel]) => {
      const trilho = document.querySelector(sel)
      let no = trilho
      while (no && !no.querySelector('textarea')) no = no.parentElement
      const caixa = no?.querySelector('textarea')
      if (!caixa) return false
      caixa.setAttribute('data-smoke-qualidade', '1')
      return true
    }, [interruptor])
    if (!alvo) falhar('o campo de texto do padrão de qualidade não foi encontrado')
    await preencher(page, `${painel} textarea[data-smoke-qualidade="1"]`, texto)
    await page.evaluate(([sel]) => {
      let no = document.querySelector(sel)
      while (no && ![...no.querySelectorAll('button')].some((b) => /^Salvar$/.test((b.textContent ?? '').trim()))) no = no.parentElement
      ;[...(no?.querySelectorAll('button') ?? [])].find((b) => /^Salvar$/.test((b.textContent ?? '').trim()))?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }, [interruptor])
    padrao = await lerPadrao()
    for (let k = 0; k < 30 && !String(padrao?.prompt ?? '').includes(texto); k += 1) {
      await page.waitForTimeout(100)
      padrao = await lerPadrao()
    }
    if (!String(padrao?.prompt ?? '').includes(texto)) falhar('o texto do padrão de qualidade não ficou gravado no main', padrao)
    if (Boolean(padrao?.enabled) === enabledAntes) falhar('o interruptor do padrão de qualidade não mudou o valor gravado pelo Salvar', padrao)
  } finally {
    await page.evaluate(([k, v]) => { try { v === null ? window.localStorage.removeItem(k) : window.localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }, [chaveDoTema, temaOriginal]).catch(() => {})
    if (padraoOriginal) await page.evaluate((p) => window.felixo.canvas.setQualityStandard({ prompt: p.prompt ?? '', enabled: Boolean(p.enabled) }), padraoOriginal).catch(() => {})
  }
}

/**
 * Prompt criado à mão, editado pela linha: o texto digitado é gravado sozinho (autosave), a troca de escopo é gravada e o botão
 * Remover da linha apaga o prompt no main. O prompt é criado pelo painel e removido no fim.
 */
async function checarPromptEditadoNaLinha(page) {
  await prepararJanela(page)
  await abrirFerramenta(page, 'Prompts', 'prompts')
  const painel = '[data-felixo-canvas-panel="prompts"]'
  const nome = `Prompt da linha ${Date.now() % 100000}`
  const gravados = () => page.evaluate(async (alvo) => ((await window.felixo.automations.list()).automations ?? []).filter((a) => a.name === alvo), nome)
  const esperarGravado = async (predicado, mensagem) => {
    let lista = []
    for (let k = 0; k < 40; k += 1) {
      lista = await gravados()
      if (predicado(lista)) return lista
      await page.waitForTimeout(150)
    }
    return falhar(mensagem, lista)
  }
  const aceitar = (dialogo) => void dialogo.accept().catch(() => {})
  page.on('dialog', aceitar)
  try {
    await exigirClique(page, painel, /^Novo prompt$/, 'Novo prompt')
    await preencher(page, `${painel} input[placeholder="Nome do prompt"]`, nome)
    await preencher(page, `${painel} textarea[placeholder="Texto do prompt…"]`, 'texto inicial da linha')
    await exigirClique(page, painel, /^Criar prompt$/, 'Criar prompt')
    await esperarGravado((l) => l.length === 1, 'o prompt criado não foi gravado')

    // Edição inline: o texto da linha é gravado sozinho.
    await preencher(page, `${painel} input[placeholder^="Filtrar"]`, nome)
    await esperar(page, (sel) => document.querySelector(`${sel} li textarea[placeholder="Texto do prompt…"]`) !== null, painel, 'a linha do prompt não mostrou o texto editável')
    await preencher(page, `${painel} li textarea[placeholder="Texto do prompt…"]`, 'texto editado na linha')
    await esperarGravado((l) => l[0]?.prompt === 'texto editado na linha', 'a edição inline não foi gravada (autosave)')

    // Troca de escopo: escolhe um escopo diferente do atual.
    const escopoAntes = (await gravados())[0].scope
    const seletor = '[role="combobox"][aria-label="Escopo do prompt"]'
    await clicarSeletor(page, `${painel} li ${seletor}`, 'Escopo do prompt (linha)')
    const opcoes = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? '').trim()))
    const outra = await page.evaluate((atual) => {
      const opcao = [...document.querySelectorAll('[role="option"]')].find((o) => o.getAttribute('aria-selected') !== 'true')
      const texto = (opcao?.textContent ?? '').trim()
      opcao?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return texto
    }, escopoAntes)
    if (!outra) falhar('o menu de escopo não ofereceu outra opção', opcoes)
    await esperarGravado((l) => l[0]?.scope !== escopoAntes, 'a troca de escopo não foi gravada')

    // Remover pela linha.
    await exigirClique(page, painel, /^Remover prompt$/, 'Remover prompt (linha)')
    await esperarGravado((l) => l.length === 0, 'Remover pela linha não apagou o prompt no main')
  } finally {
    page.off('dialog', aceitar)
    await page.evaluate(async (n) => {
      for (const a of ((await window.felixo.automations.list()).automations ?? []).filter((x) => x.name === n)) await window.felixo.automations.delete(a.id)
    }, nome).catch(() => {})
  }
}

/**
 * Escopo amplo do Fetch All: sem raízes configuradas, o painel oferece varrer todos os discos locais só depois de uma confirmação;
 * "Confirmar escopo amplo" registra a confirmação nesta sessão. A varredura em si não roda (varreria os discos da máquina). As raízes
 * originais voltam ao fim.
 */
async function checarEscopoAmploDoFetchAll(page) {
  await prepararJanela(page)
  const lerConfiguracao = () => page.evaluate(async () => { const r = await window.felixo.fetchAll.getSettings(); return r?.settings ?? r })
  const original = await lerConfiguracao()
  const painel = '[data-felixo-canvas-panel="fetch-all"]'
  try {
    await page.evaluate((c) => window.felixo.fetchAll.saveSettings(c), { ...original, scanRoots: [] })
    await abrirFerramenta(page, 'Fetch All', 'fetch-all')
    await esperar(page, (sel) => /Confirmar escopo amplo e habilitar varredura/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'sem raízes, o painel não ofereceu o escopo amplo')
    if (/Escopo amplo confirmado nesta sessão/.test(await textoDoPainel(page, painel))) falhar('o escopo amplo já aparecia confirmado antes do clique')
    await exigirClique(page, painel, /^Confirmar escopo amplo e habilitar varredura$/, 'Confirmar escopo amplo')
    await esperar(page, (sel) => /Escopo amplo confirmado nesta sessão/.test(document.querySelector(sel)?.innerText ?? ''), painel, 'a confirmação do escopo amplo não foi registrada')
  } finally {
    await page.evaluate((c) => window.felixo.fetchAll.saveSettings(c), original).catch(() => {})
  }
}

/**
 * Source Control, diff grande: um arquivo com milhares de linhas alteradas abre no leitor de diff sem travar a janela. O leitor
 * não virtualiza (uma tabela inteira, até 1 MB): o teste mede que a última linha aparece dentro do prazo e que o painel segue
 * respondendo (Fechar o diff). O repositório volta ao estado de partida no fim.
 */
async function checarDiffGrandeDoGit(page) {
  const dir = criarRepositorioDeFixture()
  const nome = path.basename(dir)
  restaurarFixture(dir)
  const linhas = Array.from({ length: 6000 }, (_, i) => `linha numero ${i + 1} do arquivo grande do smoke`)
  fs.writeFileSync(path.join(dir, 'b.txt'), `${linhas.join('\n')}\n`)
  try {
    await prepararJanela(page)
    await garantirProjetoDeFixture(page)
    await abrirFerramenta(page, 'Source Control', 'git')
    const painel = '[data-felixo-canvas-panel="git"]'
    await exigirClique(page, painel, /^Repositório$/, 'seletor de repositório')
    await exigirClique(page, 'body', new RegExp(nome), 'opção do repositório')
    await esperar(page, ([sel, n]) => (document.querySelector(sel)?.innerText ?? '').includes(n) && /Alterações/i.test(document.querySelector(sel)?.innerText ?? ''), [painel, nome], 'o painel não carregou o repositório escolhido')
    await esperar(page, (sel) => /b\.txt/.test(document.querySelector(`${sel} [role="tree"]`)?.innerText ?? ''), painel, 'o arquivo grande não apareceu no explorador')
    const inicio = Date.now()
    await exigirClique(page, `${painel} [role="tree"]`, /^b\.txt/, 'abrir o arquivo grande')
    const abriu = await page.waitForFunction((sel) => (document.querySelector(sel)?.innerText ?? '').includes('linha numero 6000 do arquivo grande do smoke'), painel, { timeout: 60_000, polling: POLLING_MS }).then(() => true, () => false)
    const gasto = Date.now() - inicio
    if (!abriu) falhar('o diff grande não mostrou a última linha em 60 s', (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 300))
    console.log(`[canvas-smoke:paineis] checarDiffGrandeDoGit: 6000 linhas renderizadas em ${gasto} ms`)
    if (gasto > 30_000) falhar('o diff grande demorou demais para renderizar', { gastoMs: gasto })
    // A janela segue respondendo: um clique simples no painel é atendido.
    await exigirClique(page, painel, /^Alterações/, 'aba Alterações depois do diff grande')
  } finally {
    restaurarFixture(dir)
  }
}

/**
 * Ditado, motor e chave: escolher "Servidor local" troca o endereço sugerido e esconde o campo da chave; voltar para "Nuvem" traz o
 * campo de volta. Guardar uma chave de mentira termina com a confirmação (ou com o aviso de que o sistema não tem cofre, como num
 * runner Linux sem chaveiro) e, quando guardou, Remover a apaga (conferido no main). O botão do microfone não é clicado: no macOS ele
 * abre o pedido de permissão do sistema.
 */
async function checarMotorEChaveDoDitado(page) {
  await prepararJanela(page)
  await exigirClique(page, 'nav.felixo-activity-rail', /^Configurações$/, 'Configurações (trilho)')
  const painel = '[data-felixo-canvas-panel="settings"]'
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  const lerDitado = () => page.evaluate(async () => (await window.felixo.speech.getConfig())?.config ?? null)
  const original = await lerDitado()
  if (!original) {
    console.log('[canvas-smoke:paineis] checarMotorEChaveDoDitado: configuração do ditado indisponível neste ambiente, motor e chave não verificados')
    return
  }
  const clicarMotor = (local) => page.evaluate(([sel, quer]) => {
    const radios = [...document.querySelectorAll(`${sel} input[type="radio"][name="dictation-engine"]`)]
    const alvo = radios[quer ? 1 : 0]
    alvo?.click()
    return Boolean(alvo)
  }, [painel, local])
  try {
    await esperar(page, (sel) => document.querySelector(`${sel} #dictation-url`) !== null, painel, 'a seção do ditado não carregou')
    await page.waitForTimeout(500)
    // Motor: servidor local esconde a chave e põe o endereço desta máquina; nuvem devolve o campo.
    if (!(await clicarMotor(true))) falhar('o botão do servidor local não foi encontrado')
    await esperar(page, (sel) => document.querySelector(`${sel} #dictation-key`) === null && /(localhost|127\.0\.0\.1)/.test(document.querySelector(`${sel} #dictation-url`)?.value ?? ''), painel, 'escolher o servidor local não escondeu a chave nem trouxe o endereço desta máquina')
    if (!(await clicarMotor(false))) falhar('o botão da nuvem não foi encontrado')
    await esperar(page, (sel) => document.querySelector(`${sel} #dictation-key`) !== null, painel, 'voltar para a nuvem não trouxe o campo da chave de volta')

    // Chave: guardar uma chave de mentira e removê-la (só se não havia chave de verdade).
    if (original.keyConfigured) {
      console.log('[canvas-smoke:paineis] checarMotorEChaveDoDitado: já há chave configurada neste perfil, guardar/remover não verificado')
      return
    }
    await preencher(page, `${painel} #dictation-key`, 'sk-chave-de-mentira-do-smoke')
    await exigirClique(page, painel, /^Guardar$/, 'Guardar a chave')
    const desfecho = await page.waitForFunction((sel) => {
      const texto = document.querySelector(sel)?.innerText ?? ''
      if (/Chave guardada com criptografia do sistema/.test(texto)) return 'guardada'
      // A falha usa o mesmo parágrafo de status, só que na cor de erro.
      return document.querySelector(`${sel} p[role="status"].text-red-400`) ? 'falhou' : false
    }, painel, { timeout: TIMEOUT_MS, polling: POLLING_MS }).then((h) => h.jsonValue(), () => null)
    if (!desfecho) falhar('guardar a chave não terminou nem com a confirmação nem com um aviso', (await textoDoPainel(page, painel)).replace(/\s+/g, ' ').slice(0, 300))
    if (desfecho === 'guardada') {
      if (!(await lerDitado())?.keyConfigured) falhar('a tela confirmou a chave, mas o main diz que ela não está configurada')
      await exigirClique(page, painel, /^Remover$/, 'Remover a chave')
      for (let k = 0; k < 30 && (await lerDitado())?.keyConfigured; k += 1) await page.waitForTimeout(100)
      if ((await lerDitado())?.keyConfigured) falhar('Remover não apagou a chave no main')
    }
  } finally {
    await page.evaluate(() => window.felixo.speech.clearKey()).catch(() => {})
    await page.evaluate((c) => window.felixo.speech.saveConfig({ baseUrl: c.baseUrl, model: c.model, language: c.language }), original).catch(() => {})
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
    // Escopo: escolhe um escopo diferente do atual, e a versão salva o leva junto.
    const escopoAntes = (await page.evaluate((sel) => document.querySelector(`${sel} [role="combobox"][aria-label="Escopo"]`)?.textContent ?? '', painel)).trim()
    await clicarSeletor(page, `${painel} [role="combobox"][aria-label="Escopo"]`, 'Escopo (detalhe)')
    const escolhido = await page.evaluate(() => {
      const opcao = [...document.querySelectorAll('[role="option"]')].find((o) => o.getAttribute('aria-selected') !== 'true')
      opcao?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return (opcao?.textContent ?? '').trim()
    })
    if (!escolhido) falhar('o menu de escopo do detalhe não ofereceu outra opção')
    await exigirClique(page, painel, /^Salvar$/, 'Salvar (detalhe do preset)')
    let lista = await gravados()
    for (let k = 0; k < 40 && lista[0]?.prompt !== 'texto salvo pelo detalhe'; k += 1) {
      await page.waitForTimeout(150)
      lista = await gravados()
    }
    if (lista[0]?.prompt !== 'texto salvo pelo detalhe') falhar('Salvar não gravou o texto editado no main', lista)
    if (escolhido === escopoAntes || lista[0]?.scope === undefined) falhar('o escopo escolhido não difere do original ou não foi gravado', { escopoAntes, escolhido, gravado: lista[0]?.scope })
    // Inserir: sem terminal aberto o painel responde na própria tela (copiado ou aviso), depois que o "Salvo" some.
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /^Inserir$/.test((b.textContent ?? '').trim()) && !b.disabled), painel, 'o botão Inserir não voltou depois de salvar')
    await exigirClique(page, painel, /^Inserir$/, 'Inserir (detalhe)')
    await esperar(page, (sel) => [...document.querySelectorAll(`${sel} [role="status"], ${sel} [role="alert"]`)].some((p) => (p.textContent ?? '').trim().length > 0), painel, 'Inserir não mostrou o desfecho na tela')
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

  // Ativar a skill própria: o painel mostra o desfecho (enviada, copiada ou falha) na linha dela.
  const clicarNaLinha = (rotulo) =>
    page.evaluate(([sel, n, r]) => {
      const linha = [...document.querySelectorAll(`${sel} li`)].find((el) => (el.textContent ?? '').includes(n))
      const botao = linha && [...linha.querySelectorAll('button')].find((b) => new RegExp(r).test((b.getAttribute('aria-label') || b.title || b.textContent || '').trim()))
      botao?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return Boolean(botao)
    }, [painel, nome, rotulo])
  if (!(await clicarNaLinha('^Ativar'))) falhar('o botão Ativar da skill própria não foi encontrado')
  await esperar(page, (sel) => document.querySelector(`${sel} [data-felixo-delivery-feedback]`) !== null, painel, 'Ativar não mostrou o desfecho da ativação na linha da skill')

  // Editar: a descrição nova é gravada na mesma skill.
  if (!(await clicarNaLinha('^Editar'))) falhar('o botão Editar da skill própria não foi encontrado')
  await preencher(page, `${painel} [placeholder="Descrição (opcional)"]`, 'descrição editada pelo smoke')
  await exigirClique(page, painel, /^Salvar$/, 'Salvar a edição da skill')
  for (let k = 0; k < 30 && (await proprias())[0]?.description !== 'descrição editada pelo smoke'; k += 1) await page.waitForTimeout(150)
  const editadas = await proprias()
  if (editadas.length !== 1 || editadas[0].description !== 'descrição editada pelo smoke') falhar('Editar não gravou a descrição nova na mesma skill', editadas)

  // Skills de terceiros: o caixa inverte a configuração gravada e é devolvido ao fim.
  const terceiros = () => page.evaluate(async () => { const r = await window.felixo.canvas.listAvailableSkills(); return (r?.communityEnabled ?? r?.catalog?.communityEnabled) })
  const terceirosAntes = await terceiros()
  const caixa = (sel) => `${sel} label input[type="checkbox"]`
  try {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), caixa(painel))
    for (let k = 0; k < 30 && (await terceiros()) === terceirosAntes; k += 1) await page.waitForTimeout(150)
    if ((await terceiros()) === terceirosAntes) falhar('o caixa de skills de terceiros não mudou a configuração gravada', { antes: terceirosAntes, agora: await terceiros() })
  } finally {
    await page.evaluate((v) => window.felixo.canvas.setSkillsSettings({ communityEnabled: v }), terceirosAntes !== false).catch(() => {})
  }

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

  // Navegar: abrir o projeto lista a pasta, entrar numa subpasta e voltar; "Abrir ... no canvas" cria um bloco de arquivo.
  const navegador = '[data-felixo-canvas-panel="project-browser"]'
  const textoDosProjetos = async () => (await page.evaluate((sel) => document.querySelector(sel)?.innerText ?? '', navegador)).replace(/\s+/g, ' ')
  const arquivoParaRodar = path.join(dir, 'rodar.js')
  fs.writeFileSync(arquivoParaRodar, 'console.log("smoke")\n')
  await exigirClique(page, painel, /^Abrir a pasta e rodar arquivos dela/, 'abrir o projeto')
  const listou = await page.waitForFunction((sel) => /b\.txt/.test(document.querySelector(sel)?.innerText ?? '') && /src/.test(document.querySelector(sel)?.innerText ?? ''), navegador, { timeout: TIMEOUT_MS, polling: POLLING_MS }).then(() => true, () => false)
  if (!listou) falhar('abrir o projeto não listou o conteúdo da pasta', (await textoDosProjetos()).slice(0, 500))
  // Rodar um arquivo executável: o painel fecha e um terminal novo nasce no canvas (o arquivo de apoio sai no fim).
  try {
    await esperar(page, (sel) => /rodar\.js/.test(document.querySelector(sel)?.innerText ?? ''), navegador, 'o arquivo para rodar não apareceu na pasta')
    const antesDoTerminal = await totalDeBlocos(page)
    await exigirClique(page, navegador, /^Rodar rodar\.js$/, 'Rodar rodar.js')
    await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, antesDoTerminal, 'Rodar não criou o terminal no canvas')
  } finally {
    fs.rmSync(arquivoParaRodar, { force: true })
  }
  await exigirClique(page, 'nav.felixo-activity-rail', /^Projetos$/, 'Projetos (voltar à lista)')
  await exigirClique(page, painel, /^Abrir a pasta e rodar arquivos dela/, 'abrir o projeto (navegar)')
  await esperar(page, (sel) => /src/.test(document.querySelector(sel)?.innerText ?? ''), navegador, 'a pasta não listou a subpasta depois de rodar')
  const blocosAntes2 = await totalDeBlocos(page)
  await exigirClique(page, navegador, /^src/, 'entrar na subpasta src')
  await esperar(page, (sel) => /a\.txt/.test(document.querySelector(sel)?.innerText ?? '') && !/b\.txt/.test(document.querySelector(sel)?.innerText ?? ''), navegador, 'entrar na subpasta não mostrou o conteúdo dela')
  await exigirClique(page, navegador, /^Voltar para a pasta anterior$/, 'voltar para a pasta anterior')
  await esperar(page, (sel) => /b\.txt/.test(document.querySelector(sel)?.innerText ?? ''), navegador, 'Voltar não devolveu a pasta do projeto')
  await exigirClique(page, navegador, /^Abrir b\.txt no canvas$/, 'abrir b.txt no canvas')
  await esperar(page, (n) => Number(/(\d+)\D*bloco/.exec(document.querySelector('.felixo-canvas-statusbar')?.textContent ?? '')?.[1]) === n + 1, blocosAntes2, `abrir o arquivo no canvas não criou o bloco: ${await textoDosProjetos()}`.slice(0, 300))
  // Abrir o arquivo no canvas fecha o navegador de pastas: a lista de projetos volta pelo trilho.
  await esperar(page, (sel) => document.querySelector(sel) === null, navegador, 'o navegador de pastas seguiu aberto depois de abrir o arquivo no canvas')
  await exigirClique(page, 'nav.felixo-activity-rail', /^Projetos$/, 'Projetos (trilho)')
  await page.locator(painel).waitFor({ state: 'visible', timeout: TIMEOUT_MS })
  await esperar(page, ([sel, n]) => /Adicionar pasta/.test(document.querySelector(sel)?.innerText ?? '') && (document.querySelector(sel)?.innerText ?? '').includes(n), [painel, nome], 'a lista de projetos não voltou')

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
  checarLarguraPorVistaDoPainel,
  checarBuscaDeBlocos,
  checarProjetos,
  checarSourceControl,
  checarDiffGrandeDoGit,
  checarPedidosDeEscrita,
  checarNotas,
  checarPrompts,
  checarDetalheDoPrompt,
  checarSkills,
  checarPresetsDeAgente,
  checarQaLogger,
  checarFetchAll,
  checarFetchAllPedidosPushECommit,
  checarExportarEImportarCanvas,
  checarLimitesEUso,
  checarFiltroDasContas,
  checarCadeiaDeContas,
  checarConfiguracoes,
  checarRolagemEDitado,
  checarMotorEChaveDoDitado,
  checarCarregamentoDosPaineis,
  checarModelos,
  checarOrquestrador,
  checarOrquestradorModoBloqueioETextos,
  checarPresetsEditarExportarImportar,
  checarTemaEPadraoDeQualidade,
  checarPromptEditadoNaLinha,
  checarEscopoAmploDoFetchAll,
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
  checarCadeiaDeContas,
  checarCarregamentoDosPaineis,
  checarDetalheDoPrompt,
  checarDiffGrandeDoGit,
  checarEscopoAmploDoFetchAll,
  checarExportarEImportarCanvas,
  checarFetchAll,
  checarFetchAllPedidosPushECommit,
  checarLarguraPorVistaDoPainel,
  checarLimitesEUso,
  checarFiltroDasContas,
  checarModelos,
  checarMolduraDosPaineis,
  checarMotorEChaveDoDitado,
  checarNotas,
  checarOrquestrador,
  checarOrquestradorModoBloqueioETextos,
  checarPedidosDeEscrita,
  checarPresetsDeAgente,
  checarPresetsEditarExportarImportar,
  checarProjetos,
  checarPromptEditadoNaLinha,
  checarPrompts,
  checarSkills,
  checarTemaEPadraoDeQualidade,
  checarQaLogger,
  checarRolagemEDitado,
  checarSourceControl,
  criarRepositorioDeFixture,
}
