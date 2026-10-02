#!/usr/bin/env node
'use strict'

/**
 * Confere no app real, pelo CDP, as opções que dependem do hardware: a
 * preferência de placa de vídeo escolhe a GPU certa, a volta automática para
 * Automático funciona, e a sugestão do Modo Performance em máquina com poucas
 * CPUs aparece, liga só quando a pessoa pede e lembra a dispensa.
 *
 * Sobe o app de verdade (`electron .` com o `dist` de produção, sem Vite) num
 * perfil temporário que sobrevive entre aberturas — a escolha só vale no
 * próximo início, então cada cenário abre o app, age e abre de novo. A GPU em
 * uso vem do CDP `SystemInfo.getInfo` (o mesmo que `ui-render-performance`
 * usa), não do que o app acha que aplicou.
 *
 * Cenários (`--scenarios`, separados por vírgula):
 * - `auto`, `integrada`, `dedicada`: 1ª abertura escolhe a placa pela tela de
 *   Configurações e salva; 2ª abertura lê a GPU em uso pelo CDP, o estado do
 *   app e o "Em uso agora" da tela, e confere que nenhuma abertura saudável
 *   recomendou o modo compatível.
 * - `pendente`: deixa no perfil um início com a dedicada que nunca terminou
 *   (o que um travamento deixa) e confere que a abertura volta para
 *   Automático antes de aplicar, com aviso na tela.
 * - `gpu-desligada`: aplica a dedicada, mas sobe com
 *   `--disable-gpu-compositing` (a GPU "sobe desligada") e confere a volta
 *   para Automático nesta sessão, com aviso.
 * - `integrada-prime-run`: Integrada com as variáveis que o `prime-run`
 *   exporta; o app precisa relançar com o ambiente limpo, subir na integrada
 *   e o processo relançado apagar o pedido de relançamento. No AppImage,
 *   confere também que o `PATH` do relançado não tem a montagem do processo
 *   que saiu e, com `--app-image-arg=--appimage-extract-and-run`, que o
 *   relançado rodou extraído.
 * - `relancamento-perdido`: o perfil guarda um pedido de relançamento antigo
 *   (10 min, sem pid) que nenhum processo relançado assumiu (o que sobrava
 *   quando o relançamento falhava no AppImage); a abertura pelo `prime-run`
 *   precisa voltar para Automático, avisar e não relançar de novo.
 * - `relancamento-em-andamento`: o pedido de relançamento tem o pid de um
 *   processo vivo (o deste script) e passou do prazo curto, como quando a
 *   pessoa abre o app de novo enquanto o AppImage relançado ainda monta; a
 *   abertura precisa ficar no Automático sem mexer no pedido nem na escolha,
 *   sem aviso e sem relançar.
 * - `escolha-salva-compativel`: Dedicada salva e o app no modo compatível
 *   (sem GPU, o app não lê as placas); a opção precisa aparecer com só
 *   Automático habilitado, explicar o motivo e deixar voltar para Automático.
 * - `sugestao-cpu`: numa máquina com até 4 CPUs lógicas, a sugestão aparece
 *   sem ligar o modo; "Agora não" some e continua dispensada depois de
 *   recarregar; num perfil novo, "Ligar Modo Performance" liga o modo.
 * - `pc-fraco`: PC fraco reproduzível. Com `--disable-gpu-compositing` (o
 *   Chromium recusa a composição por GPU, como faz com driver bloqueado) e o
 *   modo Automático, a 1ª abertura grava a recomendação, a 2ª mostra e aceita
 *   "Usar modo compatível", a 3ª abre em software pelo modo salvo no perfil e
 *   "GPU normal" volta ao caminho acelerado; cada abertura mede os pixels da
 *   janela (`screenStats`/`looksBlack`) para provar que não ficou preta.
 * - `gpu-caiu`: derruba o processo de GPU 3 vezes no meio da sessão e mede a
 *   janela depois de cada queda; registra o que o Chromium passou a usar e se
 *   o app gravou recomendação.
 *
 * Uso (a automação só usa a GPU com FELIXO_GRAPHICS_MODE=hardware, que este
 * script define):
 *   npx vite build
 *   npm run check:hardware -- --expect-integrada=0x8086 --expect-dedicada=0x10de
 * ou direto:
 *   node scripts/hardware-check.cjs --expect-integrada=0x8086 --expect-dedicada=0x10de --out=gpu.json
 * Sem `--expect-*`, só relata o que encontrou. `--screenshots=<pasta>` guarda
 * uma captura da tela em cada cenário, para revisar o visual.
 * `--app-image=<arquivo.AppImage>` roda os cenários no pacote AppImage (de
 * `electron-builder --linux AppImage`) em vez de `electron .`: o
 * relançamento só falhava empacotado assim. `--app-image-arg=<flag>` (pode
 * repetir) passa uma flag do runtime do AppImage antes das do app, por
 * exemplo `--app-image-arg=--appimage-extract-and-run` para rodar sem FUSE.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { execFileSync, spawn } = require('node:child_process')

const ALL_SCENARIOS = [
  'auto',
  'integrada',
  'dedicada',
  'pendente',
  'gpu-desligada',
  'integrada-prime-run',
  'relancamento-perdido',
  'relancamento-em-andamento',
  'escolha-salva-compativel',
  'sugestao-cpu',
  'pc-fraco',
  'gpu-caiu',
]
const OPTION_LABEL = { auto: 'Automático', integrada: 'Integrada', dedicada: 'Dedicada (experimental)' }
const PRIME_RUN_ENV = { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __VK_LAYER_NV_optimus: 'NVIDIA_only' }
const DEFAULT_TIMEOUT_MS = 60_000

function parseVendor(value, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name} deve ser um vendorId, ex.: 0x8086.`)
  return parsed
}

function parseArgs(argv) {
  const options = {
    appDir: path.resolve(__dirname, '..'),
    appImage: '',
    appImageArgs: [],
    scenarios: [...ALL_SCENARIOS],
    expectIntegrada: null,
    expectDedicada: null,
    out: '',
    screenshots: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
  for (const argument of argv) {
    const [key, ...rest] = argument.replace(/^--/, '').split('=')
    const value = rest.join('=')
    switch (key) {
      case 'scenarios': {
        const scenarios = value.split(',').map((item) => item.trim()).filter(Boolean)
        const unknown = scenarios.filter((item) => !ALL_SCENARIOS.includes(item))
        if (unknown.length || scenarios.length === 0) {
          throw new Error(`--scenarios aceita: ${ALL_SCENARIOS.join(', ')}.`)
        }
        options.scenarios = scenarios
        break
      }
      case 'expect-integrada':
        options.expectIntegrada = parseVendor(value, key)
        break
      case 'expect-dedicada':
        options.expectDedicada = parseVendor(value, key)
        break
      case 'out':
        options.out = path.resolve(value)
        break
      case 'screenshots':
        options.screenshots = path.resolve(value)
        break
      case 'app-dir':
        options.appDir = path.resolve(value)
        break
      case 'app-image':
        if (!value) throw new Error('--app-image precisa do caminho do .AppImage.')
        options.appImage = path.resolve(value)
        break
      case 'app-image-arg':
        if (!value.startsWith('--appimage-')) throw new Error('--app-image-arg aceita só flags do runtime do AppImage (--appimage-...).')
        options.appImageArgs.push(value)
        break
      default:
        throw new Error(`Argumento desconhecido: ${argument}`)
    }
  }
  return options
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForCdp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch {
      // Ainda subindo (ou relançando).
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`O CDP não abriu em ${timeoutMs} ms.`)
}

/**
 * Processos do app com este perfil, pelo ambiente. Cobre o relançamento: o
 * processo novo nasce do relauncher do Electron, fora do grupo do primeiro.
 */
