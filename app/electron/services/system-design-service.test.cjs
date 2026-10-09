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

// ---------------------------------------------------------------------------
// Guia privado (09/10/2026): o Git só pode PEDIR login quando a pessoa clicou.
// Sem clique, nem terminal, nem janela do Git Credential Manager: a falha volta
// na hora, com o motivo, e o cache que já existia fica.
// ---------------------------------------------------------------------------

function captureGitCalls({ failWith } = {}) {
  const calls = []
  const executeGit = async (command, args, options) => {
    calls.push({ args, options })
    if (failWith && failWith(args)) {
      const error = new Error('Command failed')
      error.code = 128
      error.stderr = failWith(args)
      throw error
    }
    if (args[0] === 'clone') {
      const target = path.join(options.cwd, args[args.length - 1])
      fs.mkdirSync(path.join(target, '.git'), { recursive: true })
    }
    if (args[0] === 'remote') return { stdout: 'https://github.com/acme/privado.git\n' }
    if (args[0] === 'rev-parse') return { stdout: `${'a'.repeat(40)}\n` }
    return { stdout: '' }
  }
  return { executeGit, calls }
}

test('sem clique, o Git roda sem poder pedir login e com o prazo curto', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-env-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  const { executeGit, calls } = captureGitCalls()

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/privado.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
  })

  assert.ok(calls.length > 0)
  for (const call of calls) {
    assert.equal(call.options.env.GIT_TERMINAL_PROMPT, '0')
    assert.equal(call.options.env.GCM_INTERACTIVE, 'never')
    assert.equal(call.options.env.SSH_ASKPASS_REQUIRE, 'never')
    assert.equal(call.options.timeout, 60_000)
  }
})

test('com clique, a janela de login pode abrir e o prazo é maior', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-env-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  const { executeGit, calls } = captureGitCalls()

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/privado.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
    interactive: true,
  })

  for (const call of calls) {
    assert.equal(call.options.env.GIT_TERMINAL_PROMPT, '0')
    assert.equal(call.options.env.GCM_INTERACTIVE, process.env.GCM_INTERACTIVE)
    assert.equal(call.options.timeout, 180_000)
  }
})

test('o erro redigido leva o motivo da falha, e nada do stderr além do diagnóstico', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-reason-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  const { executeGit } = captureGitCalls({
    failWith: (args) => args[0] === 'clone' && "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
  })

  await assert.rejects(
    syncSystemDesignRepository({
      repoUrl: 'https://github.com/acme/privado.git',
      branch: 'main',
      cacheDir,
      repository: noopRepository,
      executeGit,
    }),
    (error) => {
      assert.equal(error.isRedactedGitError, true)
      assert.equal(error.reason, 'login')
      return true
    },
  )
})

test('fetch que falha por login mantém o clone em cache e não tenta clonar de novo', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-keep-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  const repoPath = seedExistingClone(cacheDir)
  const { executeGit, calls } = captureGitCalls({
    failWith: (args) => args[0] === 'fetch' && 'fatal: Cannot prompt because user interactivity has been disabled.',
  })

  await assert.rejects(
    syncSystemDesignRepository({
      repoUrl: 'https://github.com/acme/privado.git',
      branch: 'main',
      cacheDir,
      repository: noopRepository,
      executeGit,
    }),
    (error) => error.reason === 'login',
  )

  assert.ok(fs.existsSync(path.join(repoPath, 'antigo.md')), 'o conteúdo anterior continua no cache')
  assert.ok(!calls.some((call) => call.args[0] === 'clone'), 'sem re-clone que falharia igual')
})

test('fetch que falha por outro motivo ainda tenta o re-clone (comportamento de antes)', async (t) => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-reclone-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  seedExistingClone(cacheDir)
  const { executeGit, calls } = captureGitCalls({
    failWith: (args) => args[0] === 'fetch' && 'fatal: shallow file has changed since we read it',
  })

  await syncSystemDesignRepository({
    repoUrl: 'https://github.com/acme/privado.git',
    branch: 'main',
    cacheDir,
    repository: noopRepository,
    executeGit,
  })

  assert.ok(calls.some((call) => call.args[0] === 'clone'))
})

function gitIsInstalled() {
  try {
    require('node:child_process').execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Git de verdade contra um servidor local que exige senha: é o que um guia
// privado faz. Roda na CI de Linux, macOS e Windows — e no Windows da CI o Git
// vem com o Git Credential Manager, a janela que não pode abrir sem clique.
test('git real: repositório que pede senha falha em segundos sem clique, com motivo login', { skip: !gitIsInstalled() && 'git não instalado', timeout: 45_000 }, async (t) => {
  const http = require('node:http')
  let requests = 0
  const server = http.createServer((_request, response) => {
    requests += 1
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="guia privado"', 'Content-Type': 'text/plain' })
    response.end('login necessário')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-system-design-401-'))
  t.after(() => {
    server.close()
    fs.rmSync(cacheDir, { recursive: true, force: true })
  })

  const startedAt = Date.now()
  await assert.rejects(
    syncSystemDesignRepository({
      repoUrl: `http://127.0.0.1:${server.address().port}/acme/privado.git`,
      branch: 'main',
      cacheDir,
      repository: noopRepository,
    }),
    (error) => {
      assert.equal(error.reason, 'login', error.message)
      return true
    },
  )
  const elapsed = Date.now() - startedAt

  assert.ok(requests > 0, 'o Git chegou a pedir o repositório')
  assert.ok(elapsed < 30_000, `falhou em ${elapsed} ms, sem esperar login`)
})
