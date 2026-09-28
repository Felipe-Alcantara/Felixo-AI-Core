'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  createStorageDatabase,
  getAppliedStorageMigrations,
} = require('./sqlite-database.cjs')
const { listStorageMigrations } = require('./migration-loader.cjs')
const { createAccountChainRepository } = require('./account-chain-repository.cjs')

/**
 * Os testes de repositorio abrem sempre um banco novo, entao provam que o
 * schema atual funciona — nao que um banco JA EXISTENTE sobrevive a uma
 * atualizacao. Essa e a garantia que interessa a quem ja usa o app: instalar
 * uma versao nova nao pode custar os projetos e as conversas de quem estava
 * na versao anterior.
 *
 * O cenario aqui e literalmente esse: instala numa versao antiga, usa, e
 * depois atualiza para a lista completa de migrations.
 */

function contarAplicadas(connection) {
  const aplicadas = getAppliedStorageMigrations(connection)
  return aplicadas.size === undefined ? aplicadas.length : aplicadas.size
}

function comDiretorioTemporario(executar) {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-compat-'))
  try {
    return executar(diretorio)
  } finally {
    fs.rmSync(diretorio, { recursive: true, force: true })
  }
}

test('um banco de uma versao anterior migra para a atual sem perder dado', () => {
  comDiretorioTemporario((diretorio) => {
    const todas = listStorageMigrations()
    assert.ok(todas.length > 5, 'o cenario precisa de migrations depois da 5')
    const antigas = todas.slice(0, 5)
    const agora = new Date().toISOString()

    // 1. A instalacao antiga: so as primeiras migrations existiam.
    const antigo = createStorageDatabase({ databaseDir: diretorio, migrations: antigas })
    assert.equal(contarAplicadas(antigo.connection), antigas.length)

    // 2. A pessoa usou o app e gravou coisas.
    antigo.connection
      .prepare('INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('projeto-antigo', 'Projeto da versao anterior', '/trabalho/projeto', agora, agora)
    antigo.connection
      .prepare('INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('conversa-antiga', 'Conversa da versao anterior', agora, agora)
    antigo.close()

    // 3. A atualizacao: o MESMO arquivo, agora com todas as migrations.
    const atualizado = createStorageDatabase({ databaseDir: diretorio, migrations: todas })

    assert.equal(
      contarAplicadas(atualizado.connection),
      todas.length,
      'a atualizacao deveria aplicar as migrations que faltavam',
    )
    assert.equal(
      atualizado.connection.prepare('SELECT COUNT(*) AS total FROM projects').get().total,
      1,
      'o projeto gravado antes da atualizacao sumiu',
    )
    assert.equal(
      atualizado.connection.prepare('SELECT COUNT(*) AS total FROM chats').get().total,
      1,
      'a conversa gravada antes da atualizacao sumiu',
    )
    assert.equal(
      atualizado.connection.prepare('SELECT name FROM projects WHERE id = ?').get('projeto-antigo').name,
      'Projeto da versao anterior',
      'o conteudo do registro antigo foi alterado pela migracao',
    )

    atualizado.close()
  })
})

test('reabrir um banco ja atualizado nao reaplica migration nem duplica dado', () => {
  comDiretorioTemporario((diretorio) => {
    const todas = listStorageMigrations()
    const agora = new Date().toISOString()

    const primeiro = createStorageDatabase({ databaseDir: diretorio, migrations: todas })
    primeiro.connection
      .prepare('INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('projeto', 'Projeto', '/p', agora, agora)
    primeiro.close()

    // Abrir de novo e o caso comum: toda vez que o app inicia.
    const segundo = createStorageDatabase({ databaseDir: diretorio, migrations: todas })
    assert.equal(contarAplicadas(segundo.connection), todas.length)
    assert.equal(
      segundo.connection.prepare('SELECT COUNT(*) AS total FROM projects').get().total,
      1,
      'reabrir o banco duplicou ou apagou registro',
    )
    segundo.close()
  })
})

test('a migration 017 (cadeia de contas) sobre um banco na versao 16 com dados: nada some e a cadeia nasce desligada', () => {
  comDiretorioTemporario((diretorio) => {
    const todas = listStorageMigrations()
    const ate16 = todas.filter((migration) => migration.version <= 16)
    assert.ok(todas.some((migration) => migration.version === 17), 'a migration 017 precisa existir')
    const agora = new Date().toISOString()

    // 1. Quem estava na versao 16 ja tinha contas medidas no painel e perfis do navegador.
    const antigo = createStorageDatabase({ databaseDir: diretorio, migrations: ate16 })
    antigo.connection
      .prepare('INSERT INTO agent_usage_accounts (id, provider_id, label, identity_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('conta-pessoal', 'codex', 'Pessoal', 'fp-pessoal', agora, agora)
    antigo.connection
      .prepare('INSERT INTO webview_profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('trabalho-ab12', 'Trabalho', agora, agora)
    antigo.close()

    // 2. A atualizacao aplica a 017 no mesmo arquivo.
    const atualizado = createStorageDatabase({ databaseDir: diretorio, migrations: todas })
    try {
      assert.equal(contarAplicadas(atualizado.connection), todas.length)
      assert.equal(
        atualizado.connection.prepare('SELECT label FROM agent_usage_accounts WHERE id = ?').get('conta-pessoal').label,
        'Pessoal',
        'a conta medida antes da atualizacao sumiu ou mudou',
      )
      assert.equal(atualizado.connection.prepare('SELECT COUNT(*) AS total FROM webview_profiles').get().total, 1)

      const tabelas = atualizado.connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'account_%' ORDER BY name")
        .all()
        .map((linha) => linha.name)
      assert.deepEqual(tabelas, [
        'account_chain_members',
        'account_chain_settings',
        'account_cooldowns',
        'account_login_checks',
        'account_switch_events',
      ])

      // Ausencia da linha de settings = cadeia DESLIGADA: atualizar nunca liga nada sozinho.
      const cadeia = createAccountChainRepository(atualizado)
      assert.equal(cadeia.readSettings().enabled, false)
      assert.deepEqual(cadeia.listMembers(), [])
    } finally {
      atualizado.close()
    }
  })
})
