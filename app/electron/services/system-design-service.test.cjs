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

// ---------------------------------------------------------------------------
// Clone já existente: só vale se o `origin` dele for a fonte pedida.
// Medido no app real (21/09/2026): trocar a URL configurada não trocava de
// repositório — o `fetch`/`reset` rodava no clone da fonte ANTIGA e o resultado
// era gravado como se fosse da nova.
// ---------------------------------------------------------------------------

function createFakeGit({ originUrl, originFails = false }) {
  const calls = []
  const executeGit = async (command, args, options) => {
    calls.push({ args, cwd: options.cwd })
    const verb = args[0]

    if (verb === 'remote') {
      if (originFails) throw new Error('fatal: No such remote origin')
      return { stdout: `${originUrl}\n` }
    }
    if (verb === 'clone') {
      const target = path.join(options.cwd, args[args.length - 1])
      fs.mkdirSync(path.join(target, '.git'), { recursive: true })
      fs.writeFileSync(path.join(target, 'guia.md'), '# Guia\n\nTexto.\n')
      return { stdout: '' }
    }
    if (verb === 'rev-parse') return { stdout: `${'f'.repeat(40)}\n` }
    return { stdout: '' }
  }
  return { executeGit, calls }
}

function seedExistingClone(cacheDir) {
  const repoPath = path.join(cacheDir, 'repo')
  fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true })
  fs.writeFileSync(path.join(repoPath, 'antigo.md'), '# Da fonte antiga\n')
  return repoPath
}

const noopRepository = { save() {}, deleteMissing() { return 0 } }

test('clone existente de OUTRA fonte é descartado e a fonte pedida é clonada', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-origin-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  const repoPath = seedExistingClone(cacheDir)
  const { executeGit, calls } = createFakeGit({
    originUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
  })

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/padroes.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
  })

  const verbs = calls.map((call) => call.args[0])
  assert.ok(verbs.includes('clone'), 'deveria clonar a fonte pedida')
  assert.ok(!verbs.includes('fetch'), 'não pode dar fetch no origin antigo')
  assert.ok(!verbs.includes('reset'), 'não pode dar reset a partir do origin antigo')
  assert.ok(
    calls.find((call) => call.args[0] === 'clone').args.includes('https://github.com/acme/padroes.git'),
  )
  assert.equal(fs.existsSync(path.join(repoPath, 'antigo.md')), false, 'o conteúdo da fonte antiga sumiu')
  assert.equal(fs.existsSync(path.join(repoPath, 'guia.md')), true)
})

test('clone existente da MESMA fonte só atualiza (fetch + reset), sem re-clonar', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-origin-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  seedExistingClone(cacheDir)
  // Mesma fonte escrita de outro jeito: sem .git, host em maiúsculas, barra final.
  const { executeGit, calls } = createFakeGit({ originUrl: 'https://GitHub.com/acme/padroes/' })

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/padroes.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
  })

  const verbs = calls.map((call) => call.args[0])
  assert.ok(verbs.includes('fetch'))
  assert.ok(verbs.includes('reset'))
  assert.ok(!verbs.includes('clone'), 'a mesma fonte não deve ser re-clonada')
})

test('não conseguir ler o origin do clone existente é tratado como fonte desconhecida (re-clona)', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-origin-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  seedExistingClone(cacheDir)
  const { executeGit, calls } = createFakeGit({ originUrl: '', originFails: true })

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/padroes.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
  })

  const verbs = calls.map((call) => call.args[0])
  assert.ok(verbs.includes('clone'))
  assert.ok(!verbs.includes('fetch'))
})

test('a credencial do origin gravado não vaza para o resultado da comparação', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-origin-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  seedExistingClone(cacheDir)
  // Clone antigo feito com credencial na URL: ainda é a mesma fonte.
  const { executeGit, calls } = createFakeGit({
    originUrl: 'https://usuario:SEGREDO123@github.com/acme/padroes.git',
  })

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/padroes.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
  })

  assert.ok(calls.some((call) => call.args[0] === 'fetch'), 'mesma fonte apesar da credencial')
})
