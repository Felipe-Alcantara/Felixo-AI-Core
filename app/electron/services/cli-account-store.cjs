'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const {
  buildProfileEnv,
  getMirrorEntries,
  getProfileDir,
  supportsProfiles,
} = require('./cli-account-profiles.cjs')

/**
 * As contas que a pessoa cadastrou, e a pasta de login de cada uma.
 *
 * O registro guarda só o que é inerte — id, provider, nome dado pela pessoa e
 * data. O login em si nunca passa por aqui: quem escreve na pasta do perfil é
 * a própria CLI, no fluxo de login dela, dentro do terminal.
 *
 * A exceção é o Openia, que não tem pasta de login e sim uma chave de API. Ela
 * é guardada cifrada pelo `safeStorage` do Electron e — decisão explícita —
 * é o único segredo que este app armazena. Se o sistema não oferecer
 * criptografia real, a gravação é recusada em vez de salvar em texto.
 */

const STORE_FILE = 'cli-accounts.json'
const SECRETS_FILE = 'cli-account-secrets.bin'

function createCliAccountStore({
  userData,
  homeDir = os.homedir(),
  fileSystem = fs,
  safeStorage = null,
} = {}) {
  if (!userData) {
    throw new Error('createCliAccountStore requer userData.')
  }

  const storePath = path.join(userData, 'config', STORE_FILE)
  const secretsPath = path.join(userData, 'config', SECRETS_FILE)

  function readStore() {
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(storePath, 'utf8'))
      return Array.isArray(parsed?.accounts) ? parsed.accounts : []
    } catch {
      return []
    }
  }

  function writeStore(accounts) {
    fileSystem.mkdirSync(path.dirname(storePath), { recursive: true })
    fileSystem.writeFileSync(
      storePath,
      `${JSON.stringify({ accounts }, null, 2)}\n`,
      'utf8',
    )
  }

  function list(providerId) {
    const accounts = readStore()
    return providerId
      ? accounts.filter((account) => account.providerId === providerId)
      : accounts
  }

  /**
   * Cria a conta e a pasta de login dela, ainda vazia. O login acontece na
   * primeira vez que um terminal nasce nesse perfil: a CLI percebe que não há
   * credencial e conduz o próprio fluxo, dentro do terminal.
   */
  function create({ providerId, label }) {
    if (!supportsProfiles(providerId)) {
      throw new Error('Esta CLI não aceita mais de uma conta no app.')
    }

    const name = typeof label === 'string' ? label.trim().slice(0, 60) : ''

    if (!name) {
      throw new Error('Informe um nome para a conta.')
    }

    const account = {
      id: randomUUID(),
      providerId,
      label: name,
      createdAt: new Date().toISOString(),
    }

    const profileDir = getProfileDir(userData, providerId, account.id)
    fileSystem.mkdirSync(profileDir, { recursive: true })
    mirrorHomeEntries(providerId, profileDir)

    writeStore([...readStore(), account])

    return account
  }

  /**
   * Remove a conta e apaga a pasta de login dela.
   *
   * Apagar é o certo aqui: o que está lá é credencial daquela conta, e manter
   * pasta órfã com token válido é pior que perder o login. A pessoa refaz o
   * login se recriar a conta.
   */
  function remove(accountId) {
    const accounts = readStore()
    const account = accounts.find((item) => item.id === accountId)

    if (!account) {
      return false
    }

    try {
      fileSystem.rmSync(getProfileDir(userData, account.providerId, account.id), {
        recursive: true,
        force: true,
      })
    } catch {
      // Pasta já removida por fora: seguir e limpar o registro mesmo assim.
    }

    forgetSecret(account.id)
    writeStore(accounts.filter((item) => item.id !== accountId))

    return true
  }

  /**
   * Copia da home real o que um perfil com HOME próprio precisa para o
   * trabalho continuar funcionando: identidade do git, chaves ssh, registro do
   * npm. Cópia, e não link, porque link para `.ssh` fora do controle do app
   * seria uma superfície a mais para vazar credencial por engano.
   */
  function mirrorHomeEntries(providerId, profileDir) {
    for (const entry of getMirrorEntries(providerId)) {
      const origin = path.join(homeDir, entry)
      const target = path.join(profileDir, entry)

      try {
        if (!fileSystem.existsSync(origin) || fileSystem.existsSync(target)) {
          continue
        }

        fileSystem.cpSync(origin, target, { recursive: true })
      } catch {
        // O espelho é conveniência: sem ele o terminal ainda abre, só perde a
        // configuração daquela ferramenta.
      }
    }
  }

  // --- Segredo do Openia -------------------------------------------------

  function readSecrets() {
    if (!safeStorage) {
      return {}
    }

    try {
      const encrypted = fileSystem.readFileSync(secretsPath)
      return JSON.parse(safeStorage.decryptString(encrypted))
    } catch {
      return {}
    }
  }

  function writeSecrets(secrets) {
    fileSystem.mkdirSync(path.dirname(secretsPath), { recursive: true })
    fileSystem.writeFileSync(secretsPath, safeStorage.encryptString(JSON.stringify(secrets)))
  }

  /**
   * Recusa gravar quando o sistema não tem criptografia de verdade.
   *
   * No Linux o `safeStorage` cai num backend `basic`, que apenas ofusca. Uma
   * chave de API gravada assim está, na prática, em texto — melhor recusar e
   * explicar do que dar a impressão de que está protegida.
   */
  function canStoreSecret() {
    if (!safeStorage?.isEncryptionAvailable?.()) {
      return { ok: false, reason: 'O sistema não oferece armazenamento cifrado.' }
    }

    try {
      if (safeStorage.getSelectedStorageBackend?.() === 'basic') {
        return {
          ok: false,
          reason:
            'O sistema está sem chaveiro (backend "basic"): a chave ficaria praticamente em texto. Instale/desbloqueie o chaveiro para usar a conta do Openia por terminal.',
        }
      }
    } catch {
      // Plataforma sem esse método: o isEncryptionAvailable acima já respondeu.
    }

    return { ok: true, reason: null }
  }

  function setSecret(accountId, secret) {
    const permitido = canStoreSecret()

    if (!permitido.ok) {
      throw new Error(permitido.reason)
    }

    if (typeof secret !== 'string' || !secret.trim()) {
      throw new Error('Informe a chave da conta.')
    }

    writeSecrets({ ...readSecrets(), [accountId]: secret.trim() })
  }

  function forgetSecret(accountId) {
    if (!safeStorage) {
      return
    }

    const secrets = readSecrets()

    if (!(accountId in secrets)) {
      return
    }

    delete secrets[accountId]
    writeSecrets(secrets)
  }

  /**
   * Ambiente do terminal para a conta escolhida. O segredo sai daqui direto
   * para o processo filho, sem passar pelo renderer nem por log.
   */
  function buildEnv(accountId) {
    const account = readStore().find((item) => item.id === accountId)

    if (!account) {
      return {}
    }

    return buildProfileEnv({
      providerId: account.providerId,
      profileDir: getProfileDir(userData, account.providerId, account.id),
      secret: readSecrets()[account.id],
      homeDir,
    })
  }

  return {
    buildEnv,
    canStoreSecret,
    create,
    forgetSecret,
    list,
    remove,
    setSecret,
    storePath,
  }
}

module.exports = {
  createCliAccountStore,
}
