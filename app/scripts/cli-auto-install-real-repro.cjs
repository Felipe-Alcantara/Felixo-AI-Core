'use strict'

/**
 * Reprodução real (não simulada) do ciclo de instalação automática de CLIs no
 * Windows: instala de verdade pelo npm/npm gerenciado do próprio app, num
 * `userData` isolado (nunca o perfil real), e prova três coisas que a task
 * "Windows — reproduzir instalação repetida de CLIs em app empacotado e após
 * upgrade" pede:
 *
 * 1. Um segundo "startup" com a CLI já detectada não reinstala nada.
 * 2. Um "upgrade" (versão do app muda) não reinstala uma CLI gerenciada cujo
 *    binário continua no disco e cujo registro de sucesso está de pé.
 * 3. Um "upgrade" com o binário apagado (simulando corrupção/remoção externa)
 *    detecta a ausência e reinstala.
 *
 * Roda com o Node/npm do próprio projeto (fallback de `resolveNpmCliPath`
 * quando não há `resourcesPath` empacotado) — é o mesmo runtime que o app
 * empacotado usa, só que sem precisar empacotar nada. `--cli <id>` escolhe
 * qual CLI oficial instalar de verdade (padrão: `gemini`, a mais leve do
 * catálogo); a instalação faz uma chamada real ao registry do npm.
 *
 * Uso: `node scripts/cli-auto-install-real-repro.cjs [--cli gemini]`
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const { getManagedCliLayout } = require('../electron/core/managed-cli-paths.cjs')
const { hasManagedBinary } = require('../electron/services/cli-diagnostics.cjs')
const { getOfficialAiCli } = require('../electron/core/official-cli-catalog.cjs')

/**
 * `cli-auto-install.cjs` faz `require('electron')` no topo do arquivo. Fora do
 * Electron, esse pacote é só um binário (a string do caminho do executável),
 * sem `ipcMain` — por isso o require precisa acontecer com um stub de
 * `electron` no lugar, o mesmo truque que os testes do módulo já usam.
 */
function requireCliAutoInstallWithStub(handlers, onlyCliId) {
  const Module = require('node:module')
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    // Restringe o catálogo a UMA CLI: o catálogo real instala codex+claude+gemini
    // juntos, e cada rodada real leva minutos — não é preciso instalar as três
    // pra provar o ciclo de "não reinstala". `require.cache` garante que
    // `cli-auto-install.cjs` recebe este mesmo módulo (já filtrado) quando o
    // exigir por baixo, em vez de uma cópia sem o filtro.
    const catalogPath = require.resolve('../electron/core/official-cli-catalog.cjs')
    delete require.cache[catalogPath]
    const catalogModule = require(catalogPath)
    const originalList = catalogModule.listOfficialAiClis
    catalogModule.listOfficialAiClis = () => originalList().filter((cli) => cli.id === onlyCliId)

    delete require.cache[require.resolve('../electron/services/cli-auto-install.cjs')]
    return require('../electron/services/cli-auto-install.cjs')
  } finally {
    Module._load = originalLoad
  }
}

const cliArg = process.argv.includes('--cli')
  ? process.argv[process.argv.indexOf('--cli') + 1]
  : 'gemini'

function makeUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-cli-repro-'))
}

function appPathsFor(userData) {
  return { userData, config: path.join(userData, 'config') }
}

/** Roda uma rodada completa (`run('startup')`) e devolve o status final. */
async function runRound(appPaths, appVersion, { fakeAlreadyPresent = false } = {}) {
  let detectCalls = 0
  const cli = getOfficialAiCli(cliArg)
  const layout = getManagedCliLayout({ userData: appPaths.userData })

  const handlers = new Map()
  const { registerCliAutoInstallHandlers } = requireCliAutoInstallWithStub(handlers, cliArg)
  let service
  {
    service = registerCliAutoInstallHandlers(() => null, {
      appPaths,
      appVersion,
      isPackaged: true,
      platformName: process.platform,
      arch: process.arch,
      ...(fakeAlreadyPresent
        ? {
            // Só para provar o caminho de "já detectado" sem depender de PATH
            // real: finge que o `detect` de verdade encontrou a CLI.
            detect: async (catalogCli) => ({
              detected: true,
              version: '0.0.0-fake',
              path: 'fake',
              reason: null,
              attempts: [],
            }),
          }
        : {}),
    })
  }

  const start = performance.now()
  const status = await service.run('startup')
  service.stop()
  const elapsedMs = Math.round(performance.now() - start)

  return {
    status,
    elapsedMs,
    binaryPresent: hasManagedBinary({ layout, cli, fileSystem: fs }),
  }
}

/**
 * Esta máquina de desenvolvimento já tem CLIs oficiais instaladas de verdade:
 * globalmente via npm (`%APPDATA%\npm`) e numa instalação gerenciada real do
 * próprio Felixo (`%APPDATA%\felixo-ai-core\clis`). `createCliEnv`
 * (`cli-process-manager.cjs`) monta candidatos de PATH a partir de
 * `process.env.APPDATA`/`LOCALAPPDATA` e da userData resolvida por
 * `getAppPaths()` — **não** do `userData` isolado que passamos para
 * `registerCliAutoInstallHandlers` (esse só vale para onde o app grava o
 * PRÓPRIO estado, `cli-auto-install.json`; a busca por CLIs já instaladas usa
 * o ambiente real do processo, do jeito que um usuário real também usaria).
 *
 * Achado real, medido nesta task: sem isolar isso, a "instalação real" desta
 * reprodução nunca instalava nada — a detecção sempre achava a CLI já
 * instalada nesta máquina, e as 4 rodadas terminavam `idle` sem provar coisa
 * nenhuma. Não é um bug de produção (numa máquina de verdade só existe UM
 * ambiente), é a lacuna que torna esta reprodução possível: para simular uma
 * máquina "limpa" sob este mesmo processo, HOME/APPDATA/LOCALAPPDATA e
 * `FELIXO_USER_DATA_DIR` (que `getAppPaths` já respeita, ver `app-paths.cjs`)
 * precisam apontar para fora do que já existe — nunca o ambiente real da
 * pessoa, que este script não altera.
 */
