const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createCloneArgs,
  parseMarkdownTitleAndSummary,
  syncSystemDesignRepository,
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

test('sync usa URL sanitizada e propaga apenas erro Git redigido', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-service-'))
  const token = `ghp_${'e'.repeat(30)}`
  const repoUrl = `https://deploy:${token}@github.com/acme/private.git?token=${token}`
  const calls = []
  const gitError = new Error(
    `Command failed: git clone ${repoUrl} repo\nfatal: token=${token}`,
  )
  gitError.code = 128
  gitError.stderr = `fatal: Authentication failed for '${repoUrl}'\nAuthorization: Bearer ${token}`

  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))

  await assert.rejects(
    syncSystemDesignRepository({
      repoUrl,
      branch: 'main',
      cacheDir,
      repository: { save() {}, deleteMissing() { return 0 } },
      executeGit: async (command, args, options) => {
        calls.push({ command, args, options })
        throw gitError
      },
    }),
    (error) => {
      assert.equal(error.name, 'GitSyncError')
      assert.match(error.message, /Falha no Git durante clone/)
      assert.match(error.message, /Código: 128/)
      assert.doesNotMatch(error.message, new RegExp(token))
      assert.doesNotMatch(error.message, /Command failed: git clone/)
      return true
    },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'git')
  assert.deepEqual(calls[0].args, [
    'clone',
    '--depth',
    '1',
    '--branch',
    'main',
    '--',
    'https://github.com/acme/private.git',
    'repo',
  ])
})
