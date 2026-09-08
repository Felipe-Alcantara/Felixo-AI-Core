'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const STORE_FILE = 'notion-connections.json'
const SECRETS_FILE = 'notion-connection-secrets.bin'

/**
 * Stores the public metadata of a person's own Notion connections separately
 * from their credential. The renderer never sees a token: it only receives
 * `hasToken`, and the main process obtains the decrypted value immediately
 * before making an API request.
 */
function createNotionConnectionStore({
  userData,
  safeStorage,
  fileSystem = fs,
  idFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof userData !== 'string' || !userData.trim()) {
    throw new Error('createNotionConnectionStore requer userData.')
  }

  const configDir = path.join(userData, 'config')
  const storePath = path.join(configDir, STORE_FILE)
  const secretsPath = path.join(configDir, SECRETS_FILE)

  function readMetadata() {
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(storePath, 'utf8'))
      return Array.isArray(parsed?.connections) ? parsed.connections : []
    } catch {
      return []
    }
  }

  function writeMetadata(connections) {
    fileSystem.mkdirSync(configDir, { recursive: true })
    fileSystem.writeFileSync(
      storePath,
      `${JSON.stringify({ connections }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    )
    chmodPrivate(storePath)
  }

  function readSecrets() {
    if (!safeStorage) return {}

    try {
      const encrypted = fileSystem.readFileSync(secretsPath)
      const parsed = JSON.parse(safeStorage.decryptString(encrypted))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {}
    } catch {
      return {}
    }
  }

  function writeSecrets(secrets) {
    const storage = canStoreSecret()
    if (!storage.ok) {
      throw new Error(storage.reason)
    }

    fileSystem.mkdirSync(configDir, { recursive: true })
    fileSystem.writeFileSync(
      secretsPath,
      safeStorage.encryptString(JSON.stringify(secrets)),
      { mode: 0o600 },
    )
    chmodPrivate(secretsPath)
  }

  function chmodPrivate(filePath) {
    try {
      fileSystem.chmodSync(filePath, 0o600)
    } catch {
      // Windows and some virtual filesystems do not expose POSIX modes.
    }
  }

  function canStoreSecret() {
    if (!safeStorage?.isEncryptionAvailable?.()) {
      return {
        ok: false,
        reason: 'O sistema não oferece armazenamento cifrado para a conexão Notion.',
      }
    }

    try {
      if (safeStorage.getSelectedStorageBackend?.() === 'basic') {
        return {
          ok: false,
          reason:
            'O chaveiro do sistema está indisponível (backend basic). Desbloqueie o chaveiro para guardar o token do Notion com segurança.',
        }
      }
    } catch {
      // `isEncryptionAvailable` is the only capability available on older Electron builds.
    }

    return { ok: true, reason: null }
  }

  function normalizeLabel(value) {
    const label = typeof value === 'string' ? value.trim().slice(0, 80) : ''
    if (!label) throw new Error('Informe um nome para a conexão Notion.')
    return label
  }

  function normalizeToken(value) {
    const token = typeof value === 'string' ? value.trim() : ''
    if (!token || token.length > 4096 || /[\r\n]/.test(token)) {
      throw new Error('Informe um token Notion válido.')
    }
    return token
  }

  function normalizeProfileId(value) {
    const profileId = typeof value === 'string' ? value.trim().slice(0, 120) : ''
    return profileId || 'default'
  }

  function toPublic(connection, secrets = readSecrets()) {
    return {
      id: connection.id,
      label: connection.label,
      profileId: connection.profileId || 'default',
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      lastTestedAt: connection.lastTestedAt || null,
      hasToken: hasSecret(secrets[connection.id]),
    }
  }

  function list() {
    const secrets = readSecrets()
    return readMetadata().map((connection) => toPublic(connection, secrets))
  }

  function find(connectionId) {
    const id = typeof connectionId === 'string' ? connectionId.trim() : ''
    return readMetadata().find((connection) => connection.id === id) || null
  }

  function getCredential(connectionId) {
    const connection = find(connectionId)
    if (!connection) return null

    const token = readSecrets()[connection.id]
    if (!hasSecret(token)) {
      return { connection: toPublic(connection), token: null }
    }

    return { connection: toPublic(connection), token }
  }

  function save(input = {}) {
    const connections = readMetadata()
    const existingId = typeof input.id === 'string' ? input.id.trim() : ''
    const existing = existingId
      ? connections.find((connection) => connection.id === existingId)
      : null
    const id = existing?.id || idFactory()
    const previousToken = existing ? readSecrets()[id] : null
    const rawToken = typeof input.token === 'string' ? input.token.trim() : ''
    const token = rawToken || previousToken

    if (!hasSecret(token)) {
      throw new Error('Informe o token da conexão Notion.')
    }

    // Check this before mutating metadata. A failed encryption must not leave
    // a connection that can never be used.
    const storage = canStoreSecret()
    if (!storage.ok) throw new Error(storage.reason)

    const timestamp = now()
    const connection = {
      id,
      label: normalizeLabel(input.label ?? existing?.label),
      profileId: normalizeProfileId(input.profileId ?? existing?.profileId),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      lastTestedAt: existing?.lastTestedAt || null,
    }

    writeSecrets({ ...readSecrets(), [id]: token })
    writeMetadata(
      existing
        ? connections.map((item) => (item.id === id ? connection : item))
        : [...connections, connection],
    )

    return toPublic(connection, { [id]: token })
  }

  function remove(connectionId) {
    const connection = find(connectionId)
    if (!connection) return false

    const nextConnections = readMetadata().filter((item) => item.id !== connection.id)
    const secrets = readSecrets()
    delete secrets[connection.id]
    if (Object.keys(secrets).length > 0) {
      writeSecrets(secrets)
    } else {
      try {
        fileSystem.rmSync(secretsPath, { force: true })
      } catch {
        // Removing an already absent secret file is idempotent.
      }
    }
    // Mutate public metadata last. If re-encrypting the remaining secrets
    // fails because a keyring disappeared, the connection remains usable and
    // the token is not orphaned behind a deleted metadata row.
    writeMetadata(nextConnections)
    return true
  }

  function markTested(connectionId) {
    const connections = readMetadata()
    const id = typeof connectionId === 'string' ? connectionId.trim() : ''
    const testedAt = now()
    let updated = null

    const next = connections.map((connection) => {
      if (connection.id !== id) return connection
      updated = { ...connection, lastTestedAt: testedAt, updatedAt: testedAt }
      return updated
    })

    if (!updated) return null
    writeMetadata(next)
    return toPublic(updated)
  }

  return {
    canStoreSecret,
    find,
    getCredential,
    list,
    markTested,
    remove,
    save,
    secretsPath,
    storePath,
  }
}

function hasSecret(value) {
  return typeof value === 'string' && value.trim() !== ''
}

module.exports = {
  SECRETS_FILE,
  STORE_FILE,
  createNotionConnectionStore,
  hasSecret,
}