function isolateEnvironmentForThisProcessOnly(fakeHome, userData) {
  const roaming = path.join(fakeHome, 'AppData', 'Roaming')
  const local = path.join(fakeHome, 'AppData', 'Local')
  fs.mkdirSync(roaming, { recursive: true })
  fs.mkdirSync(local, { recursive: true })

  process.env.HOME = fakeHome
  process.env.USERPROFILE = fakeHome
  process.env.APPDATA = roaming
  process.env.LOCALAPPDATA = local
  process.env.FELIXO_USER_DATA_DIR = userData

  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const current = process.env[pathKey] ?? process.env.PATH ?? ''
  const filtered = current
    .split(path.delimiter)
    .filter((entry) => !/felixo-ai-core[\\/]clis|[\\/]npm$/i.test(entry))
    .join(path.delimiter)
  process.env[pathKey] = filtered
  process.env.PATH = filtered
}

async function main() {
  console.log(`[repro] CLI: ${cliArg} | plataforma: ${process.platform} | node: ${process.version}`)
  const userData = makeUserData()
  const fakeHome = makeUserData()
  isolateEnvironmentForThisProcessOnly(fakeHome, userData)
  console.log(`[repro] userData isolado: ${userData}`)
  console.log(`[repro] HOME/APPDATA isolados: ${fakeHome}`)

  try {
    console.log('\n=== Rodada 1: primeira abertura (instala de verdade) ===')
    const round1 = await runRound(appPathsFor(userData), '1.0.0')
    console.log(`estado: ${round1.status.state} | ${round1.status.message}`)
    console.log(`binário presente no disco: ${round1.binaryPresent} | duração: ${round1.elapsedMs}ms`)
    if (round1.status.state === 'error') {
      throw new Error(
        `a instalação real da rodada 1 falhou (${round1.status.message}) — pode ser falta de rede, ` +
          'um npm inutilizável neste ambiente, ou um problema real da CLI (ex.: dependência nativa ' +
          'opcional que o npm não baixa; ver IA.md/managed-cli-health.cjs para o caso conhecido do Codex).',
      )
    }

    // A duração é só contexto (a detecção real spawna `<cli> --version`, o que
    // sozinho leva alguns segundos em SOs diferentes) — o sinal de "não
    // reinstalou" é o estado devolvido, não o relógio: um `state: 'done'` só
    // aparece quando `installMissingClis` de fato chamou o instalador.
    console.log('\n=== Rodada 2: segunda abertura, MESMA versão (não deve reinstalar) ===')
    const round2 = await runRound(appPathsFor(userData), '1.0.0')
    console.log(`estado: ${round2.status.state} | ${round2.status.message} | duração: ${round2.elapsedMs}ms`)
    const round2Ok = round2.status.state === 'idle'
    console.log(round2Ok ? 'OK: não reinstalou' : 'FALHA: reinstalou uma CLI que já estava presente')

    console.log('\n=== Rodada 3: "upgrade" (versão do app muda, binário intacto) ===')
    const round3 = await runRound(appPathsFor(userData), '2.0.0')
    console.log(`estado: ${round3.status.state} | ${round3.status.message} | duração: ${round3.elapsedMs}ms`)
    const round3Ok = round3.status.state === 'idle'
    console.log(round3Ok ? 'OK: upgrade não reinstalou' : 'FALHA: upgrade reinstalou uma CLI que já estava presente')

    console.log('\n=== Rodada 4: "upgrade" com o binário apagado (deve reinstalar) ===')
    const layout = getManagedCliLayout({ userData })
    const cli = getOfficialAiCli(cliArg)
    const candidates = cli.windowsAliases?.length ? cli.windowsAliases : [cli.command]
    for (const candidate of [cli.command, ...candidates]) {
      try {
        fs.rmSync(path.join(layout.packagesBin, candidate), { force: true })
      } catch {
        // ignore
      }
    }
    const round4 = await runRound(appPathsFor(userData), '2.0.0')
    console.log(`estado: ${round4.status.state} | ${round4.status.message} | duração: ${round4.elapsedMs}ms`)
    const round4Ok = round4.status.state === 'done' && round4.binaryPresent
    console.log(round4Ok ? 'OK: binário ausente foi reinstalado' : 'FALHA: binário ausente não foi reinstalado')

    const allOk = round2Ok && round3Ok && round4Ok
    console.log(`\n${allOk ? 'REPRODUÇÃO: comportamento correto nas 4 rodadas.' : 'REPRODUÇÃO: encontrou um caso que reinstala quando não deveria (ou o contrário).'}`)
    process.exitCode = allOk ? 0 : 1
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
    fs.rmSync(fakeHome, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('[repro] erro:', error.stack || error.message)
  process.exitCode = 1
})
