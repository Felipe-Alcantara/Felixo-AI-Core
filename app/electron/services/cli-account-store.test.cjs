'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createCliAccountStore } = require('./cli-account-store.cjs')

/** `safeStorage` de mentira, com o backend configurável pelo teste. */
function fakeSafeStorage(backend = 'kwallet') {
  return {
    isEncryptionAvailable: () => backend !== 'indisponivel',
    getSelectedStorageBackend: () => backend,
    // Cifra de brinquedo: o teste só precisa distinguir "guardado" de "texto".
    encryptString: (texto) => Buffer.from(`cifrado:${texto}`, 'utf8'),
    decryptString: (buffer) => buffer.toString('utf8').replace(/^cifrado:/, ''),
  }
}

function createEnvironment({ backend = 'kwallet', comHome = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-contas-'))
  const userData = path.join(root, 'userData')
  const homeDir = path.join(root, 'home')

  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(homeDir, { recursive: true })

  if (comHome) {
    fs.writeFileSync(path.join(homeDir, '.gitconfig'), '[user]\n  name = Pessoa\n', 'utf8')
    fs.mkdirSync(path.join(homeDir, '.ssh'), { recursive: true })
    fs.writeFileSync(path.join(homeDir, '.ssh', 'config'), 'Host *\n', 'utf8')
  }

  return {
    root,
    userData,
    homeDir,
    store: createCliAccountStore({
      userData,
      homeDir,
      safeStorage: fakeSafeStorage(backend),
    }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('cada conta ganha a própria pasta de login, vazia', () => {
  const env = createEnvironment()

  try {
    const pessoal = env.store.create({ providerId: 'codex', label: 'pessoal' })
    const trabalho = env.store.create({ providerId: 'codex', label: 'trabalho' })

    const dirPessoal = path.join(env.userData, 'cli-profiles', 'codex', pessoal.id)
    const dirTrabalho = path.join(env.userData, 'cli-profiles', 'codex', trabalho.id)

    assert.equal(fs.existsSync(dirPessoal), true)
    assert.equal(fs.existsSync(dirTrabalho), true)
    assert.notEqual(dirPessoal, dirTrabalho)
    // Vazia de propósito: o login é feito pela CLI, no terminal.
    assert.deepEqual(fs.readdirSync(dirPessoal), [])
  } finally {
    env.cleanup()
  }
})

test('o ambiente do terminal aponta para a conta escolhida', () => {
  const env = createEnvironment()

  try {
    const conta = env.store.create({ providerId: 'codex', label: 'pessoal' })
    const outra = env.store.create({ providerId: 'codex', label: 'trabalho' })

    assert.notEqual(
      env.store.buildEnv(conta.id).CODEX_HOME,
      env.store.buildEnv(outra.id).CODEX_HOME,
    )
    assert.match(env.store.buildEnv(conta.id).CODEX_HOME, new RegExp(conta.id))
  } finally {
    env.cleanup()
  }
})

test('conta inexistente não força ambiente nenhum', () => {
  const env = createEnvironment()

  try {
    assert.deepEqual(env.store.buildEnv('nao-existe'), {})
    // O terminal sem conta continua usando o login do sistema, mesmo quando
    // o PTY já inferiu o provedor do comando.
    assert.deepEqual(env.store.buildEnv(undefined, 'claude'), {})
  } finally {
    env.cleanup()
  }
})

test('valida a conta contra o provedor antes de montar o ambiente', () => {
  const env = createEnvironment()

  try {
    const conta = env.store.create({ providerId: 'codex', label: 'pessoal' })

    assert.deepEqual(env.store.validateAccount(conta.id, 'codex'), {
      ok: true,
      account: conta,
    })
    assert.deepEqual(env.store.validateAccount(conta.id, 'claude'), {
      ok: false,
      message: 'A conta selecionada pertence a outro provedor.',
    })
    assert.throws(
      () => env.store.buildEnv(conta.id, 'claude'),
      /outro provedor/,
    )
  } finally {
    env.cleanup()
  }
})

test('perfil com HOME próprio recebe git e ssh espelhados da home real', () => {
  // Sem isso, o terminal do Gemini perderia identidade do git e chave ssh.
  const env = createEnvironment({ comHome: true })

  try {
    const conta = env.store.create({ providerId: 'gemini', label: 'pessoal' })
    const dir = path.join(env.userData, 'cli-profiles', 'gemini', conta.id)

    assert.equal(fs.existsSync(path.join(dir, '.gitconfig')), true)
    assert.equal(fs.existsSync(path.join(dir, '.ssh', 'config')), true)
    assert.equal(env.store.buildEnv(conta.id).HOME, dir)
  } finally {
    env.cleanup()
  }
})

test('remover a conta apaga a pasta de login junto', () => {
  // Deixar pasta órfã com token válido é pior que perder o login.
  const env = createEnvironment()

  try {
    const conta = env.store.create({ providerId: 'claude', label: 'pessoal' })
    const dir = path.join(env.userData, 'cli-profiles', 'claude', conta.id)
    fs.writeFileSync(path.join(dir, '.credentials.json'), '{"token":"x"}', 'utf8')

    assert.equal(env.store.remove(conta.id), true)
    assert.equal(fs.existsSync(dir), false)
    assert.deepEqual(env.store.list('claude'), [])
  } finally {
    env.cleanup()
  }
})

test('a chave do Openia é guardada cifrada e chega ao ambiente', () => {
  const env = createEnvironment()

  try {
    const conta = env.store.create({ providerId: 'openia', label: 'pessoal' })
    env.store.setSecret(conta.id, 'sk-or-chave-de-teste')

    assert.equal(
      env.store.buildEnv(conta.id).OPENROUTER_API_KEY,
      'sk-or-chave-de-teste',
    )

    // No disco não pode haver a chave em texto.
    const bruto = fs.readFileSync(
      path.join(env.userData, 'config', 'cli-account-secrets.bin'),
      'utf8',
    )
    assert.doesNotMatch(bruto, /^sk-or-chave-de-teste$/m)
    assert.match(bruto, /^cifrado:/)
  } finally {
    env.cleanup()
  }
})

test('lista somente o estado da chave do Openia, nunca a chave', () => {
  const env = createEnvironment()

  try {
    const comChave = env.store.create({ providerId: 'openia', label: 'com chave' })
    const semChave = env.store.create({ providerId: 'openia', label: 'sem chave' })
    env.store.setSecret(comChave.id, 'sk-or-segredo-da-conta')

    const contas = env.store.list('openia')
    assert.equal(contas.find((conta) => conta.id === comChave.id)?.secretConfigured, true)
    assert.equal(contas.find((conta) => conta.id === semChave.id)?.secretConfigured, false)
    assert.doesNotMatch(JSON.stringify(contas), /sk-or-segredo-da-conta/)
  } finally {
    env.cleanup()
  }
})

test('a barreira aceita Openia com chave e recusa conta sem chave', () => {
  const env = createEnvironment()

  try {
    const semChave = env.store.create({ providerId: 'openia', label: 'sem chave' })
    const comChave = env.store.create({ providerId: 'openia', label: 'com chave' })

    assert.deepEqual(env.store.validateAccount(semChave.id, 'openia'), {
      ok: false,
      message: 'A conta do Openia não tem uma chave configurada.',
    })

    env.store.setSecret(comChave.id, 'sk-or-chave-de-teste')
    assert.deepEqual(env.store.validateAccount(comChave.id, 'openia'), {
      ok: true,
      account: comChave,
    })
  } finally {
    env.cleanup()
  }
})

test('sem chaveiro real, gravar a chave é recusado em vez de salvar em texto', () => {
  const env = createEnvironment({ backend: 'basic' })

  try {
    const conta = env.store.create({ providerId: 'openia', label: 'pessoal' })

    assert.equal(env.store.canStoreSecret().ok, false)
    assert.throws(
      () => env.store.setSecret(conta.id, 'sk-or-chave'),
      /chaveiro/,
    )
    assert.equal(
      fs.existsSync(path.join(env.userData, 'config', 'cli-account-secrets.bin')),
      false,
    )
  } finally {
    env.cleanup()
  }
})

test('remover a conta do Openia esquece a chave dela', () => {
  const env = createEnvironment()

  try {
    const conta = env.store.create({ providerId: 'openia', label: 'pessoal' })
    const outra = env.store.create({ providerId: 'openia', label: 'trabalho' })
    env.store.setSecret(conta.id, 'sk-uma')
    env.store.setSecret(outra.id, 'sk-outra')

    env.store.remove(conta.id)

    assert.deepEqual(env.store.buildEnv(conta.id), {})
    // A chave da outra conta continua valendo.
    assert.equal(env.store.buildEnv(outra.id).OPENROUTER_API_KEY, 'sk-outra')
  } finally {
    env.cleanup()
  }
})

test('CLI sem suporte a perfil recusa criar conta', () => {
  const env = createEnvironment()

  try {
    assert.throws(
      () => env.store.create({ providerId: 'inexistente', label: 'x' }),
      /não aceita mais de uma conta/,
    )
    assert.throws(
      () => env.store.create({ providerId: 'codex', label: '  ' }),
      /Informe um nome/,
    )
  } finally {
    env.cleanup()
  }
})