function processesUsingProfile(profile) {
  if (process.platform !== 'linux') return []
  const marker = `FELIXO_USER_DATA_DIR=${profile}`
  const pids = []
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      if (fs.readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0').includes(marker)) pids.push(Number(entry))
    } catch {
      // Processo de outro usuário ou já encerrado.
    }
  }
  return pids
}

/**
 * O que executar: o `.AppImage` pedido em `--app-image` ou o Electron do
 * projeto sobre o `dist` de produção.
 */
function resolveLaunchCommand(options, args) {
  const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : []
  if (options.appImage) {
    if (!fs.existsSync(options.appImage)) throw new Error(`AppImage não encontrado: ${options.appImage}.`)
    // As flags do runtime vêm primeiro; ele as consome e não as passa ao app.
    return { command: options.appImage, args: [...options.appImageArgs, ...sandbox, ...args] }
  }
  if (options.appImageArgs.length > 0) throw new Error('--app-image-arg só vale com --app-image.')
  const indexPath = path.join(options.appDir, 'dist', 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Build do renderer ausente: ${indexPath}. Rode \`npx vite build\` em ${options.appDir}.`)
  }
  const electronBinary = require(require.resolve('electron', { paths: [options.appDir] }))
  return { command: electronBinary, args: ['.', ...sandbox, ...args] }
}

async function launchApp(options, profile, { env = {}, args = [] } = {}) {
  const launch = resolveLaunchCommand(options, args)
  const port = await freePort()
  const childEnv = { ...process.env, ...env }
  delete childEnv.VITE_DEV_SERVER_URL
  delete childEnv.ELECTRON_RUN_AS_NODE
  Object.assign(childEnv, {
    FELIXO_DEVTOOLS_PORT: String(port),
    FELIXO_USER_DATA_DIR: profile,
    FELIXO_DEVTOOLS_HEADLESS: '1',
    FELIXO_DEVTOOLS_MOCK_PTY: '1',
    // A automação só usa a GPU com pedido explícito; um cenário pode pedir o modo compatível.
    FELIXO_GRAPHICS_MODE: env.FELIXO_GRAPHICS_MODE ?? 'hardware',
  })
  const child = spawn(launch.command, launch.args, {
    cwd: options.appDir,
    env: childEnv,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  })
  await waitForCdp(port, options.timeoutMs)
  return { child, port, profile }
}

async function stopApp(app, browser) {
  await browser?.close().catch(() => {})
  const pids = new Set([app?.child?.pid, ...processesUsingProfile(app.profile)].filter(Boolean))
  for (const pid of pids) {
    try {
      // No Windows não há /proc para achar os filhos (GPU, renderer); a árvore
      // inteira sai pelo taskkill, senão eles seguram a pasta do perfil.
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(pid, 'SIGTERM')
    } catch {
      // Já saiu.
    }
  }
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && processesUsingProfile(app.profile).length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  for (const pid of processesUsingProfile(app.profile)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Já saiu.
    }
  }
}

async function connect(options, app) {
  const { chromium } = require(require.resolve('playwright-core', { paths: [options.appDir, __dirname] }))
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${app.port}`)
  const deadline = Date.now() + options.timeoutMs
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => /index\.html/.test(candidate.url()))
      if (page) {
        await page.waitForFunction(() => document.querySelector('[data-felixo-hydrated="true"]') !== null, null, {
          timeout: options.timeoutMs,
        })
        return { browser, page }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('A janela principal do app não apareceu.')
}

async function readCdpGpu(browser) {
  const session = await browser.newBrowserCDPSession()
  try {
    const info = await session.send('SystemInfo.getInfo')
    const devices = info.gpu?.devices ?? []
    // Sem o campo `active` no CDP, o Chromium põe a GPU em uso primeiro.
    const active = devices.find((device) => device.active) ?? devices[0] ?? null
    return {
      renderer: info.gpu?.auxAttributes?.glRenderer ?? null,
      glImplementation: info.gpu?.auxAttributes?.glImplementationParts ?? null,
      activeVendorId: active?.vendorId ?? null,
      activeDeviceId: active?.deviceId ?? null,
      featureStatus: {
        gpu_compositing: info.gpu?.featureStatus?.gpu_compositing ?? null,
        vulkan: info.gpu?.featureStatus?.vulkan ?? null,
      },
    }
  } finally {
    await session.detach().catch(() => {})
  }
}

function readPreferenceFile(profile) {
  try {
    return JSON.parse(fs.readFileSync(path.join(profile, 'gpu-preference.json'), 'utf8'))
  } catch {
    return null
  }
}

async function waitFor(check, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Tempo esgotado esperando ${description}.`)
}

