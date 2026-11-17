'use strict'

/**
 * Valida no Linux, com os instaladores que o electron-builder gera (`.deb` e
 * AppImage), o que a task "validar no Linux a instância única, o .desktop e o
 * launcher" pedia a uma máquina física:
 *
 * 1. `.desktop` do `.deb` e do AppImage: cada MimeType aparece uma vez só.
 * 2. Duas aberturas: a segunda sai com código 0 e fica um processo principal só.
 * 3. Relançamento de GPU do AppImage (preferência Integrada + ambiente do
 *    `prime-run`): o processo novo nasce, fica com a trava de instância única,
 *    sobe com o ambiente limpo e apaga o pedido de relançamento.
 *
 * Roda sob `xvfb-run`, com `XDG_CONFIG_HOME` isolado (a pasta de dados vira uma
 * pasta temporária). Uso:
 *   xvfb-run -a node scripts/linux-instalado-e2e.cjs --release-dir release --out <pasta> [--extract-and-run]
 *
 * `--extract-and-run` abre o AppImage com `--appimage-extract-and-run` (sem FUSE),
 * o caminho em que o relançamento põe `APPIMAGE_EXTRACT_AND_RUN` no processo novo.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const GPU_ENV_SANITIZED_FLAG = 'FELIXO_GPU_ENV_SANITIZED'
const EXTRACT_AND_RUN_ADDED_FLAG = 'FELIXO_APPIMAGE_EXTRACT_AND_RUN_ADDED'
const MONTAGEM_DO_APPIMAGE = /\/(?:\.mount_[^/]+|appimage_extracted_[^/]+)\//

/** Os tipos da linha `MimeType` de um `.desktop`, e os que aparecem mais de uma vez. */
function analisarDesktop(texto) {
  const linhas = String(texto).split(/\r?\n/).filter((linha) => linha.startsWith('MimeType='))
  const tipos = linhas.flatMap((linha) => linha.slice('MimeType='.length).split(';').filter(Boolean))
  const repetidos = tipos.filter((tipo, indice) => tipos.indexOf(tipo) !== indice)
  return { linhas: linhas.length, tipos, repetidos: [...new Set(repetidos)] }
}

function lerArgv(pid, procRoot) {
  try {
    return fs.readFileSync(path.join(procRoot, String(pid), 'cmdline'), 'utf8').split('\0').filter(Boolean)
  } catch {
    return null
  }
}

/**
 * Processos principais do app (não os filhos do Chromium, que levam `--type=`),
 * achados pelo executável dentro da montagem ou da extração do AppImage.
 */
function listarProcessosPrincipais(procRoot = '/proc') {
  const principais = []
  for (const nome of fs.readdirSync(procRoot)) {
    if (!/^\d+$/.test(nome)) continue
    const argv = lerArgv(nome, procRoot)
    if (!argv) continue
    const base = path.basename(argv[0])
    const doApp = MONTAGEM_DO_APPIMAGE.test(argv[0]) || base === 'felixo-ai-core'
    if (!doApp || base === 'AppRun' || /crashpad/.test(base)) continue
    if (argv.some((arg) => arg.startsWith('--type='))) continue
    principais.push({ pid: Number(nome), argv })
  }
  return principais
}

