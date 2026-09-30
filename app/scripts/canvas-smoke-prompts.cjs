'use strict'

/**
 * Sessão E do smoke do canvas: os caminhos por onde um pedido chega ao
 * terminal de um agente, clicados no app de verdade.
 *
 * O E2E do store (`src/features/canvas/terminal/prompt-origins-e2e.test.ts`)
 * prova o conteúdo de cada origem byte a byte; aqui o que se prova é o que a
 * pessoa vê: o retorno de cada painel, o nome no cartão do bloco, o aviso do
 * fallback e o que o canvas grava. Passos:
 *
 * - P1 catálogo: um prompt digitado no terminal aberto, sem Enter (quem
 *   envia é a pessoa);
 * - P2 combinação: dois prompts marcados e digitados juntos, na ordem;
 * - P3 fallback: a pasta dos arquivos de contexto some e o texto vai direto,
 *   com retorno próprio no painel e o aviso no cartão;
 * - P4 skill da biblioteca, ativada pelo painel de skills;
 * - P5 sem terminal aberto: o prompt vai para a área de transferência;
 * - P6 o que o canvas gravou: só a metadata da última inserção, sem o corpo.
 *
 * O `canvas-smoke.cjs` sobe esta sessão num perfil isolado novo, com a CLI
 * roteirizada no processo principal (`FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`), que
 * ecoa o que recebe: nenhuma CLI real roda, e a área de transferência é
 * trocada por um gravador dentro da página.
 */

const fs = require('node:fs')
const path = require('node:path')

const TERMINAL_ID = 'prompts-terminal'
const TERMINAL_TITLE = 'Terminal de prompts'
const CARD = `.react-flow__node[data-id="${TERMINAL_ID}"]`

function falhar(passo, mensagem, detalhe) {
  const extra = detalhe === undefined ? '' : ` ${JSON.stringify(detalhe)}`
  throw new Error(`[canvas-smoke:prompts] ${passo}: ${mensagem}${extra}`)
}

function exigir(condicao, passo, mensagem, detalhe) {
  if (!condicao) falhar(passo, mensagem, detalhe)
}

/**
 * @param {{
 *   page: import('playwright').Page,
 *   checarMontagem: (page: import('playwright').Page) => Promise<void>,
 *   estadoDaSessao: () => { userData?: string } | null,
 *   timeoutMs: number,
 *   log?: (message: string) => void,
 * }} deps
 */