async function appGpuStatus(page) {
  return page.evaluate(async () => (await window.felixo.graphics.getConfig()).config.gpu)
}

/** Abre Configurações e a opção avançada de placa de vídeo, pelo DOM. */
async function openGpuOption(page) {
  await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Configurações"]')
    if (!button) throw new Error('Botão Configurações não encontrado.')
    button.click()
  })
  await page.waitForFunction(() => [...document.querySelectorAll('summary')].some((node) => node.textContent.includes('placa de vídeo')))
  await page.evaluate(() => {
    const summary = [...document.querySelectorAll('summary')].find((node) => node.textContent.includes('placa de vídeo'))
    if (!summary.parentElement.open) summary.click()
    summary.scrollIntoView({ block: 'start' })
  })
  await page.waitForFunction(() => {
    const text = document.body.innerText
    return text.includes('Em uso agora:') && !text.includes('Em uso agora: lendo…')
  })
}

async function readInUseText(page) {
  return page.evaluate(() => {
    const line = [...document.querySelectorAll('p')].find((node) => node.textContent.startsWith('Em uso agora:'))
    return line ? line.textContent.replace('Em uso agora:', '').trim() : null
  })
}

async function chooseAndSave(page, preference) {
  await page.evaluate(() => document.querySelector('[role="combobox"][aria-label="Placa de vídeo"]').click())
  await page.waitForSelector('[role="option"]')
  await page.evaluate((label) => {
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.querySelector('.felixo-select-option-label')?.textContent === label,
    )
    if (!option) throw new Error(`Opção ${label} não encontrada.`)
    option.click()
  }, OPTION_LABEL[preference])
  const saved = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent.includes('Salvar placa de vídeo'))
    if (button.disabled) return false
    button.click()
    return true
  })
  if (saved) {
    await page.waitForFunction(() => document.body.innerText.includes('Placa de vídeo salva.'))
  }
}

async function visibleNotices(page) {
  return page.evaluate(() => {
    const text = document.body.innerText
    return {
      voltouParaAutomatico: text.includes('Placa de vídeo voltou para Automático'),
      avisos: [...document.querySelectorAll('[role="status"]')]
        .map((node) => node.textContent.trim())
        .filter((content) => content.includes('Automático')),
    }
  })
}

/**
 * O WebGL recebe o renderer sem a versão do driver (o Chromium tira isso por
 * privacidade: "OpenGL 4.6" em vez de "OpenGL 4.6 (Core Profile) Mesa ..."),
 * então a tela e o CDP são comparados por fornecedor e dispositivo, os dois
 * primeiros campos do "ANGLE (...)".
 */
function sameGpu(screenRenderer, cdpRenderer) {
  const head = (renderer) => (typeof renderer === 'string' ? renderer.split(', ').slice(0, 2).join(', ') : null)
  return head(screenRenderer) !== null && head(screenRenderer) === head(cdpRenderer)
}

/**
 * Captura pela ponte da instância de automação (`webContents.capturePage`),
 * que funciona com a janela oculta. Janela oculta não desenha quadros por
 * conta própria: a primeira captura acorda o compositor e pode trazer um
 * quadro velho, então a que vale é a segunda.
 */
