'use strict'

/**
 * Sessão C do smoke do canvas: a cadeia de contas de ponta a ponta, com a CLI
 * roteirizada do processo principal (`electron/services/devtools-fake-cli-pty.cjs`).
 *
 * O `canvas-smoke.cjs` sobe esta sessão num perfil isolado novo, com
 * `FELIXO_DEVTOOLS_MOCK_PTY=0` (o renderer usa o store real e fala com o main
 * pelo `pty:spawn`) e `FELIXO_DEVTOOLS_FAKE_CLI_PTY=1` (o main troca o
 * `node-pty` pelo PTY roteirizado e a checagem de login por um executor falso).
 * Nenhuma CLI real roda. A saída do terminal passa pelo `onData` do main, que
 * é onde a cadeia escuta as falhas: o smoke prova o caminho inteiro (onData →
 * vigia → serviço → IPC → tela) e conta os `pty:spawn`/`pty:write` pelo
 * `ipcProbe` do main.
 *
 * O roteiro segue o §13.6 do plano da cadeia, com os textos e canais do código.
 */

const { randomUUID } = require('node:crypto')

const CONTA_A = 'Conta A'
const CONTA_B = 'Conta B'
const GATILHO_LIMITE = '__felixo_smoke_limite__'
const GATILHO_REDE = '__felixo_smoke_rede__'
const VIEWPORT_MINIMO = { width: 375, height: 667 }
/** Viewport fixo da sessão, o mesmo das checagens de layout da sessão A. */
const VIEWPORT_PADRAO = { width: 1280, height: 800 }
/** Tempo para um IPC que NÃO deveria acontecer ter chance de aparecer. */
const JANELA_DE_SILENCIO_MS = 1_500

function falhar(passo, mensagem, detalhe) {
  const extra = detalhe === undefined ? '' : ` ${JSON.stringify(detalhe)}`
  throw new Error(`[canvas-smoke:contas] ${passo}: ${mensagem}${extra}`)
}

function exigir(condicao, passo, mensagem, detalhe) {
  if (!condicao) falhar(passo, mensagem, detalhe)
}

/**
 * @param {{
 *   page: import('playwright').Page,
 *   checarMontagem: (page: import('playwright').Page) => Promise<void>,
 *   timeoutMs: number,
 *   log?: (message: string) => void,
 * }} deps
 */
