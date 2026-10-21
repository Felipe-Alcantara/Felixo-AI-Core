'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { spawn } = require('node:child_process')
const { test } = require('node:test')

const { killProcessTree } = require('../electron/core/process-tree.cjs')
const {
  HOLD_ENV_KEY,
  assertShimSafeExecutable,
  classifyOutcome,
  computeTimeoutScenarioMs,
  descendantsOf,
  findNpmCliNextToNode,
  findPackagedElectronDir,
  findSurvivors,
  isAlive,
  killLeftovers,
  listProcesses,
  parseArgs,
  parseDriverArgs,
  parsePosixProcessTable,
  parseWindowsProcessTable,
  redactDetail,
  runInstallerKillSmoke,
  waitForDisappearance,
  waitForHold,
  writeKillFixture,
} = require('./installer-kill-smoke.cjs')

// --- Tabela de processos -----------------------------------------------------

test('parseWindowsProcessTable lê lista e objeto único (o PowerShell não faz array de um item) e ignora pid 0', () => {
  const lista = JSON.stringify([
    { ProcessId: 0, ParentProcessId: 0, Name: 'System Idle Process' },
    { ProcessId: 10, ParentProcessId: 4, Name: 'node.exe' },
  ])
  assert.deepEqual(parseWindowsProcessTable(lista), [{ pid: 10, ppid: 4, name: 'node.exe' }])

  const unico = JSON.stringify({ ProcessId: 7, ParentProcessId: 1, Name: 'cmd.exe' })
  assert.deepEqual(parseWindowsProcessTable(unico), [{ pid: 7, ppid: 1, name: 'cmd.exe' }])
  assert.deepEqual(parseWindowsProcessTable(''), [])
})

test('parsePosixProcessTable aceita nome com espaço e caminho inteiro (macOS) e pula linha que não é processo', () => {
  const saida = [
    '    1     0 /sbin/launchd',
    '  501   300 /Applications/Felixo AI Core.app/Contents/MacOS/Felixo AI Core',
    ' 2200   501 node',
    'lixo sem numero',
    '',
  ].join('\n')

  assert.deepEqual(parsePosixProcessTable(saida), [
    { pid: 1, ppid: 0, name: 'launchd' },
    { pid: 501, ppid: 300, name: 'Felixo AI Core' },
    { pid: 2200, ppid: 501, name: 'node' },
  ])
})

test('descendantsOf devolve filhos, netos e bisnetos com a profundidade, sem a raiz e sem parentes de outra árvore', () => {
  const tabela = [
    { pid: 1, ppid: 0, name: 'raiz' },
    { pid: 2, ppid: 1, name: 'npm' },
    { pid: 3, ppid: 2, name: 'cmd' },
    { pid: 4, ppid: 3, name: 'hold' },
    { pid: 5, ppid: 4, name: 'neto' },
    { pid: 90, ppid: 0, name: 'outra-arvore' },
    { pid: 91, ppid: 90, name: 'outra-arvore-filho' },
  ]

  assert.deepEqual(descendantsOf(1, tabela), [
    { pid: 2, ppid: 1, name: 'npm', depth: 1 },
    { pid: 3, ppid: 2, name: 'cmd', depth: 2 },
    { pid: 4, ppid: 3, name: 'hold', depth: 3 },
    { pid: 5, ppid: 4, name: 'neto', depth: 4 },
  ])
  assert.deepEqual(descendantsOf(404, tabela), [])
})

test('descendantsOf não trava com ciclo nem com processo que é pai de si mesmo (pid reaproveitado)', () => {
  const tabela = [
    { pid: 1, ppid: 3, name: 'a' },
    { pid: 2, ppid: 1, name: 'b' },
    { pid: 3, ppid: 2, name: 'c' },
    { pid: 4, ppid: 4, name: 'eu-mesmo' },
  ]

  assert.deepEqual(descendantsOf(1, tabela).map((entry) => entry.pid), [2, 3])
  assert.deepEqual(descendantsOf(4, tabela), [])
})