async function capture(options, page, name) {
  if (!options.screenshots) return null
  fs.mkdirSync(options.screenshots, { recursive: true })
  await page.evaluate(() => window.felixo.devtools.capturePage())
  await page.waitForTimeout(1_000)
  const dataUrl = await page.evaluate(() => window.felixo.devtools.capturePage())
  const file = path.join(options.screenshots, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'))
  return file
}

function vendorHex(value) {
  return Number.isInteger(value) ? `0x${value.toString(16)}` : null
}

function expectVendor(result, expected, label) {
  if (expected === null) return
  if (result.cdp.activeVendorId !== expected) {
    result.falhas.push(`${label}: esperava vendor ${vendorHex(expected)}, o CDP mostrou ${vendorHex(result.cdp.activeVendorId)} (${result.cdp.renderer})`)
  }
}

async function withApp(options, profile, launch, body) {
  const app = await launchApp(options, profile, launch)
  let browser
  try {
    const connection = await connect(options, app)
    browser = connection.browser
    return await body(connection)
  } finally {
    await stopApp(app, browser)
  }
}

async function preferenceScenario(options, preference) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `felixo-hardware-check-${preference}-`))
  try {
    const before = await withApp(options, profile, {}, async ({ page }) => {
      await openGpuOption(page)
      await chooseAndSave(page, preference)
      return { arquivo: readPreferenceFile(profile), app: await appGpuStatus(page) }
    })
    const after = await withApp(options, profile, {}, async ({ browser, page }) => {
      if (preference !== 'auto') {
        await waitFor(() => readPreferenceFile(profile)?.pendingStart === null, options.timeoutMs, 'a confirmação da GPU')
      }
      const cdp = await readCdpGpu(browser)
      await openGpuOption(page)
      await capture(options, page, `placa-${preference}`)
      return {
        cdp,
        app: await appGpuStatus(page),
        recomendacaoModoCompativel: await page.evaluate(async () => (await window.felixo.graphics.getConfig()).config.recommendation),
        emUsoNaTela: await readInUseText(page),
        arquivo: readPreferenceFile(profile),
      }
    })
    const result = { cenario: preference, salvoNaPrimeiraAbertura: before.arquivo?.preference ?? 'auto', ...after, falhas: [] }
    if (result.salvoNaPrimeiraAbertura !== preference) result.falhas.push(`a tela salvou ${result.salvoNaPrimeiraAbertura}`)
    if (after.app.applied !== preference) result.falhas.push(`o app aplicou ${after.app.applied}`)
    if (!sameGpu(after.emUsoNaTela, after.cdp.renderer)) result.falhas.push('"Em uso agora" mostra outra GPU que o CDP')
    // Com a GPU saudável, nenhuma abertura pode recomendar o modo compatível.
    if (after.recomendacaoModoCompativel) result.falhas.push('recomendou o modo compatível com a GPU saudável')
    if (preference === 'dedicada') expectVendor(result, options.expectDedicada, preference)
    else expectVendor(result, options.expectIntegrada, preference)
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function pendingScenario(options) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-pendente-'))
  try {
    fs.writeFileSync(
      path.join(profile, 'gpu-preference.json'),
      `${JSON.stringify({ preference: 'dedicada', pendingStart: { preference: 'dedicada', startedAt: new Date().toISOString() }, fallback: null }, null, 2)}\n`,
    )
    const result = await withApp(options, profile, {}, async ({ browser, page }) => {
      const cdp = await readCdpGpu(browser)
      const arquivoAntesDeReconhecer = readPreferenceFile(profile)
      await page.waitForFunction(() => document.body.innerText.includes('Placa de vídeo voltou para Automático'))
      const avisos = await visibleNotices(page)
      await capture(options, page, 'placa-pendente-aviso')
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Entendi')
        button.click()
      })
      await waitFor(() => readPreferenceFile(profile)?.fallback === null, options.timeoutMs, 'o aviso reconhecido')
      return { cdp, arquivoAntesDeReconhecer, avisos, app: await appGpuStatus(page), arquivo: readPreferenceFile(profile) }
    })
    result.cenario = 'pendente'
    result.falhas = []
    if (result.arquivoAntesDeReconhecer.preference !== 'auto') result.falhas.push('a preferência não voltou para auto')
    if (result.arquivoAntesDeReconhecer.fallback?.reason !== 'previous-start-unfinished') result.falhas.push('sem aviso de início não terminado')
    if (result.app.applied !== 'auto') result.falhas.push(`o app aplicou ${result.app.applied}`)
    if (!result.avisos.voltouParaAutomatico) result.falhas.push('a tela não avisou')
    expectVendor(result, options.expectIntegrada, 'pendente')
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function disabledGpuScenario(options) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-desligada-'))
  try {
    fs.writeFileSync(path.join(profile, 'gpu-preference.json'), `${JSON.stringify({ preference: 'dedicada' })}\n`)
    const result = await withApp(options, profile, { args: ['--disable-gpu-compositing'] }, async ({ browser, page }) => {
      const arquivo = await waitFor(() => {
        const state = readPreferenceFile(profile)
        return state?.fallback ? state : null
      }, options.timeoutMs, 'a volta automática')
      await page.waitForFunction(() => document.body.innerText.includes('Placa de vídeo voltou para Automático'))
      await openGpuOption(page)
      await capture(options, page, 'placa-gpu-desligada-configuracoes')
      return { cdp: await readCdpGpu(browser), arquivo, avisos: await visibleNotices(page), app: await appGpuStatus(page) }
    })
    result.cenario = 'gpu-desligada'
    result.falhas = []
    if (result.arquivo.preference !== 'auto') result.falhas.push('a preferência não voltou para auto')
    if (result.arquivo.fallback.reason !== 'gpu-disabled') result.falhas.push(`motivo ${result.arquivo.fallback.reason}`)
    if (result.app.sessionOutcome !== 'reverted') result.falhas.push(`sessão ${result.app.sessionOutcome}`)
    if (!result.avisos.voltouParaAutomatico) result.falhas.push('a tela não avisou')
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

/**
 * As variáveis de GPU com que cada processo do app nasceu (`/proc/<pid>/environ`
 * é o ambiente do `exec`), sem repetir: mostra se houve relançamento limpo.
 */
function gpuEnvironmentsOfProcesses(profile) {
  const environments = processesUsingProfile(profile).map((pid) => {
    try {
      return fs
        .readFileSync(`/proc/${pid}/environ`, 'utf8')
        .split('\0')
        .filter((line) => /^(__NV|__GLX|__VK|FELIXO_GPU_ENV)/.test(line))
        .join(' ')
    } catch {
      return ''
    }
  })
  return [...new Set(environments)]
}

/** Diretório de montagem (`.mount_*`) ou de extração (`appimage_extracted_*`) de um caminho, ou `null`. */
function appImageRootOf(entry) {
  const match = /^(.*\/(?:\.mount_[^/]+|appimage_extracted_[^/]+))(?:\/|$)/.exec(entry)
  return match ? match[1] : null
}

/**
 * Como cada processo do app com este perfil nasceu no AppImage: de qual
 * montagem ou extração (`APPDIR`), se pediu a extração ao runtime e quantas
 * montagens diferentes aparecem no `PATH` (mais de uma = herdou a antiga).
 */
function appImageEnvironmentsOfProcesses(profile) {
  return processesUsingProfile(profile).flatMap((pid) => {
    try {
      const entries = Object.fromEntries(
        fs
          .readFileSync(`/proc/${pid}/environ`, 'utf8')
          .split('\0')
          .filter(Boolean)
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
      )
      if (!entries.APPDIR) return []
      const mountsInPath = [...new Set((entries.PATH ?? '').split(':').map(appImageRootOf).filter(Boolean))]
      return [{ pid, appDir: entries.APPDIR, extractAndRun: entries.APPIMAGE_EXTRACT_AND_RUN ?? null, mountsInPath }]
    } catch {
      return []
    }
  })
}

async function primeRunScenario(options) {
  if (process.platform !== 'linux') return { cenario: 'integrada-prime-run', pulado: 'só no Linux', falhas: [] }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-prime-run-'))
  try {
    fs.writeFileSync(path.join(profile, 'gpu-preference.json'), `${JSON.stringify({ preference: 'integrada' })}\n`)
    const result = await withApp(options, profile, { env: PRIME_RUN_ENV }, async ({ browser, page }) => ({
      cdp: await readCdpGpu(browser),
      app: await appGpuStatus(page),
      arquivo: readPreferenceFile(profile),
      ambientesDosProcessos: gpuEnvironmentsOfProcesses(profile),
      appImage: options.appImage ? appImageEnvironmentsOfProcesses(profile) : undefined,
    }))
    result.cenario = 'integrada-prime-run'
    result.falhas = []
    if (result.cdp.featureStatus.gpu_compositing !== 'enabled') result.falhas.push(`gpu_compositing=${result.cdp.featureStatus.gpu_compositing}`)
    if (result.app.applied !== 'integrada') result.falhas.push(`o app aplicou ${result.app.applied}`)
    // O processo relançado assume o pedido e o apaga; sobrando, a próxima abertura voltaria para Automático.
    if (result.arquivo?.pendingRelaunch !== null) result.falhas.push('o pedido de relançamento ficou no perfil')
    if (result.arquivo?.preference !== 'integrada' || result.arquivo?.fallback) result.falhas.push('a escolha não ficou na Integrada')
    if (!result.ambientesDosProcessos.includes('FELIXO_GPU_ENV_SANITIZED=1')) result.falhas.push('nenhum processo relançado com o ambiente limpo')
    if (result.appImage) {
      // O relançado não pode herdar no PATH a montagem do processo que saiu.
      if (result.appImage.some((entry) => entry.mountsInPath.length > 1)) result.falhas.push('o PATH do relançado tem a montagem antiga')
      const extracted = options.appImageArgs.includes('--appimage-extract-and-run')
      if (extracted && !result.appImage.some((entry) => entry.extractAndRun === '1' && /appimage_extracted_/.test(entry.appDir))) {
        result.falhas.push('o relançado não rodou extraído')
      }
    }
    expectVendor(result, options.expectIntegrada, 'integrada-prime-run')
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function lostRelaunchScenario(options) {
  if (process.platform !== 'linux') return { cenario: 'relancamento-perdido', pulado: 'só no Linux', falhas: [] }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-relancamento-'))
  try {
    // Antigo e sem pid: passou do prazo em que o relançado ainda podia nascer.
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString()
    fs.writeFileSync(
      path.join(profile, 'gpu-preference.json'),
      `${JSON.stringify({ preference: 'integrada', pendingStart: null, pendingRelaunch: { preference: 'integrada', startedAt }, fallback: null }, null, 2)}\n`,
    )
    const result = await withApp(options, profile, { env: PRIME_RUN_ENV }, async ({ browser, page }) => {
      const arquivoAntesDeReconhecer = readPreferenceFile(profile)
      await page.waitForFunction(() => document.body.innerText.includes('Placa de vídeo voltou para Automático'))
      await capture(options, page, 'placa-relancamento-perdido-aviso')
      return {
        cdp: await readCdpGpu(browser),
        app: await appGpuStatus(page),
        arquivoAntesDeReconhecer,
        avisos: await visibleNotices(page),
        ambientesDosProcessos: gpuEnvironmentsOfProcesses(profile),
      }
    })
    result.cenario = 'relancamento-perdido'
    result.falhas = []
    if (result.arquivoAntesDeReconhecer?.preference !== 'auto') result.falhas.push('a preferência não voltou para auto')
    if (result.arquivoAntesDeReconhecer?.fallback?.reason !== 'relaunch-failed') result.falhas.push('sem aviso de relançamento perdido')
    if (result.arquivoAntesDeReconhecer?.pendingRelaunch !== null) result.falhas.push('o pedido de relançamento ficou no perfil')
    if (result.app.applied !== 'auto') result.falhas.push(`o app aplicou ${result.app.applied}`)
    if (!result.avisos.voltouParaAutomatico) result.falhas.push('a tela não avisou')
    // Sem laço: esta abertura não relança de novo.
    if (result.ambientesDosProcessos.includes('FELIXO_GPU_ENV_SANITIZED=1')) result.falhas.push('relançou de novo')
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function relaunchInProgressScenario(options) {
  if (process.platform !== 'linux') return { cenario: 'relancamento-em-andamento', pulado: 'só no Linux', falhas: [] }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-em-andamento-'))
  try {
    // Passou do prazo curto, mas o pid (o deste script) está vivo.
    const seeded = {
      preference: 'integrada',
      pendingStart: null,
      pendingRelaunch: { preference: 'integrada', startedAt: new Date(Date.now() - 90_000).toISOString(), pid: process.pid },
      fallback: null,
    }
    fs.writeFileSync(path.join(profile, 'gpu-preference.json'), `${JSON.stringify(seeded, null, 2)}\n`)
    const result = await withApp(options, profile, { env: PRIME_RUN_ENV }, async ({ browser, page }) => {
      const app = await appGpuStatus(page)
      // Dá tempo para um aviso aparecer, se fosse aparecer.
      await page.waitForTimeout(2_000)
      await capture(options, page, 'placa-relancamento-em-andamento')
      return {
        cdp: await readCdpGpu(browser),
        app,
        arquivo: readPreferenceFile(profile),
        avisos: await visibleNotices(page),
        ambientesDosProcessos: gpuEnvironmentsOfProcesses(profile),
      }
    })
    result.cenario = 'relancamento-em-andamento'
    result.falhas = []
    if (JSON.stringify(result.arquivo) !== JSON.stringify(seeded)) result.falhas.push('a abertura mexeu no pedido ou na escolha')
    if (result.app.applied !== 'auto') result.falhas.push(`o app aplicou ${result.app.applied}`)
    if (result.app.notApplied !== 'relaunch-in-progress') result.falhas.push(`notApplied=${result.app.notApplied}`)
    if (result.avisos.voltouParaAutomatico) result.falhas.push('avisou volta para Automático')
    if (result.ambientesDosProcessos.includes('FELIXO_GPU_ENV_SANITIZED=1')) result.falhas.push('relançou de novo')
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function savedChoiceCompatibleScenario(options) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-salva-compativel-'))
  try {
    fs.writeFileSync(path.join(profile, 'gpu-preference.json'), `${JSON.stringify({ preference: 'dedicada' })}\n`)
    const result = await withApp(options, profile, { env: { FELIXO_GRAPHICS_MODE: 'software' } }, async ({ page }) => {
      await openGpuOption(page)
      const app = await appGpuStatus(page)
      const limite = await page.evaluate(() => document.body.innerText.includes('só dá para voltar para Automático'))
      // chooseAndSave abre o seletor, escolhe e salva; antes, lê as opções com ele aberto.
      await page.evaluate(() => document.querySelector('[role="combobox"][aria-label="Placa de vídeo"]').click())
      await page.waitForSelector('[role="option"]')
      const opcoes = await page.evaluate(() =>
        [...document.querySelectorAll('[role="option"]')].map((node) => ({
          rotulo: node.querySelector('.felixo-select-option-label')?.textContent ?? '',
          desligada: node.getAttribute('aria-disabled') === 'true',
        })),
      )
      await page.evaluate(() => document.querySelector('[role="combobox"][aria-label="Placa de vídeo"]').click())
      await page.waitForSelector('[role="option"]', { state: 'detached' })
      await chooseAndSave(page, 'auto')
      // Depois de salvar Automático o campo continua, com a confirmação.
      await capture(options, page, 'placa-escolha-salva-compativel')
      return { app, limite, opcoes, arquivo: readPreferenceFile(profile) }
    })
    result.cenario = 'escolha-salva-compativel'
    result.falhas = []
    if (result.app.notApplied !== 'software-rendering') result.falhas.push(`notApplied=${result.app.notApplied}`)
    if (!result.limite) result.falhas.push('a tela não explicou que só dá para voltar para Automático')
    const enabled = result.opcoes.filter((option) => !option.desligada).map((option) => option.rotulo)
    if (JSON.stringify(enabled) !== JSON.stringify(['Automático'])) result.falhas.push(`opções habilitadas: ${enabled.join(', ')}`)
    if (result.arquivo?.preference !== 'auto') result.falhas.push('não deu para voltar para Automático')
    return result
  } finally {
    fs.rmSync(profile, { recursive: true, force: true })
  }
}

async function clickButtonByText(page, text) {
  await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label)
    if (!button) throw new Error(`Botão ${label} não encontrado.`)
    button.click()
  }, text)
}

async function suggestionState(page) {
  return page.evaluate(() => ({
    sugestaoVisivel: document.body.innerText.includes('Ligar o Modo Performance?'),
    texto: [...document.querySelectorAll('[role="status"]')]
      .map((node) => node.textContent.trim())
      .find((content) => content.includes('Modo Performance')) ?? null,
    modoPerformance: document.documentElement.dataset.performanceMode ?? null,
  }))
}

async function cpuSuggestionScenario(options) {
  const cpus = os.availableParallelism?.() ?? os.cpus().length
  if (cpus > 4) return { cenario: 'sugestao-cpu', pulado: `máquina com ${cpus} CPUs lógicas (acima do limiar)`, falhas: [] }
  // Na automação a sugestão só aparece com pedido explícito.
  const launch = { env: { FELIXO_DEVTOOLS_HARDWARE_NOTICES: '1' } }
  const dismissProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-cpu-dispensa-'))
  const enableProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-cpu-liga-'))
  try {
    const dispensa = await withApp(options, dismissProfile, launch, async ({ page }) => {
      await page.waitForFunction(() => document.body.innerText.includes('Ligar o Modo Performance?'), null, { timeout: options.timeoutMs })
      const aoAbrir = await suggestionState(page)
      await capture(options, page, 'sugestao-cpu')
      await clickButtonByText(page, 'Agora não')
      await page.waitForFunction(() => !document.body.innerText.includes('Ligar o Modo Performance?'))
      const depoisDeDispensar = await suggestionState(page)
      await page.reload()
      await page.waitForFunction(() => document.querySelector('[data-felixo-hydrated="true"]') !== null, null, { timeout: options.timeoutMs })
      // Dá tempo para a sugestão aparecer, se fosse aparecer.
      await page.waitForTimeout(2_000)
      return { aoAbrir, depoisDeDispensar, depoisDeRecarregar: await suggestionState(page) }
    })
    const liga = await withApp(options, enableProfile, launch, async ({ page }) => {
      await page.waitForFunction(() => document.body.innerText.includes('Ligar o Modo Performance?'), null, { timeout: options.timeoutMs })
      await clickButtonByText(page, 'Ligar Modo Performance')
      await page.waitForFunction(() => document.documentElement.dataset.performanceMode === 'on')
      return suggestionState(page)
    })
    const result = { cenario: 'sugestao-cpu', cpusLogicas: cpus, dispensa, liga, falhas: [] }
    if (dispensa.aoAbrir.modoPerformance !== 'off') result.falhas.push('o modo ligou sem a pessoa pedir')
    if (!dispensa.aoAbrir.texto?.includes(`${cpus} processador`)) result.falhas.push('a sugestão não citou as CPUs desta máquina')
    if (dispensa.depoisDeDispensar.sugestaoVisivel || dispensa.depoisDeRecarregar.sugestaoVisivel) result.falhas.push('a dispensa não foi lembrada')
    if (dispensa.depoisDeRecarregar.modoPerformance !== 'off') result.falhas.push('"Agora não" ligou o modo')
    if (liga.modoPerformance !== 'on' || liga.sugestaoVisivel) result.falhas.push('"Ligar" não ligou o modo ou a sugestão ficou')
    return result
  } finally {
    fs.rmSync(dismissProfile, { recursive: true, force: true })
    fs.rmSync(enableProfile, { recursive: true, force: true })
  }
}

/** Apaga o perfil temporário; uma pasta ainda presa só avisa, para não esconder o erro do cenário. */
function removeProfile(profile) {
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch (error) {
    console.warn(`[hardware-check] não deu para apagar ${profile}: ${error.message}`)
  }
}

/**
 * Pixels da janela como o compositor entregou (`devtools:capture-page`),
 * contados na própria página: a fração quase preta e a fração clara (texto,
 * ícones, bordas). O tema é escuro, então "tela preta" não é "muito pixel
 * escuro", e sim nenhum pixel claro — o que a tela preta de driver produz.
 */
async function screenStats(page) {
  // A primeira captura de uma janela recém-pintada sai vazia (medido: 0,04 %
  // de pixels claros contra 0,7 % na seguinte); como em `capture`, descarta.
  await page.evaluate(() => window.felixo.devtools.capturePage())
  await page.waitForTimeout(500)
  return page.evaluate(async () => {
    const dataUrl = await window.felixo.devtools.capturePage()
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('captura ilegível'))
      image.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let black = 0
    let bright = 0
    const total = data.length / 4
    for (let index = 0; index < data.length; index += 4) {
      const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
      if (luminance <= 3) black += 1
      if (luminance >= 96) bright += 1
    }
    return {
      largura: canvas.width,
      altura: canvas.height,
      fracaoPreta: Number((black / total).toFixed(4)),
      fracaoClara: Number((bright / total).toFixed(4)),
    }
  })
}

/** Tela preta: nenhum pixel claro (menos de 0,2 %) numa captura de tamanho válido. */
function looksBlack(stats) {
  return !stats || stats.largura === 0 || stats.fracaoClara < 0.002
}

async function readGraphicsConfig(page) {
  return page.evaluate(async () => (await window.felixo.graphics.getConfig()).config)
}

function readJson(profile, name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(profile, name), 'utf8'))
  } catch {
    return null
  }
}

