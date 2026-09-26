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
 *   e o processo relançado apagar o pedido de relançamento.
 * - `relancamento-perdido`: o perfil guarda um pedido de relançamento antigo
 *   (10 min, sem pid) que nenhum processo relançado assumiu (o que sobrava
 *   quando o relançamento falhava no AppImage); a abertura pelo `prime-run`
 *   precisa voltar para Automático, avisar e não relançar de novo.
 * - `relancamento-em-andamento`: o pedido de relançamento tem o pid de um
 *   processo vivo (o deste script) e passou do prazo curto, como quando a
 *   pessoa abre o app de novo enquanto o AppImage relançado ainda monta; a
 *   abertura precisa ficar no Automático sem mexer no pedido nem na escolha,
 *   sem aviso e sem relançar.
 * - `sugestao-cpu`: numa máquina com até 4 CPUs lógicas, a sugestão aparece
 *   sem ligar o modo; "Agora não" some e continua dispensada depois de
 *   recarregar; num perfil novo, "Ligar Modo Performance" liga o modo.
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
 * relançamento só falhava empacotado assim.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')

const ALL_SCENARIOS = [
  'auto',
  'integrada',
  'dedicada',
  'pendente',
  'gpu-desligada',
  'integrada-prime-run',
  'relancamento-perdido',
  'relancamento-em-andamento',
  'sugestao-cpu',
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
    return { command: options.appImage, args: [...sandbox, ...args] }
  }
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
    FELIXO_GRAPHICS_MODE: 'hardware',
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
      if (process.platform === 'win32') process.kill(pid)
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
    }))
    result.cenario = 'integrada-prime-run'
    result.falhas = []
    if (result.cdp.featureStatus.gpu_compositing !== 'enabled') result.falhas.push(`gpu_compositing=${result.cdp.featureStatus.gpu_compositing}`)
    if (result.app.applied !== 'integrada') result.falhas.push(`o app aplicou ${result.app.applied}`)
    // O processo relançado assume o pedido e o apaga; sobrando, a próxima abertura voltaria para Automático.
    if (result.arquivo?.pendingRelaunch !== null) result.falhas.push('o pedido de relançamento ficou no perfil')
    if (result.arquivo?.preference !== 'integrada' || result.arquivo?.fallback) result.falhas.push('a escolha não ficou na Integrada')
    if (!result.ambientesDosProcessos.includes('FELIXO_GPU_ENV_SANITIZED=1')) result.falhas.push('nenhum processo relançado com o ambiente limpo')
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
    else if (scenario === 'sugestao-cpu') result = await cpuSuggestionScenario(options)
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

module.exports = { ALL_SCENARIOS, parseArgs, processesUsingProfile, sameGpu }