test('findSurvivors só conta quem tem o mesmo pid E o mesmo nome — pid reaproveitado por outro programa não é órfão', () => {
  const gravado = [
    { pid: 10, name: 'node.exe' },
    { pid: 11, name: 'cmd.exe' },
    { pid: 12, name: 'Felixo AI Core.exe' },
  ]
  const agora = [
    { pid: 10, ppid: 1, name: 'NODE.EXE' }, // mesmo programa, caixa diferente: sobrou
    { pid: 11, ppid: 1, name: 'chrome.exe' }, // o SO deu o pid 11 a outro: não é órfão
    { pid: 99, ppid: 1, name: 'cmd.exe' }, // outro pid: não é o gravado
  ]

  assert.deepEqual(findSurvivors(gravado, agora), [{ pid: 10, name: 'node.exe' }])
  // ".exe" não faz diferença: no Linux o nome vem sem ele.
  assert.deepEqual(findSurvivors([{ pid: 12, name: 'Felixo AI Core.exe' }], [{ pid: 12, ppid: 1, name: 'Felixo AI Core' }]), [
    { pid: 12, name: 'Felixo AI Core.exe' },
  ])
})

test('waitForDisappearance devolve vazio quando a árvore some e os sobreviventes quando o prazo acaba', async () => {
  const gravado = [{ pid: 1, name: 'npm' }, { pid: 2, name: 'hold' }]
  let rodada = 0
  const morrem = await waitForDisappearance(gravado, {
    timeoutMs: 1000,
    pollMs: 1,
    sleep: async () => {},
    // Na terceira conferência o último pid deixa de existir.
    alive: (pid) => {
      rodada += 1
      return rodada < 3 && pid === 2
    },
    list: () => assert.fail('sem sobrevivente não há por que listar processos'),
  })
  assert.deepEqual(morrem, [])

  const ficam = await waitForDisappearance(gravado, {
    timeoutMs: 20,
    pollMs: 1,
    sleep: async () => {},
    alive: (pid) => pid === 2,
    list: () => [{ pid: 2, ppid: 1, name: 'hold' }],
  })
  assert.deepEqual(ficam, [{ pid: 2, name: 'hold' }])

  const reaproveitado = await waitForDisappearance(gravado, {
    timeoutMs: 20,
    pollMs: 1,
    sleep: async () => {},
    alive: (pid) => pid === 2,
    list: () => [{ pid: 2, ppid: 1, name: 'outro-programa' }],
  })
  assert.deepEqual(reaproveitado, [], 'pid vivo com outro nome é reaproveitamento, não órfão')
})

test('killLeftovers tenta todos e engole o erro de quem já morreu', () => {
  const mortos = []
  killLeftovers(
    [{ pid: 1, name: 'a' }, { pid: 2, name: 'b' }, { pid: 3, name: 'c' }],
    (pid, sinal) => {
      mortos.push([pid, sinal])
      if (pid === 2) throw Object.assign(new Error('nao existe'), { code: 'ESRCH' })
    },
  )
  assert.deepEqual(mortos, [[1, 'SIGKILL'], [2, 'SIGKILL'], [3, 'SIGKILL']])
})

// --- Cenário ------------------------------------------------------------------

test('classifyOutcome separa cancelado, instalado, expirado e falha sem expor o texto da mensagem', () => {
  assert.equal(classifyOutcome({ ok: false, cancelled: true, message: 'x' }), 'cancelled')
  assert.equal(classifyOutcome({ ok: true, message: 'x' }), 'installed')
  assert.equal(classifyOutcome({ ok: false, message: 'Nao foi possivel instalar X. A instalacao passou do tempo limite.' }), 'timeout')
  assert.equal(classifyOutcome({ ok: false, message: 'Nao foi possivel instalar X. (codigo 1)' }), 'failed')
  assert.equal(classifyOutcome(null), 'failed')
})

test('computeTimeoutScenarioMs dá folga sobre o tempo medido e respeita o piso e o teto', () => {
  assert.equal(computeTimeoutScenarioMs(8000), 21_000)
  assert.equal(computeTimeoutScenarioMs(100), 20_000)
  assert.equal(computeTimeoutScenarioMs(500_000), 120_000)
  assert.equal(computeTimeoutScenarioMs(undefined), 20_000)
  assert.equal(computeTimeoutScenarioMs(null), 20_000)
})