async function openRenderingSection(page) {
  await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Configurações"]')
    if (!button) throw new Error('Botão Configurações não encontrado.')
    button.click()
  })
  await page.waitForFunction(() => document.body.innerText.includes('Renderização e recuperação'))
  await page.evaluate(() => {
    const title = [...document.querySelectorAll('div')].find((node) => node.textContent.trim() === 'Renderização e recuperação')
    title?.scrollIntoView({ block: 'start' })
  })
}

async function chooseGraphicsMode(page, label) {
  await page.evaluate(() => document.querySelector('[role="combobox"][aria-label="Modo gráfico"]').click())
  await page.waitForSelector('[role="option"]')
  await page.evaluate((wanted) => {
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.querySelector('.felixo-select-option-label')?.textContent === wanted,
    )
    if (!option) throw new Error(`Opção ${wanted} não encontrada.`)
    option.click()
  }, label)
  await clickButtonByText(page, 'Salvar modo gráfico')
}

/**
 * PC fraco reproduzível: o Chromium recusa a composição por GPU
 * (`--disable-gpu-compositing`, o mesmo efeito de um driver na lista de
 * bloqueio) com o modo Automático. Percorre o caminho inteiro da pessoa:
 * a 1ª abertura detecta e grava a recomendação; a 2ª mostra a recomendação
 * em Configurações e aceita "Usar modo compatível"; a 3ª abre em software
 * (conferido pelo app e pela captura); por fim "GPU normal" volta ao caminho
 * acelerado, provando que o seletor alterna os dois. Cada abertura mede os
 * pixels da janela.
 */
