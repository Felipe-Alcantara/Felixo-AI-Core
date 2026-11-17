'use strict'

/**
 * Sessão G do smoke do canvas: o editor de visualização do painel "Tarefas
 * Notion", clicado no app de verdade, sem rede e sem token do Notion.
 *
 * Os handlers IPC do Notion são trocados por falsos no processo principal
 * (`canvas-smoke-notion-fixture.cjs`), e o painel carrega uma conexão, uma
 * database e seis tarefas, três delas sem repositório. Passos:
 *
 * - N1 "Uma por repositório": o botão aparece; recusar o `confirm` não muda
 *   nada; aceitar cria uma aba por repositório e a das tarefas sem ele, com a
 *   mensagem em tela; repetir diz que já existe uma para cada;
 * - N2 editor: o chip "Sem Repositório" vem primeiro, e a aba criada com ele
 *   lista só as tarefas sem repositório (a concluída só entra depois de
 *   "Mostrar tarefas concluídas");
 * - N3 com o Painel agrupando por uma ligação, o botão não aparece.
 *
 * O `canvas-smoke.cjs` sobe esta sessão num perfil isolado novo. O
 * `window.confirm` é trocado por um gravador dentro da página.
 */

const {
  CONEXAO_ID,
  DATABASE_ID,
  REPO_A,
  REPO_B,
  TAREFAS,
  scriptDosHandlers,
  titulos,
} = require('./canvas-smoke-notion-fixture.cjs')

const NODE_ID = 'notion-smoke'
const NODE_TITLE = 'Tarefas do smoke'
const SEM_REPO = 'Sem Repositório'
const BOTAO_POR_REPO = 'Criar uma visualização para cada repositório'
const ABAS = '[role="tablist"][aria-label="Visualizações de tarefas"]'
const TABELA = 'table[aria-label="Tarefas do Notion"]'

