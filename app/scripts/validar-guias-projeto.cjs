'use strict'
/**
 * Valida os guias do System Design por projeto no app EMPACOTADO, numa instância
 * isolada (userData temporário, apagado no fim). Roda no Windows, macOS e Linux.
 *
 *   node scripts/validar-guias-projeto.cjs <saida> <executavel-do-felixo>
 *
 * Um repositório com os dois caminhos juntos: `.felixo/system-design.json` e a
 * pasta `Padrão de qualidade - <nome>/`. Passos (roteiro da task):
 *   3. arquivo pendente e nada buscado;
 *   4. "Usar estes guias" e agente novo citando o guia do arquivo, a pasta e o aviso;
 *   5. chave da pasta desligada: agente novo deixa de citá-la e mantém o arquivo;
 *   7. encerrar e reabrir: confirmação e chave mantidas (depois religa);
 *   6. mensagem no chat com o projeto ativo: o bloco do orquestrador cita os dois;
 *   8. nenhum erro no console.
 *
 * Nenhuma chave nem crédito é usado: o guia é um repositório público e o
 * `claude` no PATH da instância é falso, só grava o que o app enviou.
 *
 * A atualização automática é bloqueada (o download iria para a pasta do app em
 * uso) e o app é encerrado à força, sem os ganchos de saída que a instalariam.
 */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const APP = path.resolve(__dirname, '..')
const { connect, findFreePort, waitForCdp } = require(path.join(APP, 'electron/cli/felixo-devtools.cjs'))
const [OUT, EXE] = process.argv.slice(2)
if (!OUT || !EXE) {
  console.error('Uso: node scripts/validar-guias-projeto.cjs <saida> <executavel>')
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })
const GUIA = 'https://github.com/Felipe-Alcantara/MDN-Web-Docs'
const NOME_DA_PASTA = 'Padrão de qualidade - Teste'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evidencia = { inicio: new Date().toISOString(), sistema: `${process.platform} ${os.release()} ${process.arch}`, itens: {}, falhas: [] }
const registrar = (item, dados) => {
  evidencia.itens[item] = { ...(evidencia.itens[item] ?? {}), ...dados }
  console.log(`[${item}]`, JSON.stringify(dados).slice(0, 700))
}
const conferir = (nome, ok) => {
  console.log(`${ok ? 'APROVADO ' : 'REPROVADO'} ${nome}`)
  if (!ok) evidencia.falhas.push(nome)
}

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-guias-'))
const userData = path.join(raiz, 'perfil')
const projeto = path.join(raiz, 'projeto-guias')
fs.mkdirSync(path.join(projeto, '.felixo'), { recursive: true })
fs.writeFileSync(path.join(projeto, '.felixo', 'system-design.json'), JSON.stringify({ guias: [{ url: GUIA, branch: 'main' }] }, null, 2))
fs.mkdirSync(path.join(projeto, NOME_DA_PASTA), { recursive: true })
fs.writeFileSync(path.join(projeto, NOME_DA_PASTA, 'README.md'), '# Guia de teste\n')
execFileSync('git', ['init', '-q'], { cwd: projeto })