test('parseDriverArgs exige tudo o que o driver usa e recusa cenário e argumento desconhecidos', () => {
  const base = [
    '--scenario', 'cancel',
    '--user-data', 'u',
    '--electron-dir', 'e',
    '--npm-cli', 'n',
    '--fixture', 'f',
    '--hold-file', 'h',
    '--out', 'o',
  ]

  const ok = parseDriverArgs([...base, '--control', '--install-timeout-ms', '25000'])
  assert.equal(ok.scenario, 'cancel')
  assert.equal(ok.control, true)
  assert.equal(ok.installTimeoutMs, 25_000)
  assert.equal(parseDriverArgs(base).installTimeoutMs, undefined)

  assert.throws(() => parseDriverArgs(base.slice(2)), /scenario/)
  assert.throws(() => parseDriverArgs(['--scenario', 'explodir', ...base.slice(2)]), /Cenario desconhecido/)
  assert.throws(() => parseDriverArgs([...base, '--nada']), /desconhecido/)
  assert.throws(() => parseDriverArgs([...base, '--install-timeout-ms']), /exige um valor/)
})

test('parseArgs da CLI aceita artefato, relatório, --source e --control, e recusa o resto', () => {
  const opcoes = parseArgs(['--artifact', 'release/win-unpacked', '--report', 'r.json', '--control', '--timeout-ms', '5000'])
  assert.equal(opcoes.artifact, 'release/win-unpacked')
  assert.equal(opcoes.report, 'r.json')
  assert.equal(opcoes.control, true)
  assert.equal(opcoes.timeoutMs, 5000)
  assert.equal(opcoes.source, false)
  assert.equal(parseArgs(['--source']).source, true)
  assert.throws(() => parseArgs(['--timeout-ms', '10']), /1000/)
  assert.throws(() => parseArgs(['--artifact']), /exige um valor/)
  assert.throws(() => parseArgs(['--outra-coisa']), /desconhecido/)
})

test('redactDetail tira a pasta temporária e a pasta pessoal do diagnóstico e guarda só o final', () => {
  const texto = 'erro em C:\\Users\\Ana\\AppData\\Local\\Temp\\x\\fixture e em C:\\Users\\Ana\\.npm'
  assert.equal(
    redactDetail(texto, 'C:\\Users\\Ana\\AppData\\Local\\Temp\\x', 'C:\\Users\\Ana'),
    'erro em <tmp>\\fixture e em ~\\.npm',
  )
  assert.equal(redactDetail('a'.repeat(2000), null, null).length, 800)
  assert.equal(redactDetail(undefined, 'x', 'y'), '')
})

test('parseArgs --only escolhe cenários e recusa nome que não existe', () => {
  assert.deepEqual(parseArgs([]).only, ['cancel', 'timeout'])
  assert.deepEqual(parseArgs(['--only', 'timeout']).only, ['timeout'])
  assert.deepEqual(parseArgs(['--only', 'cancel,timeout']).only, ['cancel', 'timeout'])
  assert.throws(() => parseArgs(['--only', 'explodir']), /cenario desconhecido \(explodir\)/)
})

test('assertShimSafeExecutable recusa caminho com acento no Windows, onde o atalho node.cmd quebra, e deixa o resto passar', () => {
  assert.throws(
    () => assertShimSafeExecutable('J:\\Programação\\Felixo AI Core.exe', 'win32'),
    /fora do ASCII.*node\.cmd/,
  )
  assert.doesNotThrow(() => assertShimSafeExecutable('C:\\Users\\Felipe Martins\\AppData\\Local\\Temp\\app\\Felixo AI Core.exe', 'win32'))
  // O shell POSIX lê UTF-8: acento no caminho não é problema fora do Windows.
  assert.doesNotThrow(() => assertShimSafeExecutable('/Users/joão/Felixo AI Core.app/Contents/MacOS/Felixo AI Core', 'darwin'))
})

