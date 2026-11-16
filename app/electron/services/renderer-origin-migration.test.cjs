'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const { MARKER_FILE, migrateFileOriginStorage } = require('./renderer-origin-migration.cjs')

const pastas = []
after(() => {
  for (const pasta of pastas) fs.rmSync(pasta, { recursive: true, force: true })
})
function pasta() {
  const criada = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-migracao-origem-'))
  pastas.push(criada)
  return criada
}

function armazenamento(inicial = {}) {
  const dados = new Map(Object.entries(inicial))
  return {
    dados,
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    get length() {
      return dados.size
    },
    key: (indice) => [...dados.keys()][indice] ?? null,
  }
}

/**
 * Janelas falsas: a que carrega `file://` lê a origem antiga; a que carrega a
 * URL da origem nova roda o script de cópia de verdade, num `vm`, sobre o
 * armazenamento novo.
 */
function janelas({ antigo, novo, falhaAoLer = false }) {
  const criadas = []
  class Janela {
    constructor(options) {
      this.options = options
      this.destruida = false
      this.origem = null
      criadas.push(this)
      this.webContents = {
        executeJavaScript: async (script) => {
          if (this.origem === 'file') {
            if (falhaAoLer) throw new Error('renderer caiu')
            return JSON.stringify(Object.fromEntries(antigo.dados))
          }
          return vm.runInNewContext(script, { localStorage: novo, Object })
        },
      }
    }
    async loadFile(arquivo) {
      assert.ok(fs.existsSync(arquivo), 'a página vazia file:// existe ao carregar')
      this.origem = 'file'
    }
    async loadURL(url) {
      this.origem = url
    }
    isDestroyed() {
      return this.destruida
    }
    destroy() {
      this.destruida = true
    }
  }
  return { Janela, criadas }
}

const ALVO = 'app://felixo/__migracao-origem'

test('copia uma vez, sem sobrescrever o que a origem nova já tem, e deixa a antiga intacta', async () => {
  const userData = pasta()
  const antigo = armazenamento({ 'felixo-ai-core.theme': 'light', 'felixo:last-agent': 'codex', 'felixo:notification-history': '[1,2]' })
  const novo = armazenamento({ 'felixo:last-agent': 'claude' })
  const { Janela, criadas } = janelas({ antigo, novo })

  const resultado = await migrateFileOriginStorage({ BrowserWindow: Janela, userData, targetUrl: ALVO })

  assert.equal(resultado.status, 'migrada')
  assert.equal(resultado.keys, 2)
  assert.equal(novo.getItem('felixo-ai-core.theme'), 'light')
  assert.equal(novo.getItem('felixo:notification-history'), '[1,2]')
  assert.equal(novo.getItem('felixo:last-agent'), 'claude')
  assert.equal(antigo.dados.size, 3, 'a cópia antiga fica')
  // Janelas sem o app, sem Node, e destruídas no fim.
  assert.equal(criadas.length, 2)
  assert.ok(criadas.every((janela) => janela.options.show === false && janela.options.webPreferences.sandbox === true))
  assert.ok(criadas.every((janela) => janela.destruida))
  assert.equal(criadas[1].origem, ALVO)
  const marcador = JSON.parse(fs.readFileSync(path.join(userData, MARKER_FILE), 'utf8'))
  assert.equal(marcador.keys, 3)
  assert.equal(marcador.copied, 2)
  assert.equal(fs.existsSync(path.join(userData, 'origem-file-vazia.html')), false)
})

test('depois de feita, não abre janela nenhuma', async () => {
  const userData = pasta()
  fs.writeFileSync(path.join(userData, MARKER_FILE), '{"version":1}\n')
  const { Janela, criadas } = janelas({ antigo: armazenamento({ a: '1' }), novo: armazenamento() })

  assert.deepEqual(await migrateFileOriginStorage({ BrowserWindow: Janela, userData, targetUrl: ALVO }), { status: 'feita' })
  assert.equal(criadas.length, 0)
})

test('falha não marca como feita (tenta de novo no próximo início) e não deixa janela aberta', async () => {
  const userData = pasta()
  const { Janela, criadas } = janelas({ antigo: armazenamento({ a: '1' }), novo: armazenamento(), falhaAoLer: true })

  const resultado = await migrateFileOriginStorage({ BrowserWindow: Janela, userData, targetUrl: ALVO })

  assert.equal(resultado.status, 'falhou')
  assert.match(resultado.error, /renderer caiu/)
  assert.equal(fs.existsSync(path.join(userData, MARKER_FILE)), false)
  assert.ok(criadas.every((janela) => janela.destruida))
})

test('primeira instalação: nada a copiar, mas fica marcada', async () => {
  const userData = pasta()
  const { Janela } = janelas({ antigo: armazenamento(), novo: armazenamento() })
  const resultado = await migrateFileOriginStorage({ BrowserWindow: Janela, userData, targetUrl: ALVO })
  assert.equal(resultado.status, 'migrada')
  assert.equal(resultado.keys, 0)
  assert.ok(fs.existsSync(path.join(userData, MARKER_FILE)))
})
