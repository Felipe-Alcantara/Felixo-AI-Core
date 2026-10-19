'use strict'

/**
 * Pré-carga da suíte de testes Node (`scripts/run-node-unit-tests.cjs`): todo
 * banco SQLite aberto nos testes, inclusive nos processos filhos que eles
 * criam, roda com `PRAGMA synchronous = OFF`.
 *
 * Por quê: cada teste cria um banco novo e aplica as migrações, uma transação
 * por migração, e no Windows cada COMMIT espera o disco confirmar a gravação.
 * Medido no CI de 14/10/2026: os 26 arquivos de teste que usam SQLite somavam
 * 744 s no Windows e 13 s no Ubuntu, e o `npm test` levava 4 a 5 min lá contra
 * 23 s aqui.
 *
 * O que continua igual: o diário de transações segue em disco (journal_mode
 * padrão), então um processo morto no meio de uma transação ainda é desfeito
 * na próxima abertura, que é o que os testes de falha exercitam. Só a garantia
 * contra queda de energia do sistema fica de fora, e nenhum teste depende dela.
 * O app não carrega este arquivo.
 */

let sqlite = null
try {
  sqlite = require('node:sqlite')
} catch {
  // Runtime sem node:sqlite: nada a ajustar.
}

if (sqlite && typeof sqlite.DatabaseSync === 'function' && !sqlite.DatabaseSync.felixoSemFsync) {
  const DatabaseSyncOriginal = sqlite.DatabaseSync

  const semFsync = (database) => {
    try {
      database.exec('PRAGMA synchronous = OFF')
    } catch {
      // Banco ainda fechado (`open: false`) ou só leitura: segue o padrão.
    }
  }

  class DatabaseSyncSemFsync extends DatabaseSyncOriginal {
    constructor(...args) {
      super(...args)
      semFsync(this)
    }

    open(...args) {
      const resultado = super.open(...args)
      semFsync(this)
      return resultado
    }
  }

  DatabaseSyncSemFsync.felixoSemFsync = true
  sqlite.DatabaseSync = DatabaseSyncSemFsync
}