test('findPackagedElectronDir usa o app.asar quando existe e a pasta app quando o pacote não tem asar', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-kill-resources-'))
  try {
    assert.equal(findPackagedElectronDir(raiz), path.join(raiz, 'app', 'electron'))
    fs.writeFileSync(path.join(raiz, 'app.asar'), '')
    assert.equal(findPackagedElectronDir(raiz), path.join(raiz, 'app.asar', 'electron'))
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

test('writeKillFixture grava um pacote com postinstall e um hold.cjs de sintaxe válida que lê o arquivo do ambiente', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-kill-fixture-'))
  try {
    writeKillFixture(path.join(raiz, 'pkg'))
    const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, 'pkg', 'package.json'), 'utf8'))
    assert.equal(manifesto.scripts.postinstall, 'node hold.cjs')

    const hold = fs.readFileSync(path.join(raiz, 'pkg', 'hold.cjs'), 'utf8')
    assert.doesNotThrow(() => new vm.Script(hold))
    assert.ok(hold.includes(`process.env.${HOLD_ENV_KEY}`), 'o hold.cjs precisa gravar o pid no arquivo que o driver espera')
    assert.ok(hold.includes('300000'), 'sem autodesligamento, um kill que falha deixaria lixo na máquina')
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

test('waitForHold devolve o hold quando o arquivo aparece completo e null quando o prazo acaba', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-kill-hold-'))
  const arquivo = path.join(raiz, 'hold.json')
  try {
    assert.equal(await waitForHold(arquivo, 30, { pollMs: 5 }), null)

    // Meio escrito (JSON inválido) não vale; só o arquivo completo.
    fs.writeFileSync(arquivo, '{"pid": 1')
    setTimeout(() => fs.writeFileSync(arquivo, JSON.stringify({ pid: 11, grandchildPid: 12 })), 40)
    assert.deepEqual(await waitForHold(arquivo, 2000, { pollMs: 10 }), { pid: 11, grandchildPid: 12 })
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

// --- Processo real --------------------------------------------------------------
//
// A sonda é o que prova o resultado do smoke inteiro, então ela é testada contra o
// SO de verdade, nos dois sentidos: precisa enxergar o órfão (controle negativo) e
// não pode acusar órfão onde a árvore morreu de fato.

// No Windows o libuv põe os filhos de um processo Node num job object que mata tudo
// quando o pai morre: um neto comum não sobraria nem sem `killProcessTree`, e o
// controle negativo não provaria nada. O neto sai do job com `detached` (quebra do
// job), como um daemon de pós-instalação, e continua ligado ao pai pelo pid, que é
// por onde o `taskkill /T` desce. No POSIX ele fica no grupo do pai, que é o que o
// kill de grupo alcança.
const SCRIPT_PAI_COM_NETO = (arquivoPid) => `
  const { spawn } = require('node:child_process')
  const neto = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], {
    stdio: 'ignore',
    detached: ${process.platform === 'win32'},
  })
  require('node:fs').writeFileSync(${JSON.stringify(arquivoPid)}, String(neto.pid))
  setTimeout(() => {}, 120000)
`

async function esperar(condicao, { timeoutMs = 15_000, intervalMs = 40 } = {}) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    if (condicao()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

async function subirPaiComNeto() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-kill-real-'))
  const arquivoPid = path.join(pasta, 'neto.pid')
  const pai = spawn(process.execPath, ['-e', SCRIPT_PAI_COM_NETO(arquivoPid)], {
    stdio: 'ignore',
    // Como o instalador: no POSIX nasce líder de grupo, no Windows não existe isso.
    detached: process.platform !== 'win32',
  })
  assert.ok(await esperar(() => fs.existsSync(arquivoPid)), 'o pai não subiu o neto a tempo')
  const netoPid = Number(fs.readFileSync(arquivoPid, 'utf8'))
  return { pasta, pai, netoPid }
}

test('processo real: listProcesses + descendantsOf enxergam o neto e a própria sonda não aparece na árvore', async () => {
  const { pasta, pai, netoPid } = await subirPaiComNeto()
  try {
    const tabela = listProcesses()
    const arvore = descendantsOf(process.pid, tabela)
    const pids = arvore.map((entry) => entry.pid)

    assert.ok(pids.includes(pai.pid), 'o filho direto tem de aparecer')
    assert.ok(pids.includes(netoPid), 'o neto tem de aparecer')
    assert.equal(arvore.find((entry) => entry.pid === netoPid).depth, 2)
    // Só estes dois: o `powershell`/`ps` da própria sonda foi filtrado.
    assert.equal(arvore.length, 2, `esperava só pai e neto, veio: ${arvore.map((entry) => entry.name).join(', ')}`)
  } finally {
    killLeftovers([{ pid: pai.pid }, { pid: netoPid }])
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

test('controle negativo real: matar só o pai (como o child.kill de antes do PR #84) deixa o neto, e a sonda o enxerga como órfão', async () => {
  const { pasta, pai, netoPid } = await subirPaiComNeto()
  try {
    const gravado = descendantsOf(process.pid, listProcesses()).map(({ pid, name }) => ({ pid, name }))
    assert.ok(gravado.some((entry) => entry.pid === netoPid))

    process.kill(pai.pid, 'SIGKILL') // sem árvore, de propósito
    const sobreviventes = await waitForDisappearance(gravado, { timeoutMs: 1500 })

    assert.deepEqual(sobreviventes.map((entry) => entry.pid), [netoPid], 'só o neto devia ter sobrado')
    assert.ok(isAlive(netoPid))
  } finally {
    killLeftovers([{ pid: pai.pid }, { pid: netoPid }])
    assert.ok(await esperar(() => !isAlive(netoPid), { timeoutMs: 5000 }), 'a limpeza do teste não derrubou o neto')
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

test('processo real: com killProcessTree a árvore some e a sonda não acusa órfão', async () => {
  const { pasta, pai, netoPid } = await subirPaiComNeto()
  try {
    const gravado = descendantsOf(process.pid, listProcesses()).map(({ pid, name }) => ({ pid, name }))
    assert.ok(gravado.some((entry) => entry.pid === netoPid))

    await killProcessTree({ pid: pai.pid, graceMs: 200 })
    const sobreviventes = await waitForDisappearance(gravado, { timeoutMs: 10_000 })

    assert.deepEqual(sobreviventes, [], 'killProcessTree deixou processo para trás')
  } finally {
    killLeftovers([{ pid: pai.pid }, { pid: netoPid }])
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

// --- Ponta a ponta com npm de verdade (opt-in) ---------------------------------
//
// Sobe o npm do Node desta máquina, o instalador da FONTE e um `postinstall` real.
// Leva uns 40 s no Windows, então só roda com FELIXO_REAL_INSTALLER_KILL=1. O mesmo
// cenário roda sempre no CI, contra o app empacotado, dentro de `release-smoke`.

const e2e = process.env.FELIXO_REAL_INSTALLER_KILL === '1' ? test : test.skip

e2e('ponta a ponta (fonte): cancelar e expirar a instalação não deixa processo, e o controle deixa', { timeout: 600_000 }, async () => {
  const npmCliPath = findNpmCliNextToNode()
  assert.ok(npmCliPath, 'npm-cli.js do Node não encontrado')
  const alvo = {
    executable: process.execPath,
    electronDir: path.resolve(__dirname, '..', 'electron'),
    npmCliPath,
  }
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-kill-e2e-'))
  try {
    const limpo = await runInstallerKillSmoke({ ...alvo, temporaryRoot: raiz, timeoutMs: 180_000 })
    assert.equal(limpo.ok, true)
    assert.deepEqual(limpo.scenarios.map((cenario) => [cenario.scenario, cenario.outcome, cenario.survivors]), [
      ['cancel', 'cancelled', 0],
      ['timeout', 'timeout', 0],
    ])
    assert.ok(limpo.scenarios.every((cenario) => cenario.treeSize >= 3), 'a árvore devia ter npm, shell e postinstall ao menos')

    const controle = await runInstallerKillSmoke({ ...alvo, temporaryRoot: raiz, timeoutMs: 180_000, control: true, scenarios: ['cancel'] })
    assert.equal(controle.ok, true)
    assert.ok(controle.scenarios[0].survivors > 0, 'o kill só do npm devia ter deixado órfão')
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})
