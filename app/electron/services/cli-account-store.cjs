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
 *
 * O registro é gravado por arquivo temporário + rename: um app fechado no meio
 * da escrita nunca deixa JSON pela metade. E ausente não é o mesmo que
 * ilegível: sem o arquivo a lista é vazia, mas um arquivo que não dá para ler
 * vira erro tipado (`CLI_ACCOUNTS_STORE_UNREADABLE`). Tratar os dois como
 * "nenhuma conta" fazia a próxima criação sobrescrever o registro inteiro e a
 * interface cair no login do sistema sem avisar.
 *
 * Remover conta é sempre confirmado, e a trava mora aqui (no molde de
 * `switchOfficialCliAccount`): o primeiro pedido só devolve os terminais vivos
 * na conta para a confirmação nomeá-los, e a remoção exige `confirmed === true`
 * cobrindo todos eles. O app não encerra esses terminais (decisão 6: processo
 * vivo nunca troca de conta), mas a pasta de login some debaixo deles.
 */

const STORE_FILE = 'cli-accounts.json'
const SECRETS_FILE = 'cli-account-secrets.bin'
const STORE_UNREADABLE_CODE = 'CLI_ACCOUNTS_STORE_UNREADABLE'
const SECRETS_UNREADABLE_CODE = 'CLI_ACCOUNT_SECRETS_UNREADABLE'

function createStoreUnreadableError() {
  const error = new Error(
    `O registro de contas (${STORE_FILE}) está ilegível. Nada foi alterado para não apagar as contas cadastradas; restaure ou corrija o arquivo e tente de novo.`,
  )
  error.code = STORE_UNREADABLE_CODE
  return error
}

function createSecretsUnreadableError() {
  const error = new Error(
    `O arquivo de chaves das contas (${SECRETS_FILE}) está ilegível — por exemplo, depois de trocar o chaveiro do sistema. Nada foi gravado para não apagar as chaves das outras contas; restaure o arquivo ou o chaveiro e tente de novo.`,
  )
  error.code = SECRETS_UNREADABLE_CODE
  return error
}

/**
 * Grava por arquivo temporário + rename, no mesmo diretório (o rename só é
 * atômico dentro do mesmo volume). Se a gravação falhar, o arquivo anterior
 * fica intacto e o temporário é apagado.
 */
