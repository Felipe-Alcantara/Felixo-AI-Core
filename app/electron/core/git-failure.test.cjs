const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  GIT_FAILURE,
  GIT_INTERACTIVE_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  classifyGitFailure,
  describeGitFailure,
  gitEnvironment,
  gitTimeoutMs,
} = require('./git-failure.cjs')

describe('gitEnvironment', () => {
  it('sem clique: nem terminal, nem janela do Git Credential Manager, nem askpass do SSH', () => {
    const env = gitEnvironment({ interactive: false, baseEnv: { PATH: '/bin' } })
    assert.equal(env.GIT_TERMINAL_PROMPT, '0')
    assert.equal(env.GCM_INTERACTIVE, 'never')
    assert.equal(env.SSH_ASKPASS_REQUIRE, 'never')
    assert.equal(env.PATH, '/bin')
  })

  it('com clique: a janela de login pode abrir, mas o terminal invisível continua fechado', () => {
    const env = gitEnvironment({ interactive: true, baseEnv: { PATH: '/bin' } })
    assert.equal(env.GIT_TERMINAL_PROMPT, '0')
    assert.equal('GCM_INTERACTIVE' in env, false)
    assert.equal('SSH_ASKPASS_REQUIRE' in env, false)
  })

  it('com clique, respeita uma configuração do Git Credential Manager que a pessoa já tinha', () => {
    const env = gitEnvironment({ interactive: true, baseEnv: { GCM_INTERACTIVE: 'never' } })
    assert.equal(env.GCM_INTERACTIVE, 'never')
  })

  it('não altera o ambiente recebido', () => {
    const baseEnv = { PATH: '/bin' }
    gitEnvironment({ interactive: false, baseEnv })
    assert.deepEqual(baseEnv, { PATH: '/bin' })
  })
})

describe('gitTimeoutMs', () => {
  it('dá mais tempo quando a pessoa pode estar fazendo login', () => {
    assert.equal(gitTimeoutMs(false), GIT_TIMEOUT_MS)
    assert.equal(gitTimeoutMs(true), GIT_INTERACTIVE_TIMEOUT_MS)
    assert.ok(GIT_INTERACTIVE_TIMEOUT_MS > GIT_TIMEOUT_MS)
  })
})

describe('classifyGitFailure', () => {
  const failure = (stderr, extra = {}) => ({ code: 128, stderr, ...extra })

  it('prazo estourado (execFile mata com SIGTERM) é timeout', () => {
    assert.equal(classifyGitFailure({ killed: true, signal: 'SIGTERM', stderr: '' }), GIT_FAILURE.TIMEOUT)
    assert.equal(classifyGitFailure({ code: 'ETIMEDOUT' }), GIT_FAILURE.TIMEOUT)
  })

  it('pedido de login que não pôde ser feito é login', () => {
    const cases = [
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      'fatal: Cannot prompt because user interactivity has been disabled.',
      "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/acme/x.git/'",
      'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
      'Host key verification failed.\nfatal: Could not read from remote repository.',
      "fatal: could not read Password for 'https://acme@example.com': No such device or address",
    ]
    for (const stderr of cases) {
      assert.equal(classifyGitFailure(failure(stderr)), GIT_FAILURE.LOGIN, stderr)
    }
  })

  it('repositório inexistente (ou sem acesso, com login feito) é not-found', () => {
    assert.equal(
      classifyGitFailure(failure("remote: Repository not found.\nfatal: repository 'https://github.com/acme/x.git/' not found")),
      GIT_FAILURE.NOT_FOUND,
    )
    assert.equal(classifyGitFailure(failure('ERROR: Repository not found.')), GIT_FAILURE.NOT_FOUND)
  })

  it('branch que não existe é branch', () => {
    assert.equal(
      classifyGitFailure(failure('warning: Could not find remote branch nada to clone.\nfatal: Remote branch nada not found in upstream origin')),
      GIT_FAILURE.BRANCH,
    )
  })

  it('sem rede é network', () => {
    const cases = [
      "fatal: unable to access 'https://github.com/acme/x.git/': Could not resolve host: github.com",
      "fatal: unable to access 'https://example.com/x.git/': Failed to connect to example.com port 443",
      'ssh: Could not resolve hostname github.com: Temporary failure in name resolution',
    ]
    for (const stderr of cases) {
      assert.equal(classifyGitFailure(failure(stderr)), GIT_FAILURE.NETWORK, stderr)
    }
  })

  it('o resto é other, e erro sem nada também', () => {
    assert.equal(classifyGitFailure(failure('fatal: destination path already exists')), GIT_FAILURE.OTHER)
    assert.equal(classifyGitFailure(null), GIT_FAILURE.OTHER)
    assert.equal(classifyGitFailure({}), GIT_FAILURE.OTHER)
  })
})

describe('describeGitFailure', () => {
  it('sem clique, login explica o que fazer: conferir o endereço ou sincronizar para entrar', () => {
    const text = describeGitFailure(GIT_FAILURE.LOGIN, { interactive: false })
    assert.match(text, /pede login/)
    assert.match(text, /endereço/)
    assert.match(text, /Sincronizar/)
  })

  it('com clique, login diz que o login não foi concluído', () => {
    assert.match(describeGitFailure(GIT_FAILURE.LOGIN, { interactive: true }), /login não foi concluído/)
  })

  it('timeout diz o prazo de cada caso', () => {
    assert.match(describeGitFailure(GIT_FAILURE.TIMEOUT, { interactive: false }), /60 s/)
    assert.match(describeGitFailure(GIT_FAILURE.TIMEOUT, { interactive: true }), /180 s/)
  })

  it('cada motivo conhecido tem frase; other não tem', () => {
    for (const reason of [GIT_FAILURE.NOT_FOUND, GIT_FAILURE.BRANCH, GIT_FAILURE.NETWORK]) {
      assert.ok(describeGitFailure(reason).length > 20, reason)
    }
    assert.equal(describeGitFailure(GIT_FAILURE.OTHER), null)
  })
})
