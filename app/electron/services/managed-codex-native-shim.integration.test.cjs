'use strict'

/**
 * Integração nativa: em máquina sem Node, o Codex abre com console no terminal
 * do canvas e no PowerShell, pelo atalho `native-bin\codex.cmd`.
 *
 * Por que existe: o feedback de um usuário no Windows (v0.1.515) mostrava o
 * agente Codex fechando ao abrir, com `Error: stdin is not a terminal`. Sem Node
 * instalado, o `codex.cmd` do npm chama o `node.cmd` do app, que roda o Electron
 * como Node, e o Electron (subsistema GUI) não entrega um console ao
 * `codex.exe`. Medido em 09/11/2026 num ConPTY: `process.stdin.isTTY` fica
 * `undefined` no Electron-como-Node e no filho dele, e `true` com Node de
 * verdade. O agente anterior não reproduziu porque tinha Node instalado.
 *
 * O `node.cmd` e o `codex.cmd` do npm daqui FALHAM de propósito: se o terminal
 * cair neles, o teste reprova. O `codex.exe` é uma cópia do próprio Node, que
 * sabe dizer se recebeu um terminal. Perfil com espaço e acento, como
 * `C:\Users\João Antônio`, para provar que o atalho não grava caminho literal.
 *
 * Só no Windows: é onde o Electron-como-Node perde o console.
 */

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { getManagedCliLayout } = require('../core/managed-cli-paths.cjs')
const { PtyProcessManager } = require('./pty-process-manager.cjs')
const { ensureManagedCodexNativeShim } = require('./managed-codex-native-shim.cjs')

const TEMPO_LIMITE_MS = 30_000
const ARQUITETURAS = {
  x64: { pacote: 'codex-win32-x64', triplo: 'x86_64-pc-windows-msvc' },
  arm64: { pacote: 'codex-win32-arm64', triplo: 'aarch64-pc-windows-msvc' },
}
const SUPORTADO = process.platform === 'win32' && Boolean(ARQUITETURAS[process.arch])

/** Instalação gerenciada falsa: o `codex.exe` é o Node, e o npm e o node do app falham de propósito. */
function montarInstalacao() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo sonda codex nativo '))
  const userData = path.join(raiz, 'João Antônio', 'AppData', 'Roaming', 'Felixo AI Core')
  const layout = getManagedCliLayout({ userData, platformName: 'win32', env: {} })
  const { pacote, triplo } = ARQUITETURAS[process.arch]
  const executavel = path.join(
    layout.root,
    'node_modules',
    '@openai',
    'codex',
    'node_modules',
    '@openai',
    pacote,
    'vendor',
    triplo,
    'bin',
    'codex.exe',
  )

  for (const dir of [layout.runtimeBin, path.dirname(executavel)]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(path.join(layout.runtimeBin, 'node.cmd'), '@echo off\r\necho NODE_DO_APP_USADO\r\nexit /b 1\r\n')
  // O que o npm deixa em `clis`: um codex.cmd e um codex.ps1 que dependem do node do app.
  fs.writeFileSync(path.join(layout.packagesBin, 'codex.cmd'), '@echo off\r\necho NPM_SHIM_USADO\r\nexit /b 1\r\n')
  fs.writeFileSync(path.join(layout.packagesBin, 'codex.ps1'), 'Write-Output "NPM_PS1_USADO"\r\nexit 1\r\n')

  try {
    fs.linkSync(process.execPath, executavel)
  } catch {
    fs.copyFileSync(process.execPath, executavel)
  }

  // O que o `codex.exe` recebeu: gravado em arquivo, para não depender de ler a tela.
  const sonda = path.join(raiz, 'sonda.js')
  fs.writeFileSync(
    sonda,
    [
      "const fs = require('node:fs')",
      "const path = require('node:path')",
      "fs.writeFileSync(path.join(__dirname, 'recebido.json'), JSON.stringify({",
      '  stdinTTY: process.stdin.isTTY === true,',
      '  stdoutTTY: process.stdout.isTTY === true,',
      '  gerenciadoPeloNpm: process.env.CODEX_MANAGED_BY_NPM,',
      '  raizDoPacote: process.env.CODEX_MANAGED_PACKAGE_ROOT,',
      '  argumentos: process.argv.slice(2),',
      '}))',
      "console.log('__FELIXO_SONDA_OK__')",
      '',
    ].join('\n'),
  )

  return { raiz, layout, sonda, destino: path.join(raiz, 'recebido.json') }
}

/** PATH de uma máquina sem Node: o do app só no fim, como em `getManagedCliPathCandidates`. */
function gravarAtalho(layout) {
  const efetivo = [layout.nativeBin, layout.packagesBin, layout.runtimeBin, 'C:\\Windows\\System32'].join(';')
  const resultado = ensureManagedCodexNativeShim({
    layout,
    effectivePath: efetivo,
    platformName: 'win32',
    arch: process.arch,
  })
  assert.equal(resultado.action, 'created', `atalho não gravado: ${JSON.stringify(resultado)}`)
  return resultado.shimPath
}

