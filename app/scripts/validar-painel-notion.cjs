'use strict'
/**
 * Valida o Painel do bloco Tarefas Notion no app empacotado, contra a API do
 * Notion, numa instância isolada (userData temporário, apagado no fim).
 *
 *   node scripts/validar-painel-notion.cjs <saida> <exe-do-felixo> <database-id> [--perfil <alias>] [--recarga]
 *
 * Credencial: o token do perfil do `notion-tasks` desta máquina. Ele só vai para
 * o cofre cifrado da instância isolada; não é impresso nem gravado na saída.
 * Só leitura no Notion, salvo com `--recarga`: muda o link de UMA linha da
 * database de detalhes, espera o cartão mudar sozinho e restaura o original.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const APP = path.resolve(__dirname, '..')
const { connect, findFreePort, waitForCdp } = require(path.join(APP, 'electron/cli/felixo-devtools.cjs'))

const posicionais = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--perfil')
const [OUT, EXE, DATABASE] = posicionais
const opcao = (nome) => { const i = process.argv.indexOf(nome); return i < 0 ? null : process.argv[i + 1] }
const COM_RECARGA = process.argv.includes('--recarga')
if (!OUT || !EXE || !DATABASE) {
  console.error('Uso: node scripts/validar-painel-notion.cjs <saida> <exe> <database-id> [--perfil <alias>] [--recarga]')
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hora = () => new Date().toLocaleTimeString('pt-BR')
const evidencia = { inicio: new Date().toISOString(), itens: {} }
const registrar = (item, dados) => {
  evidencia.itens[item] = { ...(evidencia.itens[item] ?? {}), ...dados }
  console.log(`${hora()} [${item}]`, JSON.stringify(dados).slice(0, 700))
}

const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA ?? path.join(os.homedir(), '.config'), 'notion-tasks', '.notion-workspaces.json'), 'utf8'))
const TOKEN = config.perfis[opcao('--perfil') ?? config.ativo]?.token
if (!TOKEN) throw new Error('perfil do notion-tasks sem token')
const mascarar = (texto) => String(texto).split(TOKEN).join('[token]')

async function notion(metodo, rota, corpo) {
  for (let tentativa = 0; ; tentativa += 1) {
    const resposta = await fetch(`https://api.notion.com${rota}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    if (resposta.ok) return resposta.json()
    if (tentativa < 4 && (resposta.status === 429 || resposta.status >= 500)) { await wait(2000 * (tentativa + 1)); continue }
    throw new Error(`Notion ${metodo} ${rota}: HTTP ${resposta.status}`)
  }
}
async function todasAsLinhas(fonte) {
  const linhas = []
  let cursor
  do {
    const pagina = await notion('POST', `/v1/data_sources/${fonte}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
    linhas.push(...pagina.results)
    cursor = pagina.has_more ? pagina.next_cursor : null
  } while (cursor)
  return linhas
}
const titulo = (pagina) => Object.values(pagina.properties).find((p) => p.type === 'title')?.title.map((t) => t.plain_text).join('') ?? ''
/** Mesma regra da tela, escrita aqui de novo: 100% só com tudo feito, 0% só sem nada feito. */
const percentual = (feitas, total) => feitas >= total ? 100 : feitas <= 0 ? 0 : Math.min(99, Math.max(1, Math.round((feitas * 100) / total)))

/** O placar esperado, calculado direto da API: `chavesDe` diz em quais cartões cada tarefa entra. */
function placar(tarefas, chavesDe) {
  const grupos = new Map()
  for (const tarefa of tarefas) {
    const feita = tarefa.properties.Etapa?.status?.name === 'Concluída'
    for (const chave of chavesDe(tarefa)) {
      const g = grupos.get(chave) ?? { total: 0, feitas: 0 }
      g.total += 1
      if (feita) g.feitas += 1
      grupos.set(chave, g)
    }
  }
  return new Map([...grupos].map(([chave, g]) => [chave, { total: g.total, abertas: g.total - g.feitas, percentual: percentual(g.feitas, g.total) }]))
}

