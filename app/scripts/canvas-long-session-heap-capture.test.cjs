'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseArgs } = require('./canvas-long-session-heap-capture.cjs')

test('parseArgs aplica os padrões e aceita cada opção no formato --chave=valor', () => {
  assert.deepEqual(parseArgs(['--out-dir=/tmp/x']), {
    terminals: 6, webviews: 2, durationMinutes: 30, sampleIntervalMs: 60_000, outDir: '/tmp/x',
  })
  assert.deepEqual(
    parseArgs(['--terminals=10', '--webviews=3', '--duration-minutes=60', '--sample-interval-ms=15000', '--out-dir=/tmp/y']),
    { terminals: 10, webviews: 3, durationMinutes: 60, sampleIntervalMs: 15000, outDir: '/tmp/y' },
  )
})

test('parseArgs exige --out-dir', () => {
  assert.throws(() => parseArgs(['--terminals=1']), /--out-dir/)
})

test('parseArgs rejeita --terminals/--webviews negativos ou não inteiros', () => {
  assert.throws(() => parseArgs(['--out-dir=/tmp/x', '--terminals=-1']), /--terminals/)
  assert.throws(() => parseArgs(['--out-dir=/tmp/x', '--webviews=1.5']), /--webviews/)
})

test('parseArgs rejeita opção desconhecida', () => {
  assert.throws(() => parseArgs(['--out-dir=/tmp/x', '--bogus=1']), /Opção desconhecida/)
})

test('no Windows a tabela de processos vem do CIM pelo PowerShell, no mesmo formato do ps', () => {
  const { readProcessTable } = require('./canvas-long-session-heap-capture.cjs')
  const calls = []
  const execFileSync = (file, args) => {
    calls.push({ file, args })
    return '4000 1200 81234 electron.exe\r\n4010 4000 302000 electron.exe\r\n4020 4010 9000 pwsh.exe\r\n88 4 512 Memory Compression\r\n'
  }

  const table = readProcessTable({ platform: 'win32', execFileSync })

  assert.equal(calls[0].file, 'powershell.exe')
  assert.match(calls[0].args.join(' '), /Win32_Process/)
  assert.deepEqual(table[1], { pid: 4010, ppid: 4000, rssKb: 302000, comm: 'electron.exe' })
  assert.equal(table[3].comm, 'Memory Compression')
})

test('fora do Windows a tabela segue vindo do ps', () => {
  const { readProcessTable } = require('./canvas-long-session-heap-capture.cjs')
  const calls = []
  const table = readProcessTable({
    platform: 'linux',
    execFileSync: (file, args) => {
      calls.push({ file, args })
      return '  10     1  2048 electron\n'
    },
  })

  assert.equal(calls[0].file, 'ps')
  assert.deepEqual(table, [{ pid: 10, ppid: 1, rssKb: 2048, comm: 'electron' }])
})