function limpar(raiz) {
  fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

test('o agente Codex abre com console pelo atalho nativo, sem passar pelo node do app', { skip: !SUPORTADO }, async () => {
  const { raiz, layout, sonda, destino } = montarInstalacao()
  gravarAtalho(layout)

  // A pasta configurada vence o PATH do ambiente real (que pode ter um `codex` da própria máquina).
  const ambienteOriginal = { cli: process.env.FELIXO_CLI_PATHS, path: process.env.PATH }
  process.env.FELIXO_CLI_PATHS = layout.nativeBin
  process.env.PATH = [layout.nativeBin, layout.packagesBin, layout.runtimeBin, ambienteOriginal.path].join(';')
  const manager = new PtyProcessManager()
  let saida = ''

  try {
    const evento = await new Promise((resolver, rejeitar) => {
      const timer = setTimeout(
        () => rejeitar(new Error(`[Codex nativo] não encerrou em ${TEMPO_LIMITE_MS} ms; saída: ${JSON.stringify(saida.slice(-500))}`)),
        TEMPO_LIMITE_MS,
      )
      manager.spawn('teste-codex-nativo', {
        command: 'codex',
        args: [sonda, 'com espaço', 'ação'],
        cwd: raiz,
        cols: 120,
        rows: 30,
        onData: (dados) => {
          saida += String(dados)
        },
        onExit: (event) => {
          clearTimeout(timer)
          resolver(event)
        },
      })
    })

    const contexto = `saída: ${JSON.stringify(saida.slice(-500))}`
    assert.ok(!saida.includes('NODE_DO_APP_USADO'), `[Codex nativo] caiu no node do app; ${contexto}`)
    assert.ok(!saida.includes('NPM_SHIM_USADO'), `[Codex nativo] caiu no codex.cmd do npm; ${contexto}`)
    assert.equal(evento?.exitCode, 0, `[Codex nativo] saiu com ${evento?.exitCode}; ${contexto}`)
    assert.ok(saida.includes('__FELIXO_SONDA_OK__'), `[Codex nativo] marcador ausente; ${contexto}`)

    const recebido = JSON.parse(fs.readFileSync(destino, 'utf8'))
    // O ponto do conserto: o executável nativo recebeu um terminal.
    assert.equal(recebido.stdinTTY, true, 'o codex.exe não recebeu um stdin de terminal')
    assert.equal(recebido.stdoutTTY, true, 'o codex.exe não recebeu um stdout de terminal')
    assert.deepEqual(recebido.argumentos, ['com espaço', 'ação'])
    // As variáveis que o `codex.js` do npm define para o executável nativo.
    assert.equal(recebido.gerenciadoPeloNpm, '1')
    assert.equal(
      recebido.raizDoPacote.toLowerCase(),
      path.join(layout.root, 'node_modules', '@openai', 'codex').toLowerCase(),
      'CODEX_MANAGED_PACKAGE_ROOT precisa sair normalizada, sem "..".',
    )
  } finally {
    restaurar(ambienteOriginal)
    manager.killAll({ force: true })
    limpar(raiz)
  }
})

test('o PowerShell resolve `codex` para o atalho nativo e não para o codex.ps1 do npm', { skip: !SUPORTADO }, () => {
  const { raiz, layout } = montarInstalacao()
  const atalho = gravarAtalho(layout)

  try {
    // O mesmo caso do Shell do app: o PowerShell prefere `.ps1`, mas resolve por pasta,
    // então o `codex.cmd` de uma pasta anterior vence o `codex.ps1` da pasta do npm.
    // Quem compara é o próprio PowerShell: o caminho esperado vai por variável de
    // ambiente (UTF-16) porque a saída dele sai na página de código OEM e perde o acento.
    const resultado = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '(Get-Command codex).Source -ieq $env:CAMINHO_ESPERADO'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAMINHO_ESPERADO: atalho,
          PATH: [layout.nativeBin, layout.packagesBin, layout.runtimeBin, process.env.PATH].join(';'),
        },
        timeout: TEMPO_LIMITE_MS,
      },
    )

    assert.equal(resultado.status, 0, `PowerShell saiu com ${resultado.status}: ${resultado.stderr}`)
    assert.equal(resultado.stdout.trim(), 'True', `o codex resolvido não foi o atalho nativo (${atalho})`)
  } finally {
    limpar(raiz)
  }
})

function restaurar({ cli, path: caminho }) {
  if (cli === undefined) {
    delete process.env.FELIXO_CLI_PATHS
  } else {
    process.env.FELIXO_CLI_PATHS = cli
  }
  process.env.PATH = caminho
}