function criarSessaoDePrompts(deps) {
  const { page, checarMontagem, estadoDaSessao } = deps
  const timeout = deps.timeoutMs
  const log = deps.log ?? ((message) => console.log(`[canvas-smoke:prompts] ${message}`))
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function esperar(passo, descricao, predicate, arg) {
    try {
      await page.waitForFunction(predicate, arg, { timeout })
    } catch (error) {
      falhar(passo, `${descricao} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`)
    }
  }

  async function prepararCanvas(passo) {
    const result = await page.evaluate(async (node) => {
      const bridge = window.felixo.canvas
      const cleared = await bridge.clear()
      if (!cleared?.ok) return { ok: false, message: cleared?.message }
      const saved = await bridge.save(node)
      return saved?.ok ? { ok: true } : { ok: false, message: saved?.message }
    }, {
      id: TERMINAL_ID,
      type: 'terminal',
      position: { x: 0, y: 0 },
      width: 520,
      height: 360,
      data: { label: TERMINAL_TITLE, command: 'claude', args: [], cwd: '', launchMode: 'agent' },
    })
    exigir(result.ok, passo, 'o canvas de prompts não foi gravado', result)
    await page.reload()
    await checarMontagem(page)
    // Nada sai da máquina: a área de transferência vira um gravador.
    await page.evaluate(() => {
      window.__promptsSmoke = { copied: [] }
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__promptsSmoke.copied.push(String(text))
          },
        },
      })
    })
    await esperar(passo, 'o bloco de terminal montar', (card) => Boolean(document.querySelector(card)), CARD)
  }

  /**
   * Aciona um controle pelo teclado, como quem navega com Tab: na janela da
   * CI do Windows (1008×655), com a gaveta fixada, a lista "Elementos" cobre
   * parte do painel, e o clique cairia nela (ver a memória das janelas do
   * smoke). Caixa de seleção usa Espaço; botão, Enter.
   */
  async function acionar(locator, tecla = 'Enter') {
    await locator.scrollIntoViewIfNeeded()
    await locator.focus()
    await page.keyboard.press(tecla)
  }

  function terminalContem(procurado) {
    return [...document.querySelectorAll('.xterm-rows')].some((rows) =>
      (rows.textContent ?? '').replace(/ /g, ' ').includes(procurado))
  }

  /** O item de um terminal na lista "Elementos" centraliza o bloco e abre a gaveta. */
  async function abrirTerminal(passo) {
    const item = page.locator(`button[title="${TERMINAL_TITLE}"]`).first()
    if (!(await item.isVisible())) {
      const abrir = page.getByRole('button', { name: 'Abrir elementos' })
      if (await abrir.isVisible()) await abrir.click()
    }
    await item.click()
    await pausa(450)
    await page.locator('.xterm-helper-textarea').last().waitFor({ state: 'attached', timeout })
      .catch(() => falhar(passo, 'a gaveta do terminal não abriu'))
    await esperar(passo, 'o prompt da CLI roteirizada', terminalContem, 'Nenhum processo externo')
    // Como a pessoa faz para usar os painéis com o terminal aberto: sem fixar,
    // o clique na barra lateral fecha a gaveta, e o prompt iria para a área de
    // transferência em vez do terminal.
    const fixar = page.getByRole('button', { name: 'Fixar terminal' })
    if (await fixar.isVisible()) await acionar(fixar)
    await page.getByRole('button', { name: 'Desafixar terminal' }).waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'a gaveta do terminal não ficou fixada'))
  }

  /**
   * Abre um painel do menu de ferramentas (ou só confirma que já está aberto).
   * A seção "Ferramentas" da barra lateral nasce recolhida.
   */
  async function abrirPainel(passo, nome, panelId) {
    const panel = page.locator(`[data-felixo-canvas-panel="${panelId}"]`)
    if (!(await panel.isVisible())) {
      const secao = page.locator('button[data-felixo-tour-anchor="secao-ferramentas"]')
      if ((await secao.getAttribute('aria-expanded')) !== 'true') await acionar(secao)
      await acionar(page.getByRole('group', { name: 'Ferramentas auxiliares' })
        .getByRole('button', { name: nome, exact: true }))
    }
    await panel.waitFor({ state: 'visible', timeout }).catch(() => falhar(passo, `o painel ${nome} não abriu`))
    return panel
  }

  /** O nome mostrado no cartão do bloco, e se veio da origem ou do texto. */
  function ultimoPromptNoCartao(card) {
    const element = document.querySelector(`${card} [data-felixo-last-prompt]`)
    return element ? { tipo: element.getAttribute('data-felixo-last-prompt'), texto: element.textContent ?? '' } : null
  }

  async function esperarCartao(passo, nome) {
    await esperar(passo, `o cartão mostrar "${nome}"`, ({ card, nome }) => {
      const element = document.querySelector(`${card} [data-felixo-last-prompt="nome"]`)
      return Boolean(element) && (element.textContent ?? '').includes(nome)
    }, { card: CARD, nome })
  }

  async function esperarRetorno(passo, escopo, resultado, texto) {
    await esperar(passo, `o retorno "${resultado}" aparecer`, ({ escopo, resultado, texto }) => {
      const element = document.querySelector(`${escopo} [data-felixo-delivery-feedback="${resultado}"]`)
      return Boolean(element) && (element.textContent ?? '').includes(texto)
    }, { escopo, resultado, texto })
  }

  /** Os dois primeiros prompts da lista, com o nome lido do rótulo da caixa de seleção. */
  async function doisPrompts(passo, panel) {
    const itens = await panel.locator('[data-felixo-prompt-id]').evaluateAll((elements) =>
      elements.slice(0, 2).map((element) => ({
        id: element.getAttribute('data-felixo-prompt-id'),
        nome: (element.querySelector('input[type="checkbox"]')?.getAttribute('aria-label') ?? '').replace(/^Selecionar /, ''),
      })))
    exigir(itens.length === 2 && itens.every((item) => item.id && item.nome), passo, 'o catálogo não tem dois prompts', itens)
    return itens
  }

  async function catalogo(prompts) {
    const passo = 'P1 catálogo'
    const panel = await abrirPainel(passo, 'Prompts', 'prompts')
    const [primeiro] = prompts ?? (await doisPrompts(passo, panel))
    const item = `[data-felixo-prompt-id="${primeiro.id}"]`
    await acionar(page.locator(`${item} [data-felixo-prompt-insert]`))
    await esperarRetorno(passo, item, 'sent', 'Digitado no terminal aberto.')
    await esperarCartao(passo, primeiro.nome)
    // A CLI roteirizada ecoa o que recebe: a referência do arquivo, com o comando entre aspas.
    await esperar(passo, 'o terminal receber a referência do arquivo de contexto', terminalContem, 'context read "felixo-context-')
  }

  async function combinacao(prompts) {
    const passo = 'P2 combinação'
    const panel = await abrirPainel(passo, 'Prompts', 'prompts')
    for (const prompt of prompts) {
      await acionar(panel.getByRole('checkbox', { name: `Selecionar ${prompt.nome}` }), 'Space')
    }
    await acionar(panel.getByRole('button', { name: /Enviar conjunto/ }))
    await esperarRetorno(passo, '[data-felixo-canvas-panel="prompts"]', 'sent', '2 prompts combinados e digitados')
    await esperarCartao(passo, `${prompts[0].nome}, ${prompts[1].nome}`)
    for (const prompt of prompts) {
      await acionar(panel.getByRole('checkbox', { name: `Selecionar ${prompt.nome}` }), 'Space')
    }
  }

  /**
   * A pasta dos arquivos de contexto vira um arquivo comum: a gravação falha
   * nos três sistemas, e o app usa o fallback inline de verdade.
   */
  async function fallback(prompts) {
    const passo = 'P3 fallback'
    const userData = estadoDaSessao()?.userData
    exigir(Boolean(userData), passo, 'a sessão não informou a pasta do perfil')
    const deliveries = path.join(userData, 'context-deliveries')
    fs.rmSync(deliveries, { recursive: true, force: true })
    fs.writeFileSync(deliveries, 'o smoke trocou a pasta por um arquivo para forçar o fallback')
    try {
      const panel = await abrirPainel(passo, 'Prompts', 'prompts')
      const segundo = prompts[1]
      const item = `[data-felixo-prompt-id="${segundo.id}"]`
      await acionar(panel.locator(`${item} [data-felixo-prompt-insert]`))
      await esperarRetorno(passo, item, 'sent-inline', 'arquivo temporário do contexto falhou')
      await esperarCartao(passo, segundo.nome)
      await esperar(passo, 'o aviso de fallback no cartão', (card) =>
        Boolean(document.querySelector(`${card} [data-felixo-context-warning]`)), CARD)
      await esperar(passo, 'o terminal receber o texto com o aviso', terminalContem, 'AVISO DO FELIXO AI CORE')
    } finally {
      fs.rmSync(deliveries, { force: true })
      fs.mkdirSync(deliveries, { recursive: true })
    }
  }

  async function skill() {
    const passo = 'P4 skill'
    const panel = await abrirPainel(passo, 'Skills', 'skills')
    const item = panel.locator('[data-felixo-skill-id]').first()
    await item.waitFor({ state: 'visible', timeout }).catch(() => falhar(passo, 'a biblioteca de skills está vazia'))
    const nome = ((await item.locator('span').first().textContent()) ?? '').trim()
    exigir(Boolean(nome), passo, 'a skill não tem nome visível')
    await acionar(item.locator('[data-felixo-skill-activate]'))
    await esperarRetorno(passo, '[data-felixo-canvas-panel="skills"]', 'sent', 'Digitada no terminal aberto.')
    await esperarCartao(passo, nome)
    return nome
  }

  async function semTerminalAberto(prompts, skillNome) {
    const passo = 'P5 sem terminal aberto'
    await acionar(page.getByRole('button', { name: 'Fechar terminal' }))
    await page.locator('.xterm-helper-textarea').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
    const panel = await abrirPainel(passo, 'Prompts', 'prompts')
    const item = `[data-felixo-prompt-id="${prompts[0].id}"]`
    await acionar(panel.locator(`${item} [data-felixo-prompt-insert]`))
    await esperarRetorno(passo, item, 'copied', 'copiado para a área de transferência')
    const copiado = await page.evaluate(() => window.__promptsSmoke.copied)
    exigir(copiado.length === 1 && copiado[0].trim().length > 0, passo, 'o prompt não foi para a área de transferência', copiado)
    // Nada foi enviado ao terminal: o cartão continua na skill.
    const cartao = await page.evaluate(ultimoPromptNoCartao, CARD)
    exigir(cartao?.texto.includes(skillNome), passo, 'copiar mudou o último prompt do cartão', cartao)
  }

  async function gravado(skillNome) {
    const passo = 'P6 gravado'
    await esperar(passo, 'o canvas gravar a última inserção', async ({ id, nome }) => {
      const listed = await window.felixo.canvas.list()
      const nodes = listed?.nodes ?? listed ?? []
      const node = nodes.find((candidate) => candidate.id === id)
      return node?.data?.lastPromptInsertion?.name === nome
    }, { id: TERMINAL_ID, nome: skillNome })
    const insertion = await page.evaluate(async (id) => {
      const listed = await window.felixo.canvas.list()
      const nodes = listed?.nodes ?? listed ?? []
      return nodes.find((candidate) => candidate.id === id)?.data?.lastPromptInsertion ?? null
    }, TERMINAL_ID)
    exigir(insertion?.source === 'skill', passo, 'a origem gravada não é skill', insertion)
    exigir(!('content' in insertion), passo, 'o corpo do prompt foi gravado no canvas', Object.keys(insertion))
  }

  async function executar() {
    await prepararCanvas('P0 canvas')
    await abrirTerminal('P0 terminal')
    const prompts = await doisPrompts('P0 catálogo', await abrirPainel('P0 catálogo', 'Prompts', 'prompts'))
    await catalogo(prompts)
    await combinacao(prompts)
    await fallback(prompts)
    const skillNome = await skill()
    await semTerminalAberto(prompts, skillNome)
    await gravado(skillNome)
    log('P0–P6 ok: catálogo, combinação, fallback, skill, área de transferência e gravação')
  }

  return { executar }
}

module.exports = { criarSessaoDePrompts }