async function weakPcScenario(options) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-pc-fraco-'))
  // Na automação (porta CDP), o Automático é software salvo pedido explícito de
  // hardware, e esse pedido vence o modo salvo (`shouldUseSoftwareRendering`).
  // Detecção e aceite pedem hardware para a GPU estar ligada e ser recusada; a
  // 3ª abertura vai sem a variável, para valer o modo salvo no perfil.
  const weak = { env: { FELIXO_GRAPHICS_MODE: 'hardware' }, args: ['--disable-gpu-compositing'] }
  const savedMode = { env: { FELIXO_GRAPHICS_MODE: '' }, args: ['--disable-gpu-compositing'] }
  try {
    const deteccao = await withApp(options, profile, weak, async ({ browser, page }) => {
      const recomendacao = await waitFor(() => readJson(profile, 'graphics-recommendation.json'), options.timeoutMs, 'a recomendação gravada')
      const tela = await screenStats(page)
      // A captura logo depois da recomendação pode pegar a primeira pintura;
      // a segunda, 5 s depois, diz se a janela ficou assim (o sintoma) ou não.
      await page.waitForTimeout(5_000)
      await capture(options, page, 'pc-fraco-deteccao')
      return { recomendacao, config: await readGraphicsConfig(page), cdp: await readCdpGpu(browser), tela, telaDepois: await screenStats(page) }
    })
    const aceite = await withApp(options, profile, weak, async ({ page }) => {
      await openRenderingSection(page)
      const recomendacaoVisivel = await page.evaluate(() => document.body.innerText.includes('Modo compatível recomendado'))
      await capture(options, page, 'pc-fraco-recomendacao')
      if (recomendacaoVisivel) await clickButtonByText(page, 'Usar modo compatível')
      const modoSalvo = await waitFor(() => readJson(profile, 'graphics-mode.json')?.mode === 'software' && 'software', 15_000, 'o modo compatível salvo').catch(() => null)
      return { recomendacaoVisivel, modoSalvo }
    })
    const compativel = await withApp(options, profile, savedMode, async ({ browser, page }) => {
      await openRenderingSection(page)
      const texto = await page.evaluate(() => document.body.innerText.includes('Esta abertura está usando rasterização por software.'))
      await capture(options, page, 'pc-fraco-modo-compativel')
      const result = { config: await readGraphicsConfig(page), cdp: await readCdpGpu(browser), tela: await screenStats(page), texto }
      await chooseGraphicsMode(page, 'GPU normal')
      result.modoDepoisDeVoltar = await waitFor(() => readJson(profile, 'graphics-mode.json')?.mode === 'hardware' && 'hardware', 15_000, 'GPU normal salva').catch(() => null)
      return result
    })
    // Sem o switch: a máquina "boa". Na automação a GPU só liga com pedido
    // explícito; que "GPU normal" foi salvo é conferido no arquivo, acima.
    const normal = await withApp(options, profile, {}, async ({ browser, page }) => ({
      config: await readGraphicsConfig(page),
      cdp: await readCdpGpu(browser),
      tela: await screenStats(page),
    }))
    const result = { cenario: 'pc-fraco', deteccao, aceite, compativel, normal, falhas: [] }
    result.cdp = compativel.cdp
    if (!deteccao.recomendacao?.disabledFeatures?.length) result.falhas.push('a 1ª abertura não gravou a recomendação')
    if (deteccao.config.softwareRenderingActive) result.falhas.push('a 1ª abertura já estava em software (a simulação não exercitou o Automático)')
    if (!aceite.recomendacaoVisivel) result.falhas.push('a recomendação não apareceu em Configurações na 2ª abertura')
    if (aceite.modoSalvo !== 'software') result.falhas.push('"Usar modo compatível" não salvou o modo software')
    if (!compativel.config.softwareRenderingActive || !compativel.texto) result.falhas.push('a 3ª abertura não ficou em rasterização por software')
    if (looksBlack(compativel.tela)) result.falhas.push(`a janela ficou preta no modo compatível: ${JSON.stringify(compativel.tela)}`)
    if (compativel.modoDepoisDeVoltar !== 'hardware') result.falhas.push('"GPU normal" não foi salvo')
    if (normal.config.softwareRenderingActive) result.falhas.push('com GPU normal salva, a abertura seguiu em software')
    if (looksBlack(normal.tela)) result.falhas.push(`a janela ficou preta com GPU normal: ${JSON.stringify(normal.tela)}`)
    return result
  } finally {
    removeProfile(profile)
  }
}

