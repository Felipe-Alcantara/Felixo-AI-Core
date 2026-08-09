/**
 * @module agent-models/agent-model-store
 * Cache em disco do catálogo de modelos descoberto.
 *
 * É a fonte principal do menu, não um plano B: ler um JSON local é imediato,
 * então o menu abre com a lista certa antes mesmo de a descoberta terminar.
 * A atualização em background só substitui o que estiver aqui.
 *
 * Toda falha de leitura vira `null`, nunca exceção — cache ausente é o estado
 * normal da primeira execução, e um arquivo truncado (desligar o PC no meio
 * de uma escrita) não pode impedir o app de abrir.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')

const CACHE_FILE_NAME = 'agent-models.json'

function createAgentModelStore({ cacheDir, now = () => new Date() } = {}) {
  const cachePath = path.join(cacheDir, CACHE_FILE_NAME)

  async function read() {
    try {
      const bruto = await fsp.readFile(cachePath, 'utf8')
      const dados = JSON.parse(bruto)

      // Array ou primitivo aqui significa arquivo de outra coisa/versão: tratar
      // como ausente é mais seguro que deixar o formato errado vazar adiante.
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        return null
      }

      return dados
    } catch {
      return null
    }
  }

  async function save(catalogo) {
    // `null` = "a descoberta não trouxe nada desta vez". Gravar assim mesmo
    // apagaria um catálogo que já funcionava por causa de uma rodada ruim.
    if (!catalogo || Object.keys(catalogo).length === 0) {
      return false
    }

    try {
      await fsp.mkdir(cacheDir, { recursive: true })
      await fsp.writeFile(
        cachePath,
        JSON.stringify({ ...catalogo, discoveredAt: now().toISOString() }, null, 2),
        'utf8',
      )
      return true
    } catch {
      return false
    }
  }

  return { cachePath, read, save }
}

module.exports = {
  CACHE_FILE_NAME,
  createAgentModelStore,
}