function criarSessaoDaCadeia(deps) {
  const { page, checarMontagem } = deps
  const timeout = deps.timeoutMs
  const log = deps.log ?? ((message) => console.log(`[canvas-smoke:contas] ${message}`))

  const mainEval = (expression) => page.evaluate((source) => window.felixo.devtools.mainEval(source), expression)
  const contadores = async () => {
    const snapshot = await mainEval('ipcProbe.snapshot()')
    return { spawn: snapshot['pty:spawn'] ?? 0, write: snapshot['pty:write'] ?? 0 }
  }
  /**
   * Espera o contador de `pty:spawn` chegar a `alvo` e confere, depois de uma
   * janela de silêncio, que ele não passou disso (o spawn sai depois de o
   * bloco montar, então o bloco na tela ainda não prova o IPC).
   */
  async function exigirSpawns(passo, descricao, alvo) {
    const limite = Date.now() + timeout
    let atual = await contadores()
    while (atual.spawn < alvo && Date.now() < limite) {
      await pausa(100)
      atual = await contadores()
    }
    await pausa(JANELA_DE_SILENCIO_MS)
    atual = await contadores()
    exigir(atual.spawn === alvo, passo, `${descricao}: esperado pty:spawn = ${alvo}`, atual)
    return atual
  }
  const estadoDaCadeia = () => page.evaluate(() => window.felixo.accountChain.getState())
  // A prévia de "Automática (cadeia)" abre uma proposta `launch`; a troca de
  // um bloco que bateu o limite é `continuation`, a única que vira faixa/item.
  const propostasDeTroca = async () =>
    (await estadoDaCadeia()).pendingProposals.filter((proposal) => proposal.kind === 'continuation')
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function esperar(passo, descricao, predicate, arg) {
    try {
      await page.waitForFunction(predicate, arg, { timeout })
    } catch (error) {
      falhar(passo, `${descricao} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`)
    }
  }

  // --- canvas e painéis ----------------------------------------------------

  const nodeDaConta = (texto) =>
    page.locator('.react-flow__node').filter({ has: page.locator('.felixo-node-account', { hasText: texto }) })

  const nodePorId = (id) => page.locator(`.react-flow__node[data-id="${id}"]`)
  const idsDosBlocos = (texto) => nodeDaConta(texto).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')))
  const selosNaTela = () => page.$$eval('.react-flow__node .felixo-node-account', (els) => els.map((el) => el.textContent?.trim()))

  /** Espera o bloco com o selo `texto`; na falha, lista os selos que existem. */
  async function esperarBloco(passo, texto) {
    // Abrir um bloco dá zoom nele; os outros podem sair da tela (e do DOM).
    await page.getByRole('button', { name: 'Enquadrar todos os blocos' }).click()
    const node = nodeDaConta(texto).first()
    try {
      await node.waitFor({ state: 'attached', timeout })
    } catch {
      falhar(passo, `nenhum bloco com o selo "${texto}"`, { selos: await selosNaTela() })
    }
    return node
  }

  async function abrirLimitesEUso(passo) {
    const ferramentas = page.getByRole('group', { name: 'Ferramentas auxiliares' })
    // "Ferramentas" alterna o menu: só clica se ele estiver fechado.
    if (!(await ferramentas.isVisible())) await page.getByRole('button', { name: 'Ferramentas' }).click()
    await ferramentas.getByRole('button', { name: 'Limites e uso' }).click()
    await esperar(passo, 'o painel Limites e uso abrir', () =>
      document.querySelector('[role="tablist"][aria-label="Seções de limites e uso"]') !== null)
  }

  async function fecharPainel() {
    await page.keyboard.press('Escape')
    await page.waitForFunction(
      () => document.querySelector('[role="tablist"][aria-label="Seções de limites e uso"]') === null,
      null,
      { timeout },
    ).catch(() => {})
  }

  /** Vai para a aba só com o teclado (setas no tablist). */
  async function irParaAba(passo, nome) {
    const tabs = page.locator('[role="tablist"][aria-label="Seções de limites e uso"] [role="tab"]')
    await tabs.locator('[aria-selected="true"]').or(page.locator('[role="tab"][aria-selected="true"]')).first().focus()
    for (let tentativa = 0; tentativa < 4; tentativa += 1) {
      const atual = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
      if (atual === nome) break
      await page.keyboard.press('ArrowRight')
    }
    await esperar(passo, `a aba ${nome} ficar selecionada pelo teclado`, (alvo) => {
      const ativa = document.querySelector('[role="tab"][aria-selected="true"]')
      return ativa?.textContent?.trim() === alvo && document.activeElement === ativa
    }, nome)
  }

  async function escolherNoSelect(nomeDoSelect, opcao) {
    const grupo = page.locator('[role="group"][aria-label="Configurar novo agente"]')
    await grupo.getByRole('combobox', { name: nomeDoSelect, exact: true }).click()
    await page.getByRole('option', { name: opcao }).first().click()
  }

  async function abrirConfiguracaoDoAgente() {
    const gatilho = page.getByRole('button', { name: 'Configurar novo agente' })
    if ((await gatilho.getAttribute('aria-expanded')) !== 'true') await gatilho.click()
    await page.locator('[role="group"][aria-label="Configurar novo agente"]').waitFor({ state: 'visible', timeout })
  }

  /** Espera o app parar de escrever no terminal (o contexto inicial do agente sai sem Enter). */
  async function esperarEscritaParada() {
    const limite = Date.now() + timeout
    let anterior = (await contadores()).write
    while (Date.now() < limite) {
      await pausa(800)
      const atual = (await contadores()).write
      if (atual === anterior) return
      anterior = atual
    }
  }

  /**
   * Digita uma linha no terminal expandido do bloco e fecha o terminal. O PTY
   * roteirizado só dispara com a linha exata: o Ctrl+C antes limpa o contexto
   * inicial que o app deixou no prompt sem Enter.
   */
  async function digitarNoBloco(passo, node, linha) {
    await esperarEscritaParada()
    // Pelo teclado: com vários blocos, a doca de terminais cobre parte do canvas.
    await node.getByRole('button', { name: 'Expandir terminal' }).focus()
    await page.keyboard.press('Enter')
    const xterm = page.locator('.xterm-helper-textarea').last()
    await xterm.waitFor({ state: 'attached', timeout })
    await xterm.focus()
    await page.keyboard.press('Control+C')
    await page.keyboard.type(linha)
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Fechar terminal' }).click()
    await esperar(passo, 'o terminal expandido fechar', () =>
      document.querySelector('.xterm-helper-textarea') === null ||
      !document.querySelector('.xterm-helper-textarea')?.closest('[role="dialog"], [data-felixo-terminal-drawer]'))
  }

  // --- passos --------------------------------------------------------------

  async function criarContas() {
    const passo = 'C1 contas'
    const criadas = []
    for (const label of [CONTA_A, CONTA_B]) {
      const resultado = await page.evaluate((params) => window.felixo.cliAccounts.create(params), { providerId: 'codex', label })
      exigir(resultado?.ok === true, passo, `criar ${label} falhou`, resultado)
      criadas.push(resultado.account)
    }
    log(`C1 duas contas Codex falsas criadas pelo IPC: ok`)
    return criadas
  }

  async function ligarEOrdenarCadeia() {
    const passo = 'C2 aba Cadeia'
    await abrirLimitesEUso(passo)
    await irParaAba(passo, 'Cadeia')
    const toggle = page.getByRole('switch', { name: 'Cadeia de contas' })
    exigir((await toggle.getAttribute('aria-checked')) === 'false', passo, 'a cadeia não começou desligada')
    await toggle.focus()
    await page.keyboard.press('Space')
    await esperar(passo, 'a cadeia ligar pelo Espaço', () =>
      document.querySelector('[role="switch"][aria-label="Cadeia de contas"]')?.getAttribute('aria-checked') === 'true')
    const estrategia = (await page.getByRole('combobox', { name: 'Estratégia da cadeia' }).textContent())?.trim()
    exigir(estrategia?.includes('Ordem manual'), passo, 'a cadeia ligada não começou em Ordem manual', estrategia)

    await esperar(passo, 'as duas contas aparecerem na ordem da cadeia', () =>
      document.querySelectorAll('ol[aria-label="Ordem da cadeia de contas"] > li').length === 2)
    for (let indice = 0; indice < 2; indice += 1) {
      const caixa = page.locator('ol[aria-label="Ordem da cadeia de contas"] > li').nth(indice).getByRole('checkbox', { name: 'Habilitada na cadeia' })
      await caixa.focus()
      await page.keyboard.press('Space')
      await esperar(passo, `a ${indice + 1}ª conta ficar habilitada`, (i) =>
        document.querySelectorAll('ol[aria-label="Ordem da cadeia de contas"] > li input[type="checkbox"]')[i]?.checked === true, indice)
    }

    const ordem = () => page.$$eval('ol[aria-label="Ordem da cadeia de contas"] > li', (items) =>
      items.map((item) => item.querySelector('.truncate')?.textContent?.trim() ?? ''))
    const antes = await ordem()
    const primeiraLinha = page.locator('ol[aria-label="Ordem da cadeia de contas"] > li').first()
    await primeiraLinha.focus()
    await page.keyboard.press('Alt+ArrowDown')
    const anuncio = `${antes[0]} agora é a 2ª`
    await esperar(passo, `o aria-live anunciar "${anuncio}"`, (texto) =>
      [...document.querySelectorAll('[aria-live="polite"]')].some((el) => el.textContent?.trim() === texto), anuncio)
    const depois = await ordem()
    exigir(depois[0] === antes[1] && depois[1] === antes[0], passo, 'Alt+↓ não trocou a ordem', { antes, depois })
    const foco = await page.evaluate(() => document.activeElement?.getAttribute('data-chain-member') !== null &&
      document.activeElement?.closest('li')?.querySelector('.truncate')?.textContent?.trim())
    exigir(foco === antes[0], passo, 'o foco não acompanhou a conta movida', { foco })
    await fecharPainel()

    await page.reload()
    await checarMontagem(page)
    await abrirLimitesEUso(passo)
    await irParaAba(passo, 'Cadeia')
    await esperar(passo, 'a ordem aparecer depois do reload', () =>
      document.querySelectorAll('ol[aria-label="Ordem da cadeia de contas"] > li').length === 2)
    const recarregada = await ordem()
    exigir(JSON.stringify(recarregada) === JSON.stringify(depois), passo, 'a ordem não sobreviveu ao reload', { depois, recarregada })
    await fecharPainel()
    log(`C2 cadeia começa desligada, liga em Ordem manual pelo teclado, Alt+↓ reordena com aria-live e a ordem sobrevive ao reload: ok (${depois.join(' → ')})`)
    return { primeira: depois[0], segunda: depois[1] }
  }

  async function abrirBlocoDaCadeia(contas) {
    const passo = 'C3 bloco Automática (cadeia)'
    await abrirConfiguracaoDoAgente()
    await escolherNoSelect('Agente', 'Codex')
    await escolherNoSelect('Conta', 'Automática (cadeia)')
    const esperado = `${contas.primeira}`
    await esperar(passo, `a prévia mostrar ${esperado} antes de abrir`, (conta) => {
      const grupo = document.querySelector('[role="group"][aria-label="Configurar novo agente"]')
      const status = [...(grupo?.querySelectorAll('[role="status"]') ?? [])].map((el) => el.textContent ?? '')
      return status.some((texto) => texto.includes(conta) && texto.includes('Abrir confirma essa conta.'))
    }, esperado)
    const selo = `${contas.primeira} · cadeia`
    const ids = []
    // Dois blocos da cadeia: cada sessão tem uma proposta por incidente (P9),
    // então o primeiro serve à recusa e o segundo à confirmação.
    for (let ordem = 1; ordem <= 2; ordem += 1) {
      if (ordem > 1) {
        await abrirConfiguracaoDoAgente()
        await escolherNoSelect('Conta', 'Automática (cadeia)')
        await esperar(passo, `a prévia do ${ordem}º bloco mostrar ${esperado}`, (conta) => {
          const grupo = document.querySelector('[role="group"][aria-label="Configurar novo agente"]')
          return [...(grupo?.querySelectorAll('[role="status"]') ?? [])]
            .some((el) => el.textContent?.includes(conta) && el.textContent.includes('Abrir confirma essa conta.'))
        }, esperado)
      }
      const antes = await contadores()
      await page.getByRole('button', { name: 'Abrir agente' }).click()
      await esperarBloco(passo, selo)
      await esperar(passo, `o ${ordem}º bloco da cadeia aparecer`, ({ texto, total }) =>
        [...document.querySelectorAll('.react-flow__node .felixo-node-account')].filter((el) => el.textContent?.trim() === texto).length === total,
      { texto: selo, total: ordem })
      await exigirSpawns(passo, `abrir o ${ordem}º bloco da cadeia`, antes.spawn + 1)
      ids.push((await idsDosBlocos(selo)).find((id) => !ids.includes(id)))
    }
    log(`C3 "Automática (cadeia)" mostra ${contas.primeira} antes de abrir e os blocos nascem com o selo cadeia: ok`)
    return { recusa: ids[0], confirmacao: ids[1] }
  }

  async function abrirBlocoFixo(contas) {
    const passo = 'C4 bloco fixo'
    await abrirConfiguracaoDoAgente()
    await escolherNoSelect('Conta', contas.primeira)
    const antes = await contadores()
    await page.getByRole('button', { name: 'Abrir agente' }).click()
    const fixo = await esperarBloco(passo, `${contas.primeira} · fixa`)
    await exigirSpawns(passo, 'abrir o bloco fixo', antes.spawn + 1)
    await page.getByRole('button', { name: 'Configurar novo agente' }).click()

    await digitarNoBloco(passo, fixo, GATILHO_LIMITE)
    await fixo.locator('[role="status"]', { hasText: 'bloco fixo: nada troca sozinho' }).waitFor({ state: 'visible', timeout })
    await pausa(JANELA_DE_SILENCIO_MS)
    const propostas = await propostasDeTroca()
    exigir(propostas.length === 0, passo, 'o bloco fixo gerou proposta de troca', propostas)
    exigir(await page.locator('[role="dialog"]').count() === 0, passo, 'um diálogo abriu sozinho')
    exigir(await fixo.getByRole('button', { name: 'Ver opções' }).count() === 0, passo, 'o bloco fixo ganhou [Ver opções]')
    log('C4 gatilho de limite no bloco fixo: faixa "bloco fixo", sem proposta e sem diálogo: ok')
  }

  async function dispararLimiteNaCadeia(passo, nodeId) {
    const bloco = nodePorId(nodeId)
    await digitarNoBloco(passo, bloco, GATILHO_LIMITE)
    await bloco.getByRole('button', { name: 'Ver opções' }).waitFor({ state: 'visible', timeout })
    return bloco
  }

  async function checarPropostaENotificacao(blocos) {
    const passo = 'C5 proposta na cadeia'
    await dispararLimiteNaCadeia(passo, blocos.recusa)
    await page.getByRole('button', { name: /^Notificações/ }).click()
    const item = page.locator('[role="status"]', { hasText: 'A cadeia tem uma proposta de troca.' })
    await item.first().waitFor({ state: 'visible', timeout })
    await page.getByRole('button', { name: /^Notificações/ }).click()
    log('C5 gatilho no bloco da cadeia: faixa com [Ver opções] e item nas notificações: ok')
  }

  async function checarDialogoEAgoraNao(contas, blocos) {
    const passo = 'C6 diálogo pelo teclado'
    const bloco = nodePorId(blocos.recusa)
    const antes = await contadores()
    await bloco.getByRole('button', { name: 'Ver opções' }).focus()
    await page.keyboard.press('Enter')
    const dialogo = page.getByRole('dialog')
    await dialogo.waitFor({ state: 'visible', timeout })
    exigir((await dialogo.getAttribute('aria-modal')) === 'true', passo, 'o diálogo não é aria-modal')
    exigir(await dialogo.getByRole('radiogroup', { name: 'Conta de destino' }).count() === 1, passo, 'sem radiogroup "Conta de destino"')
    await esperar(passo, 'o foco inicial cair no rádio recomendado', (segunda) => {
      const ativo = document.activeElement
      const rotulo = ativo?.closest('label')
      return ativo instanceof HTMLInputElement && ativo.type === 'radio' && ativo.checked &&
        rotulo?.textContent?.includes('Recomendada') && rotulo.textContent.includes(segunda)
    }, contas.segunda)
    // Esc vale "Agora não": a proposta acaba e a faixa que abriu o diálogo sai
    // com ela, então o foco volta ao bloco de origem (nunca ao <body>).
    await page.keyboard.press('Escape')
    await dialogo.waitFor({ state: 'detached', timeout })
    const origem = await bloco.locator('[data-terminal-expand-trigger]').first().getAttribute('data-terminal-expand-trigger')
    await esperar(passo, 'o Esc devolver o foco ao bloco de origem', (nodeId) =>
      document.activeElement?.getAttribute('data-terminal-expand-trigger') === nodeId, origem)
    await pausa(JANELA_DE_SILENCIO_MS)
    exigir(await bloco.getByRole('button', { name: 'Ver opções' }).count() === 0, passo, 'a proposta continuou aberta depois do Esc')
    const depois = await contadores()
    exigir(depois.spawn === antes.spawn, passo, 'Esc ("Agora não") gerou pty:spawn', { antes, depois })
    log('C6 [Ver opções] pelo teclado: foco no rádio recomendado; Esc ("Agora não") fecha, encerra a proposta, devolve o foco ao bloco e não gera pty:spawn: ok')
  }

  async function checarViewportMinimoDoDialogo(passo, dialogo) {
    await page.setViewportSize(VIEWPORT_MINIMO)
    try {
      await esperar(passo, 'o diálogo caber em 375×667', ({ width, height }) => {
        const painel = document.querySelector('[role="dialog"]')
        if (!painel) return false
        const rect = painel.getBoundingClientRect()
        return rect.left >= 0 && rect.top >= 0 && rect.right <= width + 0.5 && rect.bottom <= height + 0.5 &&
          document.documentElement.scrollWidth <= width + 0.5
      }, VIEWPORT_MINIMO)
      const sobrepostos = await dialogo.evaluate((painel) => {
        const botoes = [...painel.querySelectorAll('button')].map((botao) => ({ nome: botao.textContent?.trim() || botao.getAttribute('aria-label'), rect: botao.getBoundingClientRect() }))
        const pares = []
        for (let i = 0; i < botoes.length; i += 1) {
          for (let j = i + 1; j < botoes.length; j += 1) {
            const a = botoes[i].rect
            const b = botoes[j].rect
            const sobrepoe = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
            if (sobrepoe) pares.push([botoes[i].nome, botoes[j].nome])
          }
        }
        return pares
      })
      exigir(sobrepostos.length === 0, passo, 'botões do diálogo sobrepostos em 375×667', sobrepostos)
    } finally {
      await page.setViewportSize(VIEWPORT_PADRAO)
    }
  }

  async function confirmarTroca(contas, blocos) {
    const passo = 'C7 confirmar a troca'
    const bloco = await dispararLimiteNaCadeia(passo, blocos.confirmacao)
    const antes = await contadores()
    await bloco.getByRole('button', { name: 'Ver opções' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.waitFor({ state: 'visible', timeout })
    await checarViewportMinimoDoDialogo('C12 viewport 375×667', dialogo)
    const confirmar = dialogo.getByRole('button', { name: `Abrir bloco novo em ${contas.segunda}` })
    // Clique duplo: o segundo clique não pode abrir outro bloco.
    await confirmar.dblclick()
    await esperarBloco(passo, `${contas.segunda} · cadeia`)
    const depois = await exigirSpawns(passo, 'confirmar com clique duplo', antes.spawn + 1)
    exigir(await nodeDaConta(`${contas.segunda} · cadeia`).count() === 1, passo, 'mais de um bloco novo na conta de destino')
    exigir(await bloco.count() === 1, passo, 'o bloco antigo sumiu')
    await bloco.locator('[role="status"]', { hasText: 'continuado em' }).waitFor({ state: 'visible', timeout })
    const antigoVivo = await bloco.evaluate((node) => !/Encerrado|Erro/.test(node.textContent ?? ''))
    exigir(antigoVivo, passo, 'o bloco antigo não está mais vivo')
    log(`C7 confirmar (com clique duplo) deu exatamente +1 pty:spawn; bloco novo em ${contas.segunda} com selo cadeia e o antigo parado com "continuado em": ok`)
    log('C9 clique duplo no confirmar continua +1: ok')
    return depois
  }

  async function checarAbaTrocas(contas) {
    const passo = 'C8 aba Trocas'
    await abrirLimitesEUso(passo)
    await irParaAba(passo, 'Trocas')
    const lista = page.getByRole('list', { name: 'Registro de trocas de conta' })
    await lista.waitFor({ state: 'visible', timeout })
    const linha = lista.locator('li', { hasText: 'bloco aberto' }).first()
    await linha.waitFor({ state: 'visible', timeout })
    const texto = (await linha.textContent()) ?? ''
    exigir(texto.includes(contas.primeira) && texto.includes(contas.segunda), passo, 'a troca não mostra origem e destino', texto)
    exigir(/limite/i.test(texto), passo, 'a troca não mostra o motivo', texto)
    exigir(await linha.locator('time[datetime]').count() === 1, passo, 'a troca não mostra o horário', texto)
    await fecharPainel()
    log('C8 aba Trocas mostra "bloco aberto" com motivo e horário: ok')
  }

  async function checarReloadSemReenvio() {
    const passo = 'C10 reload'
    await pausa(JANELA_DE_SILENCIO_MS)
    const antes = await contadores()
    await page.reload()
    await checarMontagem(page)
    await pausa(JANELA_DE_SILENCIO_MS * 2)
    const depois = await contadores()
    exigir(depois.write === antes.write, passo, 'o reload reenviou algo ao terminal (pty:write subiu)', { antes, depois })
    log(`C10 reload sem reenvio (pty:write ${antes.write} → ${depois.write}): ok`)
  }

  async function checarRedeSemItem(contas) {
    const passo = 'C11 rede'
    const novo = await esperarBloco(passo, `${contas.segunda} · cadeia`)
    await digitarNoBloco(passo, novo, GATILHO_REDE)
    await pausa(JANELA_DE_SILENCIO_MS * 2)
    const propostas = await propostasDeTroca()
    exigir(propostas.length === 0, passo, 'a queda de rede gerou proposta de troca', propostas)
    exigir(await novo.getByRole('button', { name: 'Ver opções' }).count() === 0, passo, 'a queda de rede ganhou [Ver opções]')
    await page.getByRole('button', { name: /^Notificações/ }).click()
    await pausa(300)
    const itens = await page.locator('[role="status"]', { hasText: 'A cadeia tem uma proposta de troca.' }).count()
    await page.getByRole('button', { name: /^Notificações/ }).click()
    exigir(itens === 0, passo, 'a queda de rede gerou item nas notificações', { itens })
    log('C11 queda de rede não gera proposta nem item: ok')
  }

  async function checarNomesAcessiveis() {
    const passo = 'C12 nomes acessíveis'
    await abrirLimitesEUso(passo)
    await irParaAba(passo, 'Cadeia')
    const semNome = await page.evaluate(() => {
      const nome = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim() ||
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim()) ||
        el.closest('label')?.textContent?.trim() || ''
      const alvos = document.querySelectorAll(
        'button, [role="tab"], [role="switch"], [role="combobox"], [role="radio"], input, select, textarea, [role="dialog"], [role="radiogroup"], [role="tablist"], ol[aria-label], ul[aria-label]',
      )
      return [...alvos]
        .filter((el) => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]'))
        .filter((el) => !(el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim()))
        .filter((el) => !nome(el))
        .map((el) => el.outerHTML.slice(0, 120))
    })
    await fecharPainel()
    exigir(semNome.length === 0, passo, 'controles sem nome acessível', semNome)
    log('C12 nomes acessíveis (canvas, painel Cadeia, diálogo com role=dialog, aria-modal e radiogroup) e diálogo em 375×667: ok')
  }

  async function checarCardDoOrquestrador() {
    const passo = 'C13 card do orquestrador'
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    // O card junta o stream com a lista que o main devolve ao montar (a lista
    // do main manda): o evento só entra depois de a lista inicial chegar.
    await page.locator('[role="region"][aria-label="Trocas de provedor esperando sua confirmação"]').waitFor({ state: 'attached', timeout })
    await pausa(JANELA_DE_SILENCIO_MS)
    const agora = Date.now()
    const evento = {
      type: 'provider_switch_request',
      // Id bem formado que o main não conhece: o [Não trocar] chega ao main
      // e volta DECISION_NOT_PENDING (id malformado voltaria INVALID_PARAMS).
      decisionId: randomUUID(),
      kind: 'mid-task',
      runId: 'smoke-run',
      agentId: 'smoke-agente',
      parentThreadId: 'smoke-thread',
      sessionId: 'smoke-sessao',
      fromCliType: 'claude',
      toCliType: 'codex',
      toModelId: null,
      toModelName: null,
      rule: null,
      reason: 'Smoke: limite do provedor',
      requestedAt: new Date(agora).toISOString(),
      expiresAt: new Date(agora + 600_000).toISOString(),
    }
    await mainEval(`mainWindow.webContents.send('cli:stream', ${JSON.stringify(evento)})`)
    const regiao = page.getByRole('region', { name: 'Trocas de provedor esperando sua confirmação' })
    await regiao.waitFor({ state: 'visible', timeout })
    exigir((await regiao.textContent())?.includes('Trocar de provedor?'), passo, 'o card não pergunta a troca')
    await regiao.getByRole('button', { name: 'Não trocar' }).click()
    await regiao.getByRole('alert').filter({ hasText: 'Essa troca já foi respondida ou expirou.' }).waitFor({ state: 'visible', timeout })
    log('C13 card do orquestrador no chat: [Não trocar] chama o main e mostra DECISION_NOT_PENDING: ok')
  }

  return {
    async executar() {
      // Página dedicada a esta sessão: toda espera do Playwright usa o teto dela.
      page.setDefaultTimeout(timeout)
      await page.setViewportSize(VIEWPORT_PADRAO)
      await checarMontagem(page)
      await criarContas()
      const contas = await ligarEOrdenarCadeia()
      const blocos = await abrirBlocoDaCadeia(contas)
      await abrirBlocoFixo(contas)
      await checarPropostaENotificacao(blocos)
      await checarDialogoEAgoraNao(contas, blocos)
      await confirmarTroca(contas, blocos)
      await checarAbaTrocas(contas)
      await checarReloadSemReenvio()
      await checarRedeSemItem(contas)
      await checarNomesAcessiveis()
      await checarCardDoOrquestrador()
    },
  }
}

module.exports = { criarSessaoDaCadeia }