function lerAmbiente(pid, procRoot = '/proc') {
  const texto = fs.readFileSync(path.join(procRoot, String(pid), 'environ'), 'utf8')
  return new Map(texto.split('\0').filter(Boolean).map((entrada) => {
    const corte = entrada.indexOf('=')
    return [entrada.slice(0, corte), entrada.slice(corte + 1)]
  }))
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function esperar(descricao, condicao, { timeoutMs = 60000, passoMs = 250 } = {}) {
  const limite = Date.now() + timeoutMs
  for (;;) {
    const resultado = await condicao()
    if (resultado) return resultado
    if (Date.now() > limite) throw new Error(`Tempo esgotado esperando: ${descricao}.`)
    await dormir(passoMs)
  }
}

function argumento(nome) {
  const indice = process.argv.indexOf(nome)
  return indice >= 0 ? process.argv[indice + 1] : undefined
}

function achar(releaseDir, extensao) {
  const arquivos = fs.readdirSync(releaseDir).filter((nome) => nome.toLowerCase().endsWith(extensao))
  // O runner x64 gera o AppImage x64 e (se pedido) o arm64: pega o da arquitetura da máquina.
  const arquitetura = process.arch === 'arm64' ? 'arm64' : 'x64'
  const escolhido = arquivos.find((nome) => nome.includes(arquitetura)) ?? arquivos[0]
  if (!escolhido) throw new Error(`Nenhum ${extensao} em ${releaseDir}.`)
  return path.join(releaseDir, escolhido)
}

function conferirDesktop(rotulo, texto, esperados, relatorio) {
  const { linhas, tipos, repetidos } = analisarDesktop(texto)
  const ok = linhas === 1 && repetidos.length === 0 && esperados.every((tipo) => tipos.includes(tipo)) && tipos.length === esperados.length
  relatorio.push({ passo: `.desktop do ${rotulo}`, ok, detalhe: { linhas, tipos, repetidos } })
}

function verificarDesktops({ releaseDir, work, esperados, relatorio }) {
  const deb = achar(releaseDir, '.deb')
  const debDir = path.join(work, 'deb')
  fs.mkdirSync(debDir, { recursive: true })
  const extraido = spawnSync('dpkg-deb', ['-x', deb, debDir], { encoding: 'utf8' })
  if (extraido.status !== 0) throw new Error(`dpkg-deb falhou: ${extraido.stderr}`)
  const aplicativos = path.join(debDir, 'usr', 'share', 'applications')
  const desktopDoDeb = fs.readdirSync(aplicativos).find((nome) => nome.endsWith('.desktop'))
  conferirDesktop('.deb', fs.readFileSync(path.join(aplicativos, desktopDoDeb), 'utf8'), esperados, relatorio)

  const appImage = achar(releaseDir, '.appimage')
  const appImageDir = path.join(work, 'appimage')
  fs.mkdirSync(appImageDir, { recursive: true })
  const extracao = spawnSync(path.resolve(appImage), ['--appimage-extract', '*.desktop'], { cwd: appImageDir, encoding: 'utf8' })
  if (extracao.status !== 0) throw new Error(`--appimage-extract falhou: ${extracao.stderr}`)
  const desktopDoAppImage = fs.readdirSync(path.join(appImageDir, 'squashfs-root')).find((nome) => nome.endsWith('.desktop'))
  conferirDesktop('AppImage', fs.readFileSync(path.join(appImageDir, 'squashfs-root', desktopDoAppImage), 'utf8'), esperados, relatorio)
}

/** Abre o AppImage como uma pessoa abriria; devolve o filho e uma promessa do código de saída. */
function abrir({ appImage, env, argsExtras, log }) {
  const saida = fs.openSync(log, 'a')
  const filho = spawn(path.resolve(appImage), [...argsExtras, '--no-sandbox'], {
    env, stdio: ['ignore', saida, saida], detached: true,
  })
  const terminou = new Promise((resolve) => filho.once('exit', (codigo, sinal) => resolve({ codigo, sinal })))
  return { filho, terminou }
}

async function encerrarTudo() {
  for (const { pid } of listarProcessosPrincipais()) {
    try { process.kill(pid, 'SIGTERM') } catch { /* já saiu */ }
  }
  await esperar('o app fechar', () => listarProcessosPrincipais().length === 0, { timeoutMs: 30000 }).catch(() => {
    for (const { pid } of listarProcessosPrincipais()) {
      try { process.kill(pid, 'SIGKILL') } catch { /* já saiu */ }
    }
  })
  await dormir(1000)
}

async function verificarAppImage({ releaseDir, work, extractAndRun, relatorio }) {
  const appImage = achar(releaseDir, '.appimage')
  const config = path.join(work, 'config')
  fs.mkdirSync(config, { recursive: true })
  const baseEnv = { ...process.env, XDG_CONFIG_HOME: config, FELIXO_DISABLE_AUTO_UPDATE: '1' }
  for (const chave of ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD', 'APPIMAGE_EXTRACT_AND_RUN']) delete baseEnv[chave]
  const argsExtras = extractAndRun ? ['--appimage-extract-and-run'] : []
  const log = path.join(work, 'app.log')

  if (listarProcessosPrincipais().length !== 0) throw new Error('Já havia um Felixo aberto nesta máquina; o teste precisa de uma máquina limpa.')

  // 1. Primeira abertura: o app sobe e cria a trava na pasta de dados.
  abrir({ appImage, env: baseEnv, argsExtras, log })
  const userData = await esperar('a trava SingletonLock na pasta de dados', () => {
    const pastas = fs.readdirSync(config, { withFileTypes: true }).filter((entrada) => entrada.isDirectory())
    return pastas.map((pasta) => path.join(config, pasta.name)).find((pasta) => {
      try { fs.lstatSync(path.join(pasta, 'SingletonLock')); return true } catch { return false }
    })
  }, { timeoutMs: 90000 })
  await esperar('um processo principal', () => listarProcessosPrincipais().length === 1, { timeoutMs: 30000 })

  // 2. Segunda abertura: sai com 0 e continua um processo principal só.
  const inicio = Date.now()
  const segunda = abrir({ appImage, env: baseEnv, argsExtras, log })
  const saidaDaSegunda = await Promise.race([segunda.terminou, dormir(30000).then(() => null)])
  await dormir(3000)
  const aposSegunda = listarProcessosPrincipais()
  relatorio.push({
    passo: 'segunda abertura sai e fica um processo principal',
    ok: saidaDaSegunda?.codigo === 0 && aposSegunda.length === 1,
    detalhe: { saida: saidaDaSegunda, ms: Date.now() - inicio, principais: aposSegunda.map((p) => p.pid) },
  })
  await encerrarTudo()

  // 3. Relançamento de GPU: Integrada + variáveis do prime-run.
  const arquivoGpu = path.join(userData, 'gpu-preference.json')
  fs.writeFileSync(arquivoGpu, `${JSON.stringify({ preference: 'integrada', pendingStart: null, pendingRelaunch: null, fallback: null })}\n`)
  const lancada = abrir({ appImage, env: { ...baseEnv, DRI_PRIME: '1', __NV_PRIME_RENDER_OFFLOAD: '1' }, argsExtras, log })
  const saidaDaLancada = await Promise.race([lancada.terminou, dormir(60000).then(() => null)])
  const relancado = await esperar('o processo relançado', () => listarProcessosPrincipais().find((p) => p.pid !== lancada.filho.pid), { timeoutMs: 60000 }).catch(() => null)
  await dormir(8000)
  const vivos = listarProcessosPrincipais()
  const estado = JSON.parse(fs.readFileSync(arquivoGpu, 'utf8'))
  const ambiente = relancado && vivos.some((p) => p.pid === relancado.pid) ? lerAmbiente(relancado.pid) : null
  const detalhe = {
    saidaDaLancada,
    relancadoPid: relancado?.pid ?? null,
    principaisDepois: vivos.map((p) => p.pid),
    estado,
    ambienteLimpo: ambiente ? { semDriPrime: !ambiente.has('DRI_PRIME'), semNvOffload: !ambiente.has('__NV_PRIME_RENDER_OFFLOAD'), marca: ambiente.get(GPU_ENV_SANITIZED_FLAG) ?? null } : null,
  }
  relatorio.push({
    passo: 'relançamento de GPU: o processo novo nasce, fica sozinho e apaga o pedido',
    ok: saidaDaLancada?.codigo === 0
      && vivos.length === 1
      && estado.pendingRelaunch === null && estado.preference === 'integrada' && estado.fallback === null
      && detalhe.ambienteLimpo?.semDriPrime && detalhe.ambienteLimpo?.semNvOffload && detalhe.ambienteLimpo?.marca === '1',
    detalhe,
  })
  if (extractAndRun && ambiente) {
    relatorio.push({
      passo: 'relançamento sem FUSE: o processo novo recebe APPIMAGE_EXTRACT_AND_RUN com a marca',
      ok: ambiente.get('APPIMAGE_EXTRACT_AND_RUN') === '1' && ambiente.get(EXTRACT_AND_RUN_ADDED_FLAG) === '1',
      detalhe: { extractAndRun: ambiente.get('APPIMAGE_EXTRACT_AND_RUN') ?? null, marca: ambiente.get(EXTRACT_AND_RUN_ADDED_FLAG) ?? null },
    })
  }
  await encerrarTudo()
}

async function main() {
  if (process.platform !== 'linux') throw new Error('Este teste só roda no Linux.')
  const releaseDir = path.resolve(argumento('--release-dir') ?? 'release')
  const out = path.resolve(argumento('--out') ?? path.join(os.tmpdir(), 'linux-instalado-e2e'))
  const extractAndRun = process.argv.includes('--extract-and-run')
  fs.mkdirSync(out, { recursive: true })
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-linux-e2e-'))
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const esperados = pkg.build.fileAssociations.map((associacao) => associacao.mimeType)
  const relatorio = []
  try {
    if (!extractAndRun) verificarDesktops({ releaseDir, work, esperados, relatorio })
    await verificarAppImage({ releaseDir, work, extractAndRun, relatorio })
  } catch (erro) {
    relatorio.push({ passo: 'execução', ok: false, detalhe: String(erro?.message ?? erro) })
  } finally {
    await encerrarTudo().catch(() => {})
    const log = path.join(work, 'app.log')
    if (fs.existsSync(log)) fs.copyFileSync(log, path.join(out, 'app.log'))
  }
  fs.writeFileSync(path.join(out, 'relatorio.json'), `${JSON.stringify(relatorio, null, 2)}\n`)
  for (const item of relatorio) console.log(`${item.ok ? 'ok    ' : 'FALHOU'} ${item.passo}\n       ${JSON.stringify(item.detalhe)}`)
  process.exit(relatorio.length > 0 && relatorio.every((item) => item.ok) ? 0 : 1)
}

if (require.main === module) main()

module.exports = { analisarDesktop, listarProcessosPrincipais, lerAmbiente }
