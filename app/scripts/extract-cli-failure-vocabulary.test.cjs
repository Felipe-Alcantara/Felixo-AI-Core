'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const extractor = require('./extract-cli-failure-vocabulary.cjs')

function withTempDir(action) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-vocabulario-'))
  try {
    return action(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function tinyVocabulary() {
  return {
    schemaVersion: 1,
    providers: {
      claude: {
        package: '@anthropic-ai/claude-code',
        version: '1.0.0',
        scannedFiles: [],
        phrases: [
          {
            id: 'claude.limit.a',
            kind: 'include',
            failureClass: 'limit',
            scope: 'account',
            terminal: true,
            literals: ['Usage limit reached · continuing'],
            example: 'Usage limit reached · continuing automatically at 4pm',
            inPackage: true,
            note: 'curado à mão',
          },
          {
            id: 'claude.exclude.b',
            kind: 'exclude',
            terminal: true,
            literals: ['Fast limit reached'],
            example: 'Fast limit reached and temporarily disabled',
            inPackage: true,
          },
        ],
      },
    },
  }
}

test('um trecho é procurado em UTF-8, Latin-1, UTF-16 e na forma escapada do JS', () => {
  const variants = extractor.encodeLiteralVariants('limit · x').map((buffer) => buffer.toString('latin1'))

  assert.ok(variants.includes('limit \xc2\xb7 x'), 'UTF-8')
  assert.ok(variants.includes('limit \xb7 x'), 'Latin-1 (executável Bun)')
  assert.ok(variants.includes('limit \\xB7 x'), 'escape \\xB7 no código-fonte')
  assert.ok(variants.includes('limit \\u00b7 x'), 'escape \\u00b7')
  assert.ok(variants.some((variant) => variant.startsWith('l\x00i\x00')), 'UTF-16LE')

  const curly = extractor.encodeLiteralVariants('You’ve').map((buffer) => buffer.toString('latin1'))
  assert.ok(curly.includes('You\\u2019ve'))
  assert.equal(
    curly.some((variant) => variant === 'You\x19ve'),
    false,
    'U+2019 não cabe em Latin-1: não pode virar um byte truncado',
  )
})

test('acha os trechos num buffer sintético, em qualquer codificação, e só eles', () => {
  const buffer = Buffer.concat([
    Buffer.from([0x00, 0xff, 0x13, 0x37]),
    Buffer.from('xxUsage limit reached \xb7 continuing yy', 'latin1'),
    Buffer.from('var a="Not logged in \\xB7 Please run /login";', 'utf8'),
    Buffer.from('You’ve hit your usage limit.', 'utf8'),
    Buffer.from([0x00, 0x00]),
  ])

  const found = extractor.findLiteralsInBuffer(buffer, [
    'Usage limit reached · continuing',
    'Not logged in · Please run /login',
    'You’ve hit your usage limit.',
    'Credit balance is too low',
  ])

  assert.deepEqual([...found].sort(), [
    'Not logged in · Please run /login',
    'Usage limit reached · continuing',
    'You’ve hit your usage limit.',
  ])
})

test('a leitura em pedaços acha trecho cortado na fronteira, mas não costura dois arquivos', () => {
  withTempDir((dir) => {
    const chunkBytes = 64
    const literal = 'Credit balance is too low'
    const straddling = path.join(dir, 'fronteira.bin')
    // O trecho começa 10 bytes antes do fim do primeiro pedaço.
    fs.writeFileSync(straddling, Buffer.concat([
      Buffer.alloc(chunkBytes - 10, 0x2e),
      Buffer.from(literal, 'utf8'),
      Buffer.alloc(200, 0x2e),
    ]))

    assert.deepEqual(
      [...extractor.scanFilesForLiterals([straddling], [literal], { chunkBytes })],
      [literal],
    )

    const first = path.join(dir, 'a.bin')
    const second = path.join(dir, 'b.bin')
    fs.writeFileSync(first, Buffer.from('....Credit balance', 'utf8'))
    fs.writeFileSync(second, Buffer.from(' is too low....', 'utf8'))
    assert.equal(
      extractor.scanFilesForLiterals([first, second], [literal], { chunkBytes }).size,
      0,
    )
  })
})

test('a leitura do provedor grava versão, arquivos relativos e presença por frase', () => {
  withTempDir((dir) => {
    const base = path.join(dir, 'node_modules')
    const binary = path.join(base, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    fs.mkdirSync(path.dirname(binary), { recursive: true })
    fs.writeFileSync(binary, Buffer.from('zzUsage limit reached \xb7 continuing zz', 'latin1'))

    const vocabulary = tinyVocabulary()
    const result = extractor.scanProvider('claude', vocabulary.providers.claude, {
      locators: { claude: () => ({ base, version: '2.0.0', files: [binary] }) },
    })

    assert.equal(result.status, 'ok')
    assert.deepEqual(result.scannedFiles, ['@anthropic-ai/claude-code/bin/claude.exe'])
    assert.deepEqual(result.phrasesInPackage, { 'claude.limit.a': true, 'claude.exclude.b': false })

    const next = extractor.applyScanResults(vocabulary, [result])
    const [limit, exclude] = next.providers.claude.phrases
    assert.equal(next.providers.claude.version, '2.0.0')
    assert.equal(limit.inPackage, true)
    assert.equal(exclude.inPackage, false)
    assert.equal(limit.note, 'curado à mão', 'campos curados não mudam')
    assert.equal(vocabulary.providers.claude.version, '1.0.0', 'a fixture original não é mutada')

    assert.deepEqual(extractor.diffScanResults(vocabulary, [result]), [
      'claude: versão registrada 1.0.0, instalada 2.0.0',
      'claude.exclude.b: registrada como presente, ausente no pacote',
    ])
  })
})

test('provedor sem pacote fica como estava e não conta como divergência', () => {
  const vocabulary = tinyVocabulary()
  const result = extractor.scanProvider('claude', vocabulary.providers.claude, {
    locators: { claude: () => null },
  })

  assert.deepEqual(result, { providerId: 'claude', status: 'ausente' })
  assert.deepEqual(extractor.applyScanResults(vocabulary, [result]), vocabulary)
  assert.deepEqual(extractor.diffScanResults(vocabulary, [result]), [])
  assert.match(extractor.formatScanReport(vocabulary, [result]), /não encontrado; pulado/)
})

test('a validação recusa fixture malformada, com segredo ou com caminho da máquina', () => {
  assert.deepEqual(extractor.validateVocabulary(tinyVocabulary()), [])

  const broken = tinyVocabulary()
  broken.providers.claude.phrases[0].failureClass = 'rede'
  broken.providers.claude.phrases[1].example = 'outra coisa'
  broken.providers.claude.phrases[1].scope = 'account'
  const problems = extractor.validateVocabulary(broken).join('\n')
  assert.match(problems, /failureClass inválida/)
  assert.match(problems, /não contém o trecho "Fast limit reached"/)
  assert.match(problems, /só inclusão tem failureClass e scope/)

  const leaky = tinyVocabulary()
  leaky.providers.claude.phrases[0].note = 'chave sk-abcdefghijklmnop'
  assert.match(extractor.validateVocabulary(leaky).join(), /formato de segredo/)

  const local = tinyVocabulary()
  local.providers.claude.scannedFiles = ['/home/alguem/.nvm/claude.exe']
  assert.match(extractor.validateVocabulary(local).join(), /caminho absoluto/)
})

test('a fixture versionada é válida, sem segredo e cobre os quatro provedores', () => {
  const vocabulary = JSON.parse(fs.readFileSync(extractor.FIXTURE_PATH, 'utf8'))

  assert.deepEqual(extractor.validateVocabulary(vocabulary), [])
  assert.deepEqual(Object.keys(vocabulary.providers).sort(), ['claude', 'codex', 'gemini', 'openia'])
  assert.equal(vocabulary.providers.openia.phrases.length, 0, 'Openia não tem frase própria (fail-closed)')

  for (const provider of Object.values(vocabulary.providers)) {
    for (const phrase of provider.phrases) {
      assert.equal(phrase.inPackage, true, `${phrase.id} deveria estar no pacote da versão registrada`)
    }
  }
})

test('os argumentos são só --write, --npm-root e --openia-dir', () => {
  assert.deepEqual(extractor.parseArgs([]), { write: false, npmRoot: null, openiaDir: null })
  assert.deepEqual(extractor.parseArgs(['--write', '--npm-root=/x', '--openia-dir=/y']), {
    write: true,
    npmRoot: '/x',
    openiaDir: '/y',
  })
  assert.throws(() => extractor.parseArgs(['--qualquer']), /desconhecido/)
})
