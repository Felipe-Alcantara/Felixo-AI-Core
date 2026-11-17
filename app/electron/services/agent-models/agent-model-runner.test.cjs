const test = require('node:test')
const assert = require('node:assert/strict')
const { createCliRunner } = require('./agent-model-runner.cjs')

/** execFile falso: guarda a chamada e devolve a saída pedida. */
function createExec(saida = 'Available: sonnet, fable') {
  const chamadas = []
  const execFileImpl = (file, args, options, callback) => {
    chamadas.push({ file, args, options })
    callback(null, saida, '')
  }
  return { chamadas, execFileImpl }
}

const ENV = { Path: 'C:\\Users\\Nome Sobrenome\\AppData\\Roaming\\npm' }

test('no Windows, o claude vai direto ao claude.exe por trás do atalho, sem shell', async () => {
  const exec = createExec()
  const exe = 'C:\\Users\\Nome Sobrenome\\AppData\\Roaming\\npm\\node_modules\\claude.exe'
  const runCli = createCliRunner({
    platformName: 'win32',
    execFileImpl: exec.execFileImpl,
    resolveNativeClaude: () => ({ command: exe, viaShell: false }),
  })

  const saida = await runCli('claude', ['-p', '/model'], ENV)

  assert.match(saida, /fable/)
  assert.equal(exec.chamadas[0].file, exe)
  assert.deepEqual(exec.chamadas[0].args, ['-p', '/model'])
  assert.equal(exec.chamadas[0].options.shell, undefined)
})

test('no Windows, só o atalho .cmd: roda pelo cmd.exe com o caminho com espaço entre aspas', async () => {
  const exec = createExec()
  const cmd = 'C:\\Users\\Nome Sobrenome\\AppData\\Roaming\\npm\\claude.cmd'
  const runCli = createCliRunner({
    platformName: 'win32',
    execFileImpl: exec.execFileImpl,
    resolveNativeClaude: () => ({ command: 'claude', viaShell: true }),
    resolveCommandPath: () => cmd,
  })

  await runCli('claude', ['-p', '/model'], ENV)

  assert.equal(exec.chamadas[0].file, `"${cmd}" -p /model`)
  assert.deepEqual(exec.chamadas[0].args, [])
  assert.equal(exec.chamadas[0].options.shell, true)
})

test('no Windows, recusa argumento fora do formato conhecido no cmd.exe', async () => {
  const exec = createExec()
  const runCli = createCliRunner({
    platformName: 'win32',
    execFileImpl: exec.execFileImpl,
    resolveCommandPath: () => 'C:\\npm\\codex.cmd',
  })

  await assert.rejects(runCli('codex', ['-p', '& calc'], ENV), /recusado/)
  assert.equal(exec.chamadas.length, 0)
})

test('no Windows, CLI fora do PATH falha com ENOENT em vez de silêncio', async () => {
  const runCli = createCliRunner({
    platformName: 'win32',
    execFileImpl: createExec().execFileImpl,
    resolveNativeClaude: () => ({ command: 'claude', viaShell: true }),
    resolveCommandPath: () => null,
  })

  await assert.rejects(runCli('claude', ['-p', '/model'], ENV), { code: 'ENOENT' })
})

test('fora do Windows nada muda: o comando vai pelo nome, sem resolver', async () => {
  const exec = createExec()
  const runCli = createCliRunner({
    platformName: 'linux',
    execFileImpl: exec.execFileImpl,
    resolveNativeClaude: () => {
      throw new Error('não deveria resolver fora do Windows')
    },
  })

  await runCli('claude', ['-p', '/model'], { PATH: '/usr/bin' })

  assert.equal(exec.chamadas[0].file, 'claude')
  assert.deepEqual(exec.chamadas[0].args, ['-p', '/model'])
})

test('código de saída != 0 com a lista impressa no stderr ainda conta', async () => {
  const runCli = createCliRunner({
    platformName: 'linux',
    execFileImpl: (file, args, options, callback) => callback(new Error('exit 1'), '', 'Available: opus'),
  })

  assert.match(await runCli('claude', ['-p', '/model']), /opus/)
})

test('saída vazia com erro rejeita', async () => {
  const runCli = createCliRunner({
    platformName: 'linux',
    execFileImpl: (file, args, options, callback) => callback(new Error('boom'), '', ''),
  })

  await assert.rejects(runCli('claude', ['-p', '/model']), /boom/)
})