/** PIDs do processo de GPU vistos pelo navegador (`SystemInfo.getProcessInfo`, que o chama de "GPU"). */
async function gpuProcessIds(browser) {
  const session = await browser.newBrowserCDPSession()
  try {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo')
    return processInfo.filter((item) => String(item.type).toLowerCase() === 'gpu').map((item) => item.id)
  } finally {
    await session.detach().catch(() => {})
  }
}

/**
 * A GPU cai no meio da sessão (o que um driver instável faz): mata o processo
 * de GPU até 3 vezes e, depois de cada queda, mede se a janela continua
 * desenhando, o que o Chromium passou a usar e se o app gravou recomendação.
 * Registra o comportamento real; só reprova se a janela ficar preta.
 */
async function gpuCrashScenario(options) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-hardware-check-gpu-caiu-'))
  try {
    const result = await withApp(options, profile, {}, async ({ browser, page }) => {
      const antes = { cdp: await readCdpGpu(browser), tela: await screenStats(page), gpu: await gpuProcessIds(browser) }
      const quedas = []
      for (let queda = 1; queda <= 3; queda += 1) {
        const pids = await gpuProcessIds(browser)
        if (pids.length === 0) {
          quedas.push({ queda, semProcessoDeGpu: true })
          break
        }
        for (const pid of pids) {
          try {
            process.kill(pid)
          } catch {
            // Já saiu.
          }
        }
        await page.waitForTimeout(4_000)
        quedas.push({
          queda,
          mortos: pids,
          novos: await gpuProcessIds(browser),
          cdp: await readCdpGpu(browser),
          tela: await screenStats(page).catch((error) => ({ erro: error.message })),
          vivo: await page.evaluate(() => document.querySelector('[data-felixo-hydrated="true"]') !== null).catch(() => false),
        })
      }
      await capture(options, page, 'gpu-caiu-depois')
      return { antes, quedas, recomendacao: readJson(profile, 'graphics-recommendation.json') }
    })
    result.cenario = 'gpu-caiu'
    result.cdp = result.quedas.at(-1)?.cdp ?? result.antes.cdp
    result.falhas = []
    if (!result.quedas.some((queda) => queda.mortos?.length)) {
      result.falhas.push('a simulação não achou o processo de GPU para derrubar (cenário sem efeito)')
    }
    for (const queda of result.quedas) {
      if (queda.mortos && (!queda.vivo || looksBlack(queda.tela))) {
        result.falhas.push(`depois da queda ${queda.queda} a janela ficou preta ou parou: ${JSON.stringify(queda.tela)}`)
      }
    }
    return result
  } finally {
    removeProfile(profile)
  }
}