function falhar(passo, mensagem, detalhe) {
  const extra = detalhe === undefined ? '' : ` ${JSON.stringify(detalhe)}`
  throw new Error(`[canvas-smoke:notion] ${passo}: ${mensagem}${extra}`)
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
function criarSessaoDoNotion(deps) {
  const { page, checarMontagem } = deps
  const timeout = deps.timeoutMs
  const log = deps.log ?? ((message) => console.log(`[canvas-smoke:notion] ${message}`))
  const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const painel = () => page.locator(`.react-flow__node[data-id="${NODE_ID}"]`)
  const botaoPorRepo = () => painel().getByRole('button', { name: BOTAO_POR_REPO })

  async function esperar(passo, descricao, predicate, arg) {
    try {
      await page.waitForFunction(predicate, arg, { timeout })
    } catch (error) {
      falhar(passo, `${descricao} não aconteceu em ${timeout} ms (${error.message.split('\n')[0]})`)
    }
  }

  /** `window.confirm` vira um gravador: guarda o texto e responde `resposta`. */
  async function instalarConfirm() {
    await page.evaluate(() => {
      window.__notionSmoke = { confirms: [], resposta: true }
      window.confirm = (texto) => {
        window.__notionSmoke.confirms.push(String(texto))
        return window.__notionSmoke.resposta
      }
    })
  }
  const responderConfirm = (resposta) => page.evaluate((valor) => { window.__notionSmoke.resposta = valor }, resposta)
  const confirmacoes = () => page.evaluate(() => [...window.__notionSmoke.confirms])

  /** Os nomes das abas do painel, na ordem. */
  const nomesDasAbas = () =>
    painel().locator(`${ABAS} [role="tab"]`).evaluateAll((abas) => abas.map((aba) => (aba.textContent ?? '').trim()))

  /** As tarefas da fixture que aparecem na tabela agora. */
  const tarefasNaTabela = (todos) =>
    painel().locator(`${TABELA} tbody`).evaluate(
      (corpo, titulosDaFixture) => titulosDaFixture.filter((titulo) => (corpo.textContent ?? '').includes(titulo)),
      todos,
    )

  async function esperarTabela(passo, descricao, esperadas) {
    const todos = TAREFAS.map((tarefa) => tarefa.title)
    const ordenar = (lista) => [...lista].sort()
    let lidas = []
    for (let i = 0; i < 40; i += 1) {
      lidas = await tarefasNaTabela(todos)
      if (JSON.stringify(ordenar(lidas)) === JSON.stringify(ordenar(esperadas))) return
      await pausa(150)
    }
    falhar(passo, `${descricao}: a tabela não lista as tarefas esperadas`, { esperadas, lidas })
  }

  /** Abre uma opção de um FelixoSelect pelo rótulo. */
  async function escolherNoSelect(rotuloDoSelect, opcao) {
    await painel().getByRole('combobox', { name: rotuloDoSelect }).click()
    await page.getByRole('option', { name: opcao, exact: true }).click()
  }

  /** Grava o canvas só com o bloco do painel, instala os handlers falsos e remonta. */
  async function prepararCanvas(passo, preferencias) {
    const node = {
      id: NODE_ID,
      type: 'notionTasks',
      position: { x: 0, y: 0 },
      width: 720,
      height: 600,
      data: { label: NODE_TITLE, notionConnectionId: CONEXAO_ID, notionDataSourceId: DATABASE_ID },
    }
    const resultado = await page.evaluate(async ({ bloco, fonte, chave, valor }) => {
      const bridge = window.felixo.canvas
      const limpo = await bridge.clear()
      if (!limpo?.ok) return { ok: false, message: limpo?.message }
      const salvo = await bridge.save(bloco)
      if (!salvo?.ok) return { ok: false, message: salvo?.message }
      window.localStorage.clear()
      if (chave) window.localStorage.setItem(chave, valor)
      return { ok: true, handlers: await window.felixo.devtools.mainEval(fonte) }
    }, {
      bloco: node,
      fonte: scriptDosHandlers({ relacao: Boolean(preferencias) }),
      chave: preferencias ? `felixo:notion-repo-board:${CONEXAO_ID}:${DATABASE_ID}` : '',
      valor: JSON.stringify(preferencias ?? {}),
    })
    exigir(resultado.ok, passo, 'o canvas do Notion não foi gravado', resultado)
    // O Vite compila sob demanda: a primeira carga de um perfil novo passa dos 30 s do padrão numa máquina carregada.
    await page.reload({ timeout: Math.max(timeout * 4, 60_000) })
    await checarMontagem(page)
    await instalarConfirm()
    await esperar(passo, 'o bloco montar', (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`), NODE_ID)
    await focar()
    await painel().locator(ABAS).waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'o painel de tarefas não carregou as abas (os handlers falsos não responderam?)'))
  }

  /** Centraliza o bloco pela lista "Elementos", que usa a área segura do canvas. */
  async function focar() {
    const item = page.locator(`button[title="${NODE_TITLE}"]`).first()
    if (!(await item.isVisible())) {
      const abrir = page.getByRole('button', { name: 'Abrir elementos' })
      if (await abrir.isVisible()) await abrir.click()
    }
    await item.click()
    // A câmera anda em 240 ms.
    await pausa(450)
  }

  async function umaPorRepositorio() {
    const passo = 'N1 uma por repositório'
    const antes = await nomesDasAbas()
    await botaoPorRepo().waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'o botão "Uma por repositório" não apareceu', antes))

    await responderConfirm(false)
    await botaoPorRepo().click()
    await esperar(passo, 'o confirm abrir', () => window.__notionSmoke.confirms.length === 1)
    exigir(JSON.stringify(await nomesDasAbas()) === JSON.stringify(antes), passo, 'recusar o confirm mudou as abas', await nomesDasAbas())

    await responderConfirm(true)
    await botaoPorRepo().click()
    await painel().getByText('Criei 3 visualizações').waitFor({ state: 'visible', timeout })
      .catch(async () => falhar(passo, 'a mensagem "Criei 3 visualizações" não apareceu', {
        abas: await nomesDasAbas(),
        confirms: await confirmacoes(),
      }))
    const depois = await nomesDasAbas()
    exigir(
      depois.length === antes.length + 3 && [REPO_A, REPO_B, SEM_REPO].every((nome) => depois.includes(nome)),
      passo, 'faltou uma aba por repositório e a das tarefas sem ele', { antes, depois },
    )
    exigir((await confirmacoes()).length === 2, passo, 'o confirm não perguntou uma vez por clique', await confirmacoes())

    await botaoPorRepo().click()
    await painel().getByText('Já existe uma visualização para cada repositório da lista').waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'o segundo clique não avisou que já existe uma para cada'))
    exigir(
      JSON.stringify(await nomesDasAbas()) === JSON.stringify(depois) && (await confirmacoes()).length === 2,
      passo, 'o segundo clique criou aba ou perguntou de novo', { abas: await nomesDasAbas() },
    )
    // A aba "Sem Repositório" criada pelo botão lista as sem repositório abertas.
    await painel().getByRole('tab', { name: SEM_REPO, exact: true }).click()
    await esperarTabela(passo, 'a aba "Sem Repositório"', titulos((tarefa) => !tarefa.fields['Repositório'] && !tarefa.completed))
  }

  async function editorComSemRepositorio() {
    const passo = 'N2 editor'
    await painel().getByRole('button', { name: 'Criar nova visualização' }).click()
    await escolherNoSelect('Propriedade para filtrar', 'Repositório')
    const chips = painel().locator('[role="group"][aria-label="Valores de Repositório"] button')
    await chips.first().waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'os chips de valores de Repositório não apareceram'))
    const rotulos = await chips.evaluateAll((botoes) => botoes.map((botao) => (botao.textContent ?? '').trim()))
    exigir(
      JSON.stringify(rotulos) === JSON.stringify([SEM_REPO, REPO_A, REPO_B]),
      passo, 'os chips não são "Sem Repositório" seguido dos valores', rotulos,
    )
    await chips.first().click()
    exigir(await chips.first().getAttribute('aria-pressed') === 'true', passo, 'o chip "Sem Repositório" não ficou marcado')
    await painel().getByRole('textbox', { name: 'Nome da visualização' }).fill('Sem repo (editor)')
    await painel().getByRole('button', { name: 'Criar visualização', exact: true }).click()
    await painel().getByRole('tab', { name: 'Sem repo (editor)', exact: true }).waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'a aba criada pelo editor não apareceu', null))
    exigir(
      await painel().getByRole('tab', { name: 'Sem repo (editor)', exact: true }).getAttribute('aria-selected') === 'true',
      passo, 'a aba criada não ficou selecionada',
    )
    // As concluídas ficam escondidas em todas as abas até a pessoa mostrá-las (o ícone do olho).
    await esperarTabela(passo, 'a aba "Sem repo (editor)"', titulos((tarefa) => !tarefa.fields['Repositório'] && !tarefa.completed))
    await painel().getByRole('button', { name: 'Mostrar tarefas concluídas' }).click()
    await esperarTabela(passo, 'a aba "Sem repo (editor)" com as concluídas à mostra', titulos((tarefa) => !tarefa.fields['Repositório']))
  }

  async function relacaoEscondeOBotao() {
    const passo = 'N3 ligação'
    // Painel agrupando por uma ligação: a visualização não teria o que filtrar.
    await prepararCanvas(passo, { groupBy: 'Projeto', open: false })
    await painel().getByRole('button', { name: 'Criar nova visualização' }).waitFor({ state: 'visible', timeout })
      .catch(() => falhar(passo, 'o painel não carregou com a ligação'))
    exigir((await botaoPorRepo().count()) === 0, passo, 'o botão "Uma por repositório" apareceu agrupando por uma ligação')
  }

  async function executar() {
    await prepararCanvas('N0 canvas')
    await umaPorRepositorio()
    await editorComSemRepositorio()
    await relacaoEscondeOBotao()
    log('N1–N3 ok: "Uma por repositório" (confirm, mensagem, repetição), chip "Sem Repositório" e a aba criada, ligação sem o botão')
  }

  return { executar }
}

module.exports = { criarSessaoDoNotion }