async function main() {
  const base = await notion('GET', `/v1/databases/${DATABASE}`)
  const fonte = base.data_sources[0].id
  const esquema = await notion('GET', `/v1/data_sources/${fonte}`)
  const nomeDaBase = base.title.map((t) => t.plain_text).join('')
  const fonteDetalhes = esquema.properties.Projeto?.relation?.data_source_id

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-painel-'))
  const errosDeConsole = []
  let app = null
  const abrir = async () => {
    const port = await findFreePort()
    const env = { ...process.env, FELIXO_USER_DATA_DIR: userData, FELIXO_DEVTOOLS_PORT: String(port), FELIXO_DEVTOOLS_HEADLESS: '1' }
    delete env.ELECTRON_RUN_AS_NODE
    // Código-fonte (Electron do node_modules): vem do Vite apontado por quem chama.
    if (!/^electron(\.exe)?$/i.test(path.basename(EXE))) delete env.VITE_DEV_SERVER_URL
    // Com o Electron do node_modules, abre o código deste app (depois de `npm run build`).
    const processo = spawn(EXE, /^electron(\.exe)?$/i.test(path.basename(EXE)) ? [APP] : [], { env, stdio: 'ignore' })
    const saiu = new Promise((resolve) => processo.on('exit', resolve))
    // Registrado já aqui: uma falha na abertura não pode deixar o processo vivo segurando o perfil.
    app = { processo, saiu }
    await waitForCdp(port, { timeoutMs: 120_000 })
    const { browser, page } = await connect({ pid: processo.pid, port })
    page.on('console', (m) => { if (m.type() === 'error') errosDeConsole.push(mascarar(m.text()).slice(0, 300)) })
    page.on('pageerror', (e) => errosDeConsole.push(mascarar(e.message).slice(0, 300)))
    await page.waitForFunction(() => document.documentElement.dataset.felixoAppReady === 'true', null, { timeout: 120_000 })
    // Janela escondida tem os timers estrangulados; transparente e sem foco, não.
    await page.evaluate(() => window.felixo.devtools.mainEval('(mainWindow.setSkipTaskbar(true), mainWindow.setIgnoreMouseEvents(true), mainWindow.setOpacity(0), mainWindow.showInactive(), true)'))
    app = { processo, saiu, browser, page }
    return app
  }
  const fechar = async () => {
    if (!app) return
    await app.page?.evaluate(() => window.felixo.devtools.mainEval('(app.quit(), true)')).catch(() => {})
    const encerrou = await Promise.race([app.saiu.then(() => true), wait(20_000).then(() => false)])
    await app.browser?.close().catch(() => {})
    if (!encerrou) app.processo.kill()
    await app.saiu
    app = null
    return encerrou
  }

  const lerCartoes = (page) => page.evaluate(() => [...document.querySelectorAll('section[aria-label="Painel de repositórios"] ul > li')].map((li) => {
    const nome = li.querySelector('span[title]')?.getAttribute('title') ?? ''
    const placarTexto = [...li.querySelectorAll('span')].map((s) => s.textContent).find((t) => /^\d+% ·/.test(t)) ?? ''
    const numero = (t) => Number(String(t).replace(/\./g, ''))
    const abertas = /([\d.]+) aberta/.exec(placarTexto)
    return {
      nome,
      percentual: placarTexto ? Number(/^(\d+)%/.exec(placarTexto)[1]) : null,
      abertas: /tudo feito/.test(placarTexto) ? 0 : abertas ? numero(abertas[1]) : null,
      total: placarTexto ? numero(/([\d.]+) no total/.exec(placarTexto)?.[1]) : 0,
      link: li.querySelector('a')?.getAttribute('href') ?? null,
      pasta: [...li.querySelectorAll('span')].map((s) => s.textContent).find((t) => /pasta local/.test(t)) ?? null,
      etiquetas: [...li.querySelectorAll('span.rounded-sm')].map((s) => s.textContent),
    }
  }))
  const esperarPainel = async (page) => {
    await page.waitForFunction(() => /cartão\(ões\)/.test(document.querySelector('section[aria-label="Painel de repositórios"]')?.textContent ?? '')
      && !/lendo os detalhes/.test(document.querySelector('section[aria-label="Painel de repositórios"]').textContent), null, { timeout: 600_000 })
    await wait(4000)
  }
  const escolher = async (page, rotulo, texto) => {
    await page.locator(`[aria-label="${rotulo}"]`).first().click()
    await wait(400)
    const busca = page.locator('.felixo-select-search input')
    if (await busca.count()) await busca.first().fill(texto)
    await page.getByRole('option').filter({ hasText: texto }).first().click()
    await wait(600)
  }
  const comparar = (cartoes, esperado) => {
    const diferentes = []
    let conferidos = 0
    for (const cartao of cartoes) {
      const alvo = esperado.get(cartao.nome)
      if (!alvo) continue
      conferidos += 1
      if (alvo.total !== cartao.total || alvo.abertas !== cartao.abertas || alvo.percentual !== cartao.percentual) {
        diferentes.push({ nome: cartao.nome, app: [cartao.abertas, cartao.total, cartao.percentual], api: [alvo.abertas, alvo.total, alvo.percentual] })
      }
    }
    const faltando = [...esperado.keys()].filter((nome) => !cartoes.some((c) => c.nome === nome))
    return { cartoesNaTela: cartoes.length, cartoesNaApi: esperado.size, conferidos, diferentes, faltandoNaTela: faltando }
  }

  let restaurar = null
  try {
    let { page } = await abrir()
    registrar('0-app', { versao: await page.evaluate(() => window.felixo.devtools.mainEval('app.getVersion()')) })
    await page.evaluate(async (token) => {
      await window.felixo.notion.saveConnection({ label: 'Validação', token })
      await window.felixo.canvas.clear()
      await window.felixo.canvas.save({ id: 'painel-notion', type: 'notionTasks', position: { x: 80, y: 80 }, width: 1000, height: 640, data: { label: 'Tarefas Notion' } })
    }, TOKEN)
    // O app só registra pasta escolhida no diálogo nativo; o projeto do teste
    // (este repositório, para a marca "pasta local") entra no banco com o app fechado.
    registrar('0-app', { primeiroFechamentoSozinho: await fechar() })
    const banco = new (require('node:sqlite').DatabaseSync)(path.join(userData, 'database', 'felixo.sqlite'))
    const agora = new Date().toISOString()
    banco.prepare('INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('validacao-repo', 'Felixo-AI-Core', fs.realpathSync(path.resolve(APP, '..')), agora, agora)
    banco.close()
    ;({ page } = await abrir())
    await page.waitForSelector('[aria-label="Database Notion"]', { timeout: 180_000 })
    await escolher(page, 'Database Notion', nomeDaBase)
    await page.getByRole('tab', { name: 'Painel' }).click()
    await esperarPainel(page)
    const tarefas = await todasAsLinhas(fonte)
    const cartoes = await lerCartoes(page)
    await page.screenshot({ path: path.join(OUT, '1-painel.png') })
    const chaveRepo = (t) => t.properties['Repositório']?.select ? [t.properties['Repositório'].select.name] : ['Sem Repositório']
    const aviso = await page.evaluate(() => /tem mais linhas do que o Felixo carrega/.test(document.body.textContent))
    registrar('1-numeros', { database: nomeDaBase, tarefasNaApi: tarefas.length, avisoDeTabelaCortada: aviso, ...comparar(cartoes, placar(tarefas, chaveRepo)) })
    // O app para em 2.000 linhas (20 páginas de 100), na ordem padrão da API: confere a conta sobre as mesmas.
    registrar('1-numeros-mesmas-2000', comparar(cartoes, placar(tarefas.slice(0, 2000), chaveRepo)))

    // Links e etiquetas contra as linhas da database de detalhes.
    const detalhes = fonteDetalhes ? await todasAsLinhas(fonteDetalhes) : []
    const linksDaApi = new Set(detalhes.flatMap((l) => Object.values(l.properties).filter((p) => p.type === 'url' && p.url).map((p) => p.url)))
    const comLink = cartoes.filter((c) => c.link)
    registrar('2-links', { linhasDeDetalhes: detalhes.length, cartoesComLink: comLink.length, linksQueNaoExistemNaApi: comLink.filter((c) => !linksDaApi.has(c.link)).map((c) => c.nome),
      cartoesComEtiqueta: cartoes.filter((c) => c.etiquetas.length).length, amostra: comLink.slice(0, 2).map((c) => ({ nome: c.nome, link: c.link, etiquetas: c.etiquetas })) })
    registrar('3-pasta-local', { comPasta: cartoes.filter((c) => c.pasta?.startsWith('pasta local')).map((c) => `${c.nome}: ${c.pasta}`),
      semPasta: cartoes.filter((c) => c.pasta === 'sem pasta local').length, semMarca: cartoes.filter((c) => !c.pasta).map((c) => c.nome) })

    // Cartão → tabela filtrada → tirar o filtro → voltar ao Painel.
    const alvo = cartoes.find((c) => c.nome === 'Felixo-AI-Core') ?? cartoes.find((c) => c.total > 0)
    await page.getByRole('button', { name: `Abrir as tarefas de ${alvo.nome}`, exact: true }).click()
    await wait(2000)
    const seletor = page.locator('[aria-label="Repositório das tarefas"]').first()
    const filtrado = (await seletor.textContent())?.trim()
    const abaAposCartao = await page.locator('[role="tab"][aria-selected="true"]').first().textContent()
    await page.screenshot({ path: path.join(OUT, '4-tabela-filtrada.png') })
    await seletor.click()
    await wait(400)
    await page.getByRole('option').first().click()
    await wait(1000)
    const semFiltro = (await seletor.textContent())?.trim()
    await page.getByRole('tab', { name: 'Painel' }).click()
    await esperarPainel(page)
    registrar('4-navegacao', { cartao: alvo.nome, abaAposCartao, seletorFiltrado: filtrado, seletorSemFiltro: semFiltro, voltouAoPainel: (await lerCartoes(page)).length })

    // Agrupar por Projeto e voltar.
    await page.getByRole('button', { name: 'Configurar painel' }).click()
    await escolher(page, 'Agrupar cartões por', 'Projeto')
    await esperarPainel(page)
    const porProjeto = await lerCartoes(page)
    const titulos = new Map(detalhes.map((l) => [l.id, titulo(l)]))
    const esperadoProjeto = placar((await todasAsLinhas(fonte)).slice(0, aviso ? 2000 : undefined), (t) => {
      const ligadas = t.properties.Projeto?.relation ?? []
      return ligadas.length ? ligadas.map((r) => titulos.get(r.id) ?? `Página ligada ${r.id.replace(/-/g, '').slice(0, 8)}`) : ['Sem Projeto']
    })
    await page.screenshot({ path: path.join(OUT, '5-por-projeto.png') })
    registrar('5-por-projeto', comparar(porProjeto, esperadoProjeto))
    await escolher(page, 'Agrupar cartões por', 'Repositório')
    await page.getByRole('button', { name: 'Configurar painel' }).click()
    await esperarPainel(page)

    if (COM_RECARGA) {
      const cartao = (await lerCartoes(page)).find((c) => c.nome === alvo.nome)
      const linha = detalhes.find((l) => Object.values(l.properties).some((p) => p.type === 'url' && p.url === cartao.link))
      const [coluna, propriedade] = Object.entries(linha.properties).find(([, p]) => p.type === 'url' && p.url === cartao.link)
      const original = propriedade.url
      const mudado = `${original.replace(/\/$/, '')}/tree/main`
      restaurar = async () => {
        await notion('PATCH', `/v1/pages/${linha.id}`, { properties: { [coluna]: { url: original } } })
        const lido = (await notion('GET', `/v1/pages/${linha.id}`)).properties[coluna].url
        registrar('6-recarga', { restaurado: lido === original, linkAtual: lido })
      }
      await notion('PATCH', `/v1/pages/${linha.id}`, { properties: { [coluna]: { url: mudado } } })
      const t0 = Date.now()
      registrar('6-recarga', { linha: titulo(linha), coluna, linkOriginal: original, mudadoEm: hora() })
      let mudou = false
      while (!mudou && Date.now() - t0 < 16 * 60_000) {
        await wait(15_000)
        mudou = (await lerCartoes(page)).find((c) => c.nome === alvo.nome)?.link === mudado
      }
      await page.screenshot({ path: path.join(OUT, '6-recarga.png') })
      registrar('6-recarga', { cartaoMudouSozinho: mudou, minutos: Number(((Date.now() - t0) / 60_000).toFixed(1)) })
      await restaurar()
      restaurar = null
    }

    // Fechar e reabrir: o bloco volta na mesma database e no Painel.
    const fechouSozinho = await fechar()
    ;({ page } = await abrir())
    await page.waitForSelector('[aria-label="Database Notion"]', { timeout: 180_000 })
    await esperarPainel(page)
    await page.screenshot({ path: path.join(OUT, '7-reaberto.png') })
    registrar('7-reabrir', { fechouSozinho, database: (await page.locator('[aria-label="Database Notion"]').first().textContent())?.trim(),
      abaAtiva: (await page.locator('[role="tab"][aria-selected="true"]').first().textContent())?.trim(), cartoes: (await lerCartoes(page)).length })
  } catch (error) {
    registrar('erro', { mensagem: mascarar(error.stack ?? error).slice(0, 900) })
    await app?.page?.screenshot({ path: path.join(OUT, 'erro.png') }).catch(() => {})
    process.exitCode = 1
  } finally {
    if (restaurar) await restaurar().catch((e) => { registrar('6-recarga', { FALHA_AO_RESTAURAR: mascarar(e.message) }); process.exitCode = 1 })
    await fechar().catch(() => {})
    await wait(3000)
    // O perfil guarda o token cifrado: não pode sobrar.
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    registrar('9-fim', { errosDeConsole: [...new Set(errosDeConsole)], perfilApagado: !fs.existsSync(userData) })
    evidencia.fim = new Date().toISOString()
    fs.writeFileSync(path.join(OUT, 'evidencia.json'), mascarar(JSON.stringify(evidencia, null, 2)))
  }
}

main().catch((error) => {
  console.error('falhou:', mascarar(error.stack ?? error).slice(0, 900))
  process.exitCode = 1
})