function writeFileAtomically(fileSystem, filePath, content, encoding) {
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`

  try {
    fileSystem.writeFileSync(temporaryPath, content, encoding)
    fileSystem.renameSync(temporaryPath, filePath)
  } catch (error) {
    try {
      fileSystem.rmSync(temporaryPath, { force: true })
    } catch {
      // Melhor esforço: o erro que importa é o da gravação.
    }
    throw error
  }
}

/**
 * Terminal vivo que usa a conta, na forma que a confirmação mostra: nada de
 * ambiente, argumento ou caminho de perfil, só o que identifica o bloco.
 *
 * @returns {{ sessionId: string, cwd: string, startedAt: number | null }}
 */
function toAffectedSession(session) {
  return {
    sessionId: String(session.sessionId),
    cwd: typeof session.cwd === 'string' ? session.cwd : '',
    startedAt: Number.isFinite(session.startedAt) ? session.startedAt : null,
  }
}

/**
 * @param {object} options
 * @param {() => Array<{ sessionId: string, accountId?: string | null, cwd?: string, startedAt?: number }>} [options.listLiveSessions]
 *   Terminais vivos, lidos na hora de cada remoção (o gerenciador de PTY nasce
 *   depois da loja). Se a leitura falhar, a remoção falha junto: sem saber
 *   quem está na conta, não há o que confirmar.
 * @param {(accountId: string) => unknown} [options.forgetChainAccount]
 *   Tira a conta removida da cadeia (membro, espera e checagem de login). O
 *   registro de trocas fica, com o rótulo guardado.
 */
function createCliAccountStore({
  userData,
  homeDir = os.homedir(),
  fileSystem = fs,
  safeStorage = null,
  listLiveSessions = () => [],
  forgetChainAccount = null,
} = {}) {
  if (!userData) {
    throw new Error('createCliAccountStore requer userData.')
  }

  const storePath = path.join(userData, 'config', STORE_FILE)
  const secretsPath = path.join(userData, 'config', SECRETS_FILE)

  /**
   * Lê o registro. Arquivo ausente é a lista vazia de quem nunca criou conta;
   * qualquer outra falha (JSON quebrado, formato inesperado, sem permissão)
   * lança `CLI_ACCOUNTS_STORE_UNREADABLE`, para ninguém gravar por cima.
   */
  function readStore() {
    let raw
    try {
      raw = fileSystem.readFileSync(storePath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return []
      }
      throw createStoreUnreadableError()
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw createStoreUnreadableError()
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accounts)) {
      throw createStoreUnreadableError()
    }

    return parsed.accounts
  }

  function writeStore(accounts) {
    writeFileAtomically(
      fileSystem,
      storePath,
      `${JSON.stringify({ accounts }, null, 2)}\n`,
      'utf8',
    )
  }

  function list(providerId) {
    const accounts = readStore()
    const secrets = accounts.some((account) => account.providerId === 'openia')
      ? readSecrets()
      : {}
    const filtered = providerId
      ? accounts.filter((account) => account.providerId === providerId)
      : accounts
    return filtered.map((account) => toPublicAccount(account, secrets))
  }

  function findAccount(accountId) {
    return readStore().find((account) => account.id === accountId) ?? null
  }

  /**
   * Confere a conta escolhida contra o provedor que vai nascer no terminal.
   *
   * A checagem fica na loja para que nenhum boundary precise confiar apenas no
   * objeto recebido do renderer antes de pedir o ambiente do perfil.
   */
  function validateAccount(accountId, providerId) {
    if (typeof accountId !== 'string' || !accountId.trim()) {
      return { ok: false, message: 'O identificador da conta é inválido.' }
    }

    if (typeof providerId !== 'string' || !providerId.trim()) {
      return { ok: false, message: 'O identificador do provedor é inválido.' }
    }

    let account
    try {
      account = findAccount(accountId.trim())
    } catch (error) {
      if (error?.code === STORE_UNREADABLE_CODE) {
        return { ok: false, message: error.message }
      }
      throw error
    }

    if (!account) {
      return { ok: false, message: 'A conta selecionada não existe mais.' }
    }

    if (account.providerId !== providerId.trim()) {
      return {
        ok: false,
        message: 'A conta selecionada pertence a outro provedor.',
      }
    }

    if (account.providerId === 'openia' && !hasConfiguredSecret(account.id)) {
      return {
        ok: false,
        message: 'A conta do Openia não tem uma chave configurada.',
      }
    }

    return { ok: true, account }
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

    // Lido antes de criar a pasta: com o registro ilegível, nada é criado.
    const accounts = readStore()
    const account = {
      id: randomUUID(),
      providerId,
      label: name,
      createdAt: new Date().toISOString(),
    }

    const profileDir = getProfileDir(userData, providerId, account.id)
    fileSystem.mkdirSync(profileDir, { recursive: true })

    try {
      mirrorHomeEntries(providerId, profileDir)
      writeStore([...accounts, account])
    } catch (error) {
      // Sem registro a pasta nunca seria achada nem apagada por `remove` — e no
      // Gemini ela já guarda cópia de .ssh. Desfaz o que foi criado; se nem a
      // limpeza for possível, o erro que sobe continua sendo o da criação.
      try {
        fileSystem.rmSync(profileDir, { recursive: true, force: true })
      } catch {
        // Melhor esforço.
      }
      throw error
    }

    return account
  }

  /** Terminais vivos que nasceram nesta conta. */
  function listAccountSessions(accountId) {
    return listLiveSessions()
      .filter((session) => session?.accountId === accountId)
      .map(toAffectedSession)
  }

  /**
   * Remove a conta e apaga a pasta de login dela.
   *
   * Apagar é o certo aqui: o que está lá é credencial daquela conta, e manter
   * pasta órfã com token válido é pior que perder o login. A pessoa refaz o
   * login se recriar a conta.
   *
   * Sem `confirmed === true`, nada é apagado: a resposta traz os terminais
   * vivos na conta para a confirmação listá-los. Com a confirmação, todo
   * terminal vivo precisa estar em `acknowledgedSessionIds`; um que abriu
   * depois da pergunta devolve a confirmação com a lista nova, porque a
   * pessoa não aceitou perder o login dele.
   *
   * `ENOENT` é sucesso idempotente: a pasta pode ter sido removida por fora
   * antes da confirmação. Qualquer outro erro interrompe a operação antes de
   * esquecer a chave ou atualizar o registro, para que a conta continue
   * disponível para uma nova tentativa.
   *
   * @param {string} accountId
   * @param {{ confirmed?: boolean, acknowledgedSessionIds?: string[] }} [options]
   * @returns {{ removed: boolean, requiresConfirmation?: true, sessions: Array<{ sessionId: string, cwd: string, startedAt: number | null }>, chainCleaned?: boolean }}
   */
  function remove(accountId, { confirmed = false, acknowledgedSessionIds = [] } = {}) {
    const accounts = readStore()
    const account = accounts.find((item) => item.id === accountId)

    if (!account) {
      return { removed: false, sessions: [] }
    }

    const sessions = listAccountSessions(account.id)
    const acknowledged = new Set(Array.isArray(acknowledgedSessionIds) ? acknowledgedSessionIds : [])

    if (confirmed !== true || sessions.some((session) => !acknowledged.has(session.sessionId))) {
      return { removed: false, requiresConfirmation: true, sessions }
    }

    // Só conta do Openia tem chave. Com o arquivo de chaves ilegível, recusa
    // antes de mexer em qualquer coisa: esquecer a chave regravaria o arquivo
    // sem as das outras contas.
    const hasSecret = account.providerId === 'openia' && Boolean(safeStorage)
    if (hasSecret) {
      loadSecretsForWrite()
    }

    try {
      fileSystem.rmSync(getProfileDir(userData, account.providerId, account.id), {
        recursive: true,
        force: true,
      })
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        const failure = new Error(
          'Não foi possível apagar a pasta de login da conta. A conta e a credencial foram preservadas; corrija o bloqueio e tente novamente.',
        )
        failure.code = 'CLI_ACCOUNT_PROFILE_REMOVE_FAILED'
        throw failure
      }
    }

    if (hasSecret) {
      forgetSecret(account.id)
    }
    writeStore(accounts.filter((item) => item.id !== accountId))

    return { removed: true, sessions, chainCleaned: forgetInChain(account.id) }
  }

  /**
   * Limpa a conta nas tabelas da cadeia depois que ela já saiu do registro.
   * Uma falha aqui não desfaz a remoção (a pasta de login já foi apagada):
   * volta como `false` para o chamador registrar, e a recuperação do início
   * tira as linhas de conta que não existe mais.
   */
  function forgetInChain(accountId) {
    if (typeof forgetChainAccount !== 'function') {
      return true
    }

    try {
      forgetChainAccount(accountId)
      return true
    } catch {
      return false
    }
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

  /**
   * Lê as chaves para GRAVAR. Arquivo ausente é o mapa vazio; qualquer outra
   * falha (não decifra, JSON quebrado, formato inesperado) lança
   * `CLI_ACCOUNT_SECRETS_UNREADABLE`. Tratar o ilegível como vazio fazia a
   * próxima gravação regravar o arquivo só com a chave nova, apagando as das
   * outras contas — a mesma proteção que o registro já tem.
   */
  function loadSecretsForWrite() {
    let encrypted
    try {
      encrypted = fileSystem.readFileSync(secretsPath)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return {}
      }
      throw createSecretsUnreadableError()
    }

    let parsed
    try {
      parsed = JSON.parse(safeStorage.decryptString(encrypted))
    } catch {
      throw createSecretsUnreadableError()
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw createSecretsUnreadableError()
    }

    return parsed
  }

  /**
   * Lê as chaves para exibir ou montar o ambiente: ilegível conta como "sem
   * chave" (a conta aparece sem chave configurada e o terminal recusa abrir),
   * sem derrubar a lista. Nunca serve de base para uma gravação.
   */
  function readSecrets() {
    if (!safeStorage) {
      return {}
    }

    try {
      return loadSecretsForWrite()
    } catch {
      return {}
    }
  }

  function hasConfiguredSecret(accountId) {
    return hasSecretValue(readSecrets()[accountId])
  }

  function toPublicAccount(account, secrets) {
    if (account.providerId !== 'openia') {
      return account
    }

    return {
      ...account,
      // Nunca devolve a chave: o renderer só precisa saber se existe uma.
      secretConfigured: hasSecretValue(secrets[account.id]),
    }
  }

  function hasSecretValue(secret) {
    return typeof secret === 'string' && secret.trim() !== ''
  }

  function writeSecrets(secrets) {
    // Mesma escrita atômica do registro: um arquivo cifrado pela metade não
    // decifra, e a próxima chave gravada apagaria a das outras contas.
    writeFileAtomically(fileSystem, secretsPath, safeStorage.encryptString(JSON.stringify(secrets)))
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
    const account = findAccount(typeof accountId === 'string' ? accountId.trim() : '')
    if (!account || account.providerId !== 'openia') {
      throw new Error('A conta do Openia não existe.')
    }

    const permitido = canStoreSecret()

    if (!permitido.ok) {
      throw new Error(permitido.reason)
    }

    if (typeof secret !== 'string' || !secret.trim()) {
      throw new Error('Informe a chave da conta.')
    }

    writeSecrets({ ...loadSecretsForWrite(), [account.id]: secret.trim() })
  }

  function forgetSecret(accountId) {
    if (!safeStorage) {
      return
    }

    const secrets = loadSecretsForWrite()

    if (!(accountId in secrets)) {
      return
    }

    delete secrets[accountId]
    writeSecrets(secrets)
  }

  /**
   * Ambiente do terminal para a conta escolhida. O segredo sai daqui direto
   * para o processo filho, sem passar pelo renderer nem por log.
   *
   * Devolve só as variáveis do perfil. Quem junta com o ambiente base usa
   * `applyProfileEnv` (cli-account-profiles.cjs), que também tira as chaves
   * de API herdadas do app: espalhar este objeto por cima do `process.env`
   * deixaria a CLI cobrar pela chave, não pela conta.
   */
  function buildEnv(accountId, expectedProviderId) {
    const hasAccount = accountId !== undefined && accountId !== null && accountId !== ''

    // O login do sistema não depende do registro: um arquivo ilegível não pode
    // impedir o terminal sem conta de abrir.
    if (!hasAccount) {
      return {}
    }

    const account = findAccount(accountId)

    if (!account) {
      if (expectedProviderId) {
        throw new Error('A conta selecionada não existe mais.')
      }
      return {}
    }

    if (expectedProviderId && account.providerId !== expectedProviderId) {
      throw new Error('A conta selecionada pertence a outro provedor.')
    }

    return buildProfileEnv({
      providerId: account.providerId,
      profileDir: getProfileDir(userData, account.providerId, account.id),
      secret: readSecrets()[account.id],
      homeDir,
    })
  }

  /**
   * Onde o leitor de quota deve olhar para esta conta.
   *
   * O painel lia sempre o login do sistema; com login por conta, a quota de
   * cada uma está na pasta dela. Só as CLIs que guardam quota em arquivo têm
   * o que responder aqui.
   */
  function buildProbeOptions(accountId) {
    const account = readStore().find((item) => item.id === accountId)

    if (!account) {
      return {}
    }

    const profileDir = getProfileDir(userData, account.providerId, account.id)

    if (account.providerId === 'codex') {
      return { codexHome: profileDir }
    }

    if (account.providerId === 'claude') {
      return { claudeConfigDir: profileDir }
    }

    return {}
  }

  return {
    buildEnv,
    buildProbeOptions,
    canStoreSecret,
    create,
    forgetSecret,
    list,
    remove,
    setSecret,
    storePath,
    validateAccount,
  }
}

module.exports = {
  STORE_UNREADABLE_CODE,
  createCliAccountStore,
}
