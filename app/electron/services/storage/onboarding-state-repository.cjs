'use strict'

/**
 * @module onboarding-state-repository
 * Estado do tutorial do canvas no SQLite, com compare-and-set.
 *
 * O estado mora numa linha da tabela `settings` (chave `onboarding.state`),
 * dentro do envelope `{"revision": n, "value": {…}}`. A revisão é o que torna a
 * escrita segura entre processos: dois Felixo abertos no mesmo perfil (abrir um
 * `.fxai` com o app aberto, `felixo devtools --real-profile`) nunca mostram o
 * mesmo tutorial duas vezes, porque só uma escrita com a revisão esperada é
 * aplicada e a outra recebe o valor atual para reaplicar o próprio evento.
 *
 * Não usa o `settings-repository` de propósito: o `get` de lá lança exceção com
 * JSON inválido, e aqui uma linha corrompida precisa virar `corrupted: true`
 * (a interface recupera sem abrir nada) em vez de derrubar a leitura.
 *
 * A transação é mínima (um SELECT e um UPSERT, sem I/O nem lógica), porque
 * sob contenção o `BEGIN IMMEDIATE` espera até o `busy_timeout` (5 s) na thread
 * do processo principal.
 */

const ONBOARDING_STATE_KEY = 'onboarding.state'

function requireConnection(database) {
  const connection = database?.connection ?? database
  if (!connection?.prepare || !connection?.exec) {
    throw new Error('Conexão SQLite inválida para o estado do tutorial.')
  }
  return connection
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Interpreta o envelope gravado. Tolerante: JSON inválido, envelope sem revisão
 * inteira positiva ou sem `value` viram `corrupted: true` com revisão 0, que a
 * próxima escrita com `expectedRevision: 0` pode sobrescrever.
 */
function parseEnvelope(valueJson) {
  let envelope
  try {
    envelope = JSON.parse(valueJson)
  } catch {
    return { revision: 0, value: null, corrupted: true }
  }
  if (
    !isPlainObject(envelope) ||
    !Number.isInteger(envelope.revision) ||
    envelope.revision < 1 ||
    !Object.hasOwn(envelope, 'value')
  ) {
    return { revision: 0, value: null, corrupted: true }
  }
  return { revision: envelope.revision, value: envelope.value, corrupted: false }
}

/**
 * Lê o estado atual.
 *
 * @param {unknown} database - `{ connection }` do `createStorageDatabase` ou a própria conexão.
 * @returns {{ revision: number, value: unknown, corrupted: boolean }} Revisão 0 e `value: null` quando não existe.
 */
function readOnboardingState(database) {
  const connection = requireConnection(database)
  const row = connection.prepare('SELECT value_json FROM settings WHERE key = ?').get(ONBOARDING_STATE_KEY)
  if (!row) return { revision: 0, value: null, corrupted: false }
  return parseEnvelope(row.value_json)
}

/**
 * Grava `value` só se a revisão atual for `expectedRevision`.
 *
 * @param {unknown} database
 * @param {{ expectedRevision: number, value: unknown, nowIso: string }} request
 * @returns {{ applied: true, revision: number } | { applied: false, revision: number, value: unknown, corrupted: boolean }}
 */
function compareAndSetOnboardingState(database, { expectedRevision, value, nowIso }) {
  const connection = requireConnection(database)
  let began = false

  try {
    connection.exec('BEGIN IMMEDIATE')
    began = true
    const current = readOnboardingState(connection)

    if (current.revision !== expectedRevision) {
      connection.exec('COMMIT')
      return { applied: false, ...current }
    }

    const revision = current.revision + 1
    connection
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .run(ONBOARDING_STATE_KEY, JSON.stringify({ revision, value }), nowIso)
    connection.exec('COMMIT')
    return { applied: true, revision }
  } catch (error) {
    // Só desfaz a transação que esta função abriu: se o BEGIN falhou porque
    // outro módulo tem uma transação aberta na mesma conexão, um ROLLBACK aqui
    // desfaria o trabalho dele.
    if (began) {
      try {
        connection.exec('ROLLBACK')
      } catch {
        // Mantém o erro original; o SQLite pode já ter abortado a transação.
      }
    }
    throw error
  }
}

module.exports = {
  ONBOARDING_STATE_KEY,
  compareAndSetOnboardingState,
  parseEnvelope,
  readOnboardingState,
}