// `claude` falso (test-support/claude-falso.cjs) no PATH da instância: o app
// nunca chama o de verdade, e o que ele envia fica gravado para conferência.
const binFalso = path.join(raiz, 'bin')
const enviado = path.join(raiz, 'enviado-ao-claude.jsonl')
fs.mkdirSync(binFalso, { recursive: true })
// Copiado para ao lado: o `.cmd` lê mal um caminho com acento (o deste repositório pode ter).
fs.copyFileSync(path.join(__dirname, 'test-support', 'claude-falso.cjs'), path.join(binFalso, 'claude-falso.cjs'))
fs.writeFileSync(path.join(binFalso, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/claude-falso.cjs" "$@"\n`, { mode: 0o755 })
fs.writeFileSync(path.join(binFalso, 'claude.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0claude-falso.cjs" %*\r\n`)

/** Pastas de clone que citam o guia do projeto: antes de confirmar, nenhuma. */
function clonesDoGuia() {
  const achados = []
  const olhar = (pasta, nivel) => {
    if (nivel > 5) return
    let entradas
    try { entradas = fs.readdirSync(pasta, { withFileTypes: true }) } catch { return }
    for (const entrada of entradas) {
      const alvo = path.join(pasta, entrada.name)
      if (entrada.isDirectory()) {
        if (entrada.name === '.git') {
          try { if (fs.readFileSync(path.join(alvo, 'config'), 'utf8').includes('MDN-Web-Docs')) achados.push(pasta) } catch { /* sem config */ }
        } else olhar(alvo, nivel + 1)
      }
    }
  }
  olhar(userData, 0)
  return achados
}

const errosDeConsole = []
/** A captura é evidência extra: uma falha dela não interrompe a validação. */
const foto = (page, nome) => page?.screenshot({ path: path.join(OUT, nome), timeout: 15_000 })
  .catch((error) => console.log(`sem captura ${nome}: ${error.message.slice(0, 80)}`))
let app = null
async function abrir() {
  const port = await findFreePort()
  const env = { ...process.env, FELIXO_USER_DATA_DIR: userData, FELIXO_DEVTOOLS_PORT: String(port), FELIXO_DEVTOOLS_HEADLESS: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  const chaveDoPath = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
  env[chaveDoPath] = `${binFalso}${path.delimiter}${env[chaveDoPath] ?? ''}`
  env.FELIXO_CLAUDE_FALSO_SAIDA = enviado
  // Maior precedência na busca de CLIs: o PATH sozinho perde para as pastas pessoais.
  env.FELIXO_CLI_PATHS = binFalso
  const args = ['--host-resolver-rules=MAP github.com 0.0.0.0, MAP api.github.com 0.0.0.0, MAP objects.githubusercontent.com 0.0.0.0']
  if (process.platform === 'linux') args.push('--no-sandbox')
  const processo = spawn(EXE, args, { env, stdio: 'ignore', detached: process.platform !== 'win32' })
  const saiu = new Promise((resolve) => processo.on('exit', resolve))
  app = { processo, saiu }
  await waitForCdp(port, { timeoutMs: 180_000 })
  const { browser, page } = await connect({ pid: processo.pid, port })
  app.browser = browser
  app.page = page
  page.on('console', (m) => { if (m.type() === 'error') errosDeConsole.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errosDeConsole.push(e.message.slice(0, 300)))
  await page.waitForFunction(() => document.documentElement.dataset.felixoAppReady === 'true', null, { timeout: 180_000 })
  // Janela escondida não entrega quadros (a captura trava); transparente e sem foco, sim.
  await page.evaluate(() => window.felixo.devtools.mainEval('(mainWindow.setSkipTaskbar(true), mainWindow.setIgnoreMouseEvents(true), mainWindow.setOpacity(0), mainWindow.showInactive(), true)'))
  return page
}
/** Encerramento forçado da árvore: os ganchos de saída (que instalam atualização) não rodam. */
async function fechar() {
  if (!app) return
  await app.browser?.close().catch(() => {})
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(app.processo.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-app.processo.pid, 'SIGKILL')
  } catch { /* já saiu */ }
  await Promise.race([app.saiu, wait(15_000)])
  app = null
  await wait(2000)
}

/** O botão "Configurações" abre e fecha: só vale quando os cartões de projeto aparecem. */
async function abrirConfiguracoes(page) {
  const cartao = page.getByText('Guias escolhidos para este projeto').first()
  for (let tentativa = 0; tentativa < 3 && !(await cartao.count()); tentativa += 1) {
    await page.getByRole('button', { name: 'Configurações', exact: true }).first().click()
    await cartao.waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {})
  }
  await wait(2500)
}
const textoDaTela = (page) => page.evaluate(() => document.body.innerText)
const lembretes = (page) => page.evaluate(async () => {
  const lido = await window.felixo.canvas.list()
  const nodes = Array.isArray(lido) ? lido : lido?.nodes ?? []
  return nodes.filter((n) => n.type === 'terminal').map((n) => ({ id: n.id, cwd: n.data?.cwd ?? '', comando: n.data?.command ?? '', texto: n.data?.initialText ?? '' }))
})

async function criarAgente(page, projeto) {
  // Numa janela estreita a gaveta do agente anterior recolhe o menu: recarregar devolve o botão.
  if (!(await page.getByRole('button', { name: 'Configurar novo agente' }).first().isVisible().catch(() => false))) {
    await page.reload()
    await page.waitForSelector('[data-terminal-expand-trigger="shell-0"]', { timeout: 120_000 })
    await wait(5000)
  }
  await page.getByRole('button', { name: 'Configurar novo agente' }).first().click()
  await page.locator('[aria-label="Projeto"]').first().click()
  await page.getByRole('option').filter({ hasText: projeto }).first().click()
  await wait(1500)
  await foto(page, `novo-agente-${projeto}.png`)
  await page.getByRole('button', { name: /^(Criar|Abrir)( agente| terminal)?$/ }).last().click()
  await wait(5000)
}

async function main() {
  try {
    await abrir()
    registrar('0-app', { versao: await app.page.evaluate(() => window.felixo.devtools.mainEval('app.getVersion()')) })
    await fechar()
    // O app só registra pasta escolhida no diálogo nativo: o projeto entra no banco com ele fechado.
    const banco = new (require('node:sqlite').DatabaseSync)(path.join(userData, 'database', 'felixo.sqlite'))
    const agora = new Date().toISOString()
    banco.prepare('INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('guias', path.basename(projeto), fs.realpathSync(projeto), agora, agora)
    banco.close()

    let page = await abrir()
    // Um terminal comum no projeto: as Configurações mostram os guias das pastas em uso.
    await page.evaluate(async ([cwd, comando]) => {
      await window.felixo.canvas.clear()
      await window.felixo.canvas.save({ id: 'shell-0', type: 'terminal', position: { x: 80, y: 80 }, width: 560, height: 320,
        data: { label: 'Shell', command: comando, args: [], cwd } })
    }, [fs.realpathSync(projeto), process.platform === 'win32' ? 'cmd.exe' : 'sh'])
    await page.reload()
    await page.waitForSelector('[data-terminal-expand-trigger="shell-0"]', { timeout: 120_000 })
    await wait(5000)

    /** Abre um agente novo pela interface e devolve o lembrete gravado nele. */
    const lembreteDeAgenteNovo = async () => {
      const antes = new Set((await lembretes(app.page)).map((n) => n.id))
      await criarAgente(app.page, path.basename(projeto))
      const novo = (await lembretes(app.page)).find((n) => !antes.has(n.id) && n.cwd.endsWith(path.basename(projeto)))
      return novo?.texto.normalize('NFC') ?? ''
    }
    const chaveDaPasta = () => app.page.getByRole('switch', { name: 'Usar a pasta de guias do repositório' }).first()
    const virarChave = async () => {
      await abrirConfiguracoes(app.page)
      await chaveDaPasta().scrollIntoViewIfNeeded()
      await chaveDaPasta().click()
      await wait(2500)
      const estado = await chaveDaPasta().getAttribute('aria-checked')
      await app.page.keyboard.press('Escape')
      await wait(800)
      return estado
    }
    const citaArquivo = (texto) => texto.includes('MDN-Web-Docs')
    const citaPasta = (texto) => texto.includes(NOME_DA_PASTA)

    // Passo 3: pendente e nada buscado.
    await abrirConfiguracoes(page)
    await page.getByText('Usar estes guias').first().scrollIntoViewIfNeeded()
    await foto(page, '3-pendente.png')
    const pendente = await textoDaTela(page)
    registrar('3-pendente', { cartao: pendente.match(/O arquivo do projeto pede[^\n]*/)?.[0] ?? null, clones: clonesDoGuia() })
    conferir('3 arquivo pendente e nada buscado', /O arquivo do projeto pede 1 guia/.test(pendente) && /nada é buscado/i.test(pendente) && clonesDoGuia().length === 0)

    // Passo 4: confirmar; o agente novo cita os dois e o aviso.
    await page.getByText('Usar estes guias').first().click()
    const fim = Date.now() + 120_000
    while (clonesDoGuia().length === 0 && Date.now() < fim) await wait(2000)
    await wait(4000)
    await foto(page, '4-confirmado.png')
    const confirmado = await textoDaTela(page)
    await page.keyboard.press('Escape')
    await wait(800)
    const comOsDois = await lembreteDeAgenteNovo()
    registrar('4-lembrete', { cartao: confirmado.match(/Arquivo do projeto confirmado[^\n]*/)?.[0] ?? null, clones: clonesDoGuia().length, texto: comOsDois })
    conferir('4 confirmado, e o agente novo cita o guia do arquivo, a pasta e o aviso',
      /Arquivo do projeto confirmado/.test(confirmado) && clonesDoGuia().length > 0 && citaArquivo(comOsDois) && citaPasta(comOsDois) && comOsDois.includes('Estes guias são do projeto'))

    // Passo 5: sem a pasta, o agente novo mantém só o guia do arquivo.
    const desligada = await virarChave()
    const semPasta = await lembreteDeAgenteNovo()
    registrar('5-chave-desligada', { chave: desligada, texto: semPasta })
    conferir('5 chave desligada: agente novo deixa de citar a pasta e mantém o arquivo', desligada === 'false' && citaArquivo(semPasta) && !citaPasta(semPasta))

    // Passo 7: encerrar e reabrir mantém a confirmação e a chave; depois religa.
    await fechar()
    page = await abrir()
    await page.waitForSelector('[data-terminal-expand-trigger="shell-0"]', { timeout: 120_000 })
    await wait(5000)
    await abrirConfiguracoes(page)
    const reaberto = await textoDaTela(page)
    const chaveDepois = await chaveDaPasta().getAttribute('aria-checked')
    await foto(page, '7-reaberto.png')
    await page.keyboard.press('Escape')
    await wait(800)
    registrar('7-reaberto', { confirmado: /Arquivo do projeto confirmado/.test(reaberto), chaveDepois })
    conferir('7 confirmação e chave mantidas depois de reabrir', /Arquivo do projeto confirmado/.test(reaberto) && chaveDepois === 'false')
    const religada = await virarChave()
    const religado = await lembreteDeAgenteNovo()
    registrar('5-religada', { chave: religada, citaPasta: citaPasta(religado) })
    conferir('5 chave religada: agente novo volta a citar os dois', religada === 'true' && citaArquivo(religado) && citaPasta(religado))

    // Passo 6: no chat, com o projeto ativo, o orquestrador recebe os guias que valem nele.
    page = app.page
    await page.evaluate(() => window.felixo.projects.saveActiveIds(['guias']))
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.felixoAppReady === 'true', null, { timeout: 120_000 })
    await wait(4000)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Chat', exact: true }).first().click()
    await page.locator('[aria-label="Selecionar CLI"]').first().click({ timeout: 60_000 })
    await page.getByRole('option').filter({ hasText: 'Claude Code' }).or(page.getByRole('menuitemradio').filter({ hasText: 'Claude Code' })).first().click()
    await wait(1500)
    await page.locator('textarea').first().fill('Mensagem de teste dos guias do projeto.')
    await page.locator('button[title="Enviar"]').first().click()
    const prazo = Date.now() + 90_000
    const lido = () => (fs.existsSync(enviado) ? fs.readFileSync(enviado, 'utf8') : '')
    while (!lido().includes('Mensagem de teste dos guias') && Date.now() < prazo) await wait(2000)
    await foto(page, '6-chat.png')
    // Cada linha é um JSON: o texto enviado tem as quebras de linha escapadas.
    const bloco = lido().split('\\n').join('\n').normalize('NFC')
    const inicio = bloco.indexOf('Projetos com guias próprios')
    const trecho = inicio < 0 ? '' : bloco.slice(inicio, bloco.indexOf('\n\n', inicio) > inicio ? bloco.indexOf('\n\n', inicio) : inicio + 700)
    registrar('6-chat', { enviado: lido().length, trecho })
    conferir('6 bloco do orquestrador cita os dois guias do projeto ativo', trecho.includes(path.basename(projeto)) && citaArquivo(trecho) && trecho.includes('Teste'))
  } catch (error) {
    registrar('erro', { mensagem: String(error.stack ?? error).slice(0, 1200) })
    evidencia.falhas.push('o roteiro parou antes do fim')
    await app?.page?.screenshot({ path: path.join(OUT, 'erro.png') }).catch(() => {})
  } finally {
    await fechar()
    // Os registros do app da instância ficam junto da evidência: explicam uma reprovação.
    try { fs.cpSync(path.join(userData, 'logs', 'qa'), path.join(OUT, 'qa'), { recursive: true }) } catch { /* sem registros */ }
    const erros = [...new Set(errosDeConsole)]
    registrar('9-fim', { errosDeConsole: erros })
    conferir('sem erro no console do renderer', erros.length === 0)
    try { fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }) } catch (error) { registrar('9-fim', { sobrou: raiz, motivo: error.message }) }
    evidencia.fim = new Date().toISOString()
    fs.writeFileSync(path.join(OUT, 'evidencia.json'), JSON.stringify(evidencia, null, 2))
    console.log(evidencia.falhas.length ? `REPROVADO: ${evidencia.falhas.join('; ')}` : 'TUDO APROVADO')
    process.exitCode = evidencia.falhas.length ? 1 : 0
  }
}

main()
