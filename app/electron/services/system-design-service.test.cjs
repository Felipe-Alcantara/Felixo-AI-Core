const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCloneArgs,
  parseMarkdownTitleAndSummary,
} = require('./system-design-service.cjs')

test('parseMarkdownTitleAndSummary extracts h1 and first paragraph', () => {
  const content = '# Backend Design\n\nPrincipios e padroes para apps backend Felixo.\n\n## Outra seção'
  const result = parseMarkdownTitleAndSummary(content, 'fallback.md')
  assert.equal(result.title, 'Backend Design')
  assert.match(result.summary, /Principios e padroes/)
})

test('parseMarkdownTitleAndSummary uses fallback path when no h1', () => {
  const content = 'Apenas texto sem titulo.\nLinha 2.'
  const result = parseMarkdownTitleAndSummary(content, 'docs/sem-titulo.md')
  assert.equal(result.title, 'docs/sem-titulo.md')
  assert.equal(result.summary, '')
})

test('parseMarkdownTitleAndSummary truncates long summaries', () => {
  const longLine = 'a'.repeat(500)
  const content = `# Titulo\n\n${longLine}`
  const result = parseMarkdownTitleAndSummary(content, 'x.md')
  assert.ok(result.summary.length <= 241)
  assert.ok(result.summary.endsWith('…'))
})

test('os argumentos de clone separam a URL das flags com --', () => {
  // `repoUrl` é configurável pelo renderer (system-design:save-config), então
  // um valor começando com "-" seria lido pelo git como opção em vez de
  // endereço. O separador `--` encerra a lista de flags e garante que o valor
  // seja sempre tratado como repositório.
  const args = createCloneArgs({ repoUrl: '--upload-pack=algo', branch: 'main' })

  const separador = args.indexOf('--')
  assert.notEqual(separador, -1, 'faltou o separador --')
  assert.equal(
    args[separador + 1],
    '--upload-pack=algo',
    'a URL deve vir logo depois do separador',
  )
})

test('os argumentos de clone preservam profundidade e branch', () => {
  const args = createCloneArgs({ repoUrl: 'https://exemplo/repo.git', branch: 'production' })

  assert.deepEqual(args, [
    'clone',
    '--depth',
    '1',
    '--branch',
    'production',
    '--',
    'https://exemplo/repo.git',
    'repo',
  ])
})