async function run(options) {
  const results = []
  for (const scenario of options.scenarios) {
    console.log(`[hardware-check] cenário ${scenario}…`)
    let result
    if (scenario === 'pendente') result = await pendingScenario(options)
    else if (scenario === 'gpu-desligada') result = await disabledGpuScenario(options)
    else if (scenario === 'integrada-prime-run') result = await primeRunScenario(options)
    else if (scenario === 'relancamento-perdido') result = await lostRelaunchScenario(options)
    else if (scenario === 'relancamento-em-andamento') result = await relaunchInProgressScenario(options)
    else if (scenario === 'escolha-salva-compativel') result = await savedChoiceCompatibleScenario(options)
    else if (scenario === 'sugestao-cpu') result = await cpuSuggestionScenario(options)
    else if (scenario === 'pc-fraco') result = await weakPcScenario(options)
    else if (scenario === 'gpu-caiu') result = await gpuCrashScenario(options)
    else result = await preferenceScenario(options, scenario)
    results.push(result)
    console.log(
      `[hardware-check] ${scenario}: ${result.cdp?.renderer ?? result.pulado ?? (result.cpusLogicas ? `${result.cpusLogicas} CPUs lógicas` : '?')} ` +
        `(vendor ${vendorHex(result.cdp?.activeVendorId) ?? '-'}) ${result.falhas.length ? `FALHOU: ${result.falhas.join('; ')}` : 'ok'}`,
    )
  }
  const report = {
    geradoEm: new Date().toISOString(),
    plataforma: `${process.platform}-${process.arch}`,
    pacote: options.appImage ? `AppImage ${path.basename(options.appImage)}` : 'electron . (dist)',
    resultados: results,
  }
  if (options.appImageArgs.length > 0) report.flagsDoRuntime = options.appImageArgs
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true })
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`)
  }
  if (results.some((result) => result.falhas.length > 0)) process.exitCode = 1
  return report
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`[hardware-check] ${error instanceof Error ? error.stack || error.message : String(error)}`)
    process.exitCode = 1
  })
}

module.exports = { ALL_SCENARIOS, appImageRootOf, looksBlack, parseArgs, processesUsingProfile, resolveLaunchCommand, sameGpu }
