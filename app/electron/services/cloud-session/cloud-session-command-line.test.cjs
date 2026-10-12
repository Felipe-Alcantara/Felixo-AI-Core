'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { buildWindowsCommandLine, quoteWindowsArg } = require('./cloud-session-command-line.cjs')
const { parseWindowsCommandLine } = require('./test-support/parse-windows-command-line.cjs')

// Entradas que quebram citação ingênua: aspas nas pontas, barras antes de aspas
// e no fim, aspas internas, quebras de linha, tabulação, vazio e opções falsas.
const TRICKY = [
  'simples',
  'com espaço',
  '',
  '"já entre aspas"',
  '"abre e fecha" --settings={"k":1} "fim"',
  'termina com barra\\',
  'termina com duas\\\\',
  'barra antes de aspa \\" fim',
  'barras antes de aspa \\\\" fim',
  'só aspas """',
  'C:\\Pasta com espaço\\arquivo.txt',
  'duas\nlinhas\ttab',
  '  espaços nas pontas  ',
  'acentuação e emoji 🚀',
  '%PATH% & | < > ^',
]

test('quoteWindowsArg não cita um argumento simples e cita os que precisam', () => {
  assert.equal(quoteWindowsArg('--cloud'), '--cloud')
  assert.equal(quoteWindowsArg('com espaço'), '"com espaço"')
  assert.equal(quoteWindowsArg(''), '""')
  assert.equal(quoteWindowsArg('a"b'), '"a\\"b"')
  assert.equal(quoteWindowsArg('fim\\'), 'fim\\')
  assert.equal(quoteWindowsArg('fim com espaço\\'), '"fim com espaço\\\\"')
})

test('a linha montada volta idêntica ao argv pelo parser do Windows, mesmo com aspas nas pontas', () => {
  for (const texto of TRICKY) {
    const line = buildWindowsCommandLine(['--cloud', texto, 'depois'])

    assert.deepEqual(
      parseWindowsCommandLine(line),
      ['--cloud', texto, 'depois'],
      `falhou para ${JSON.stringify(texto)} -> ${line}`,
    )
  }
})

test(
  'no Windows de verdade, o parser do sistema devolve cada argumento exatamente como foi montado',
  { skip: process.platform !== 'win32' },
  () => {
    const script = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))'
    for (const texto of TRICKY) {
      // `windowsVerbatimArguments` faz o Node juntar os itens com espaço sem
      // citar nada: o que o processo recebe é só a nossa montagem.
      const montado = ['-e', script, '--', '--cloud', texto, 'depois'].map(quoteWindowsArg)
      const result = spawnSync(process.execPath, montado, {
        windowsVerbatimArguments: true,
        // O executável também precisa de aspas: o caminho do Node pode ter espaço.
        argv0: quoteWindowsArg(process.execPath),
        encoding: 'utf8',
      })

      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(JSON.parse(result.stdout), ['--cloud', texto, 'depois'], JSON.stringify(texto))
    }
  },
)

// --- Shell POSIX (macOS): o texto viaja por variável de ambiente -------------

const { buildPosixExecLine } = require('./cloud-session-command-line.cjs')

const POSIX_TRICKY = [
  'simples',
  'com espaço',
  '',
  "aspas ' simples",
  'aspas " duplas',
  '$(echo pwned)',
  '`echo pwned`',
  '${HOME}',
  '$HOME e $((1+1))',
  'a;b&c|d>e<f',
  'linha 1\nlinha 2\n',
  'tab\tcom\\barra\\',
  '*?[x] ~/y',
  '  pontas  ',
  'acentuação e emoji 🚀',
  '-- não é opção --',
]

const aspasSimples = (text) => `'${text.replace(/'/g, "'\\''")}'`

test('buildPosixExecLine referencia cada argumento por variável entre aspas duplas', () => {
  assert.equal(
    buildPosixExecLine("'claude'", 3),
    'exec \'claude\' "${FELIXO_ARG_0}" "${FELIXO_ARG_1}" "${FELIXO_ARG_2}"',
  )
  assert.equal(buildPosixExecLine('claude', 0), 'exec claude')
})

test(
  'num shell POSIX de verdade, cada argumento chega intacto, sem reinterpretar $, crase, aspas nem quebra de linha',
  { skip: process.platform === 'win32' },
  () => {
    const script = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))'
    for (const texto of POSIX_TRICKY) {
      const comando = `${aspasSimples(process.execPath)} -e ${aspasSimples(script)} --`
      const result = spawnSync('sh', ['-c', buildPosixExecLine(comando, 2)], {
        env: { ...process.env, FELIXO_ARG_0: '--cloud', FELIXO_ARG_1: texto },
        encoding: 'utf8',
      })

      assert.equal(result.status, 0, result.stderr)
      assert.deepEqual(JSON.parse(result.stdout), ['--cloud', texto], JSON.stringify(texto))
    }
  },
)
