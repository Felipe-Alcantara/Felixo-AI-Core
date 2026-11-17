'use strict'

const fs = require('node:fs')
const path = require('node:path')

const STORE_FILE = 'servers.json'
const SECRETS_FILE = 'secrets.bin'
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
const SECRET_NAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
const EXECUCOES = ['por-agente', 'compartilhado', 'remoto']

/**
 * Registro central de servidores MCP: "instalar uma vez" no app. As definicoes
 * (sem segredo) ficam em `<userData>/mcp/servers.json`; os valores secretos
 * (variaveis de ambiente do stdio ou cabecalhos do HTTP que a definicao lista
 * em `segredos`) ficam cifrados por `safeStorage`, no padrao do cofre do
 * Notion. O renderer so recebe os NOMES dos segredos ja guardados; o valor so
 * sai por `resolve`, no processo principal, na hora de abrir um terminal.
 */
function createMcpRegistry({ userData, safeStorage, fileSystem = fs } = {}) {
  if (typeof userData !== 'string' || !userData.trim()) {
    throw new Error('createMcpRegistry requer userData.')
  }

  const dir = path.join(userData, 'mcp')
  const storePath = path.join(dir, STORE_FILE)
  const secretsPath = path.join(dir, SECRETS_FILE)

  function readDefinitions() {
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(storePath, 'utf8'))
      return Array.isArray(parsed?.servidores) ? parsed.servidores : []
    } catch {
      return []
    }
  }

  function writeDefinitions(servidores) {
    fileSystem.mkdirSync(dir, { recursive: true })
    fileSystem.writeFileSync(storePath, `${JSON.stringify({ servidores }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  // Ilegivel conta como "sem segredo": nunca serve de base para uma gravacao
  // (save confere o cofre antes de reescrever).
  function readSecrets() {
    if (!safeStorage) return {}
    try {
      const parsed = JSON.parse(safeStorage.decryptString(fileSystem.readFileSync(secretsPath)))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  function writeSecrets(secrets) {
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('O sistema nao oferece armazenamento cifrado para os segredos do MCP.')
    }
    if (safeStorage.getSelectedStorageBackend?.() === 'basic') {
      throw new Error('O chaveiro do sistema esta indisponivel (backend basic). Desbloqueie-o para guardar segredos de MCP.')
    }
    fileSystem.mkdirSync(dir, { recursive: true })
    fileSystem.writeFileSync(secretsPath, safeStorage.encryptString(JSON.stringify(secrets)), { mode: 0o600 })
  }

  function toPublic(server, secrets) {
    return { ...server, segredosConfigurados: server.segredos.filter((name) => hasValue(secrets[server.id]?.[name])) }
  }

  function list() {
    const secrets = readSecrets()
    return readDefinitions().map((server) => toPublic(server, secrets))
  }

  /**
   * Cria ou atualiza. `valoresSegredos` traz so o que mudou: nome ausente
   * mantem o valor guardado; string vazia remove.
   */
  function save(input = {}, valoresSegredos = {}) {
    const server = normalize(input)
    const secrets = readSecrets()
    const mine = { ...(secrets[server.id] ?? {}) }

    for (const [name, value] of Object.entries(valoresSegredos ?? {})) {
      if (!server.segredos.includes(name)) throw new Error(`"${name}" nao esta na lista de segredos do servidor.`)
      if (typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 4096) {
        throw new Error(`Valor invalido para o segredo "${name}".`)
      }
      if (value === '') delete mine[name]
      else mine[name] = value
    }
    for (const name of Object.keys(mine)) {
      if (!server.segredos.includes(name)) delete mine[name]
    }

    if (Object.keys(mine).length > 0 || secrets[server.id]) {
      writeSecrets({ ...secrets, [server.id]: mine })
    }
    const others = readDefinitions().filter((existing) => existing.id !== server.id)
    writeDefinitions([...others, server].sort((a, b) => a.id.localeCompare(b.id)))
    return toPublic(server, { [server.id]: mine })
  }

  function remove(id) {
    const servidores = readDefinitions()
    if (!servidores.some((server) => server.id === id)) return false
    const secrets = readSecrets()
    if (secrets[id]) {
      delete secrets[id]
      writeSecrets(secrets)
    }
    writeDefinitions(servidores.filter((server) => server.id !== id))
    return true
  }

  /**
   * So para o processo principal: devolve os servidores pedidos com os
   * segredos ja misturados em `env` (stdio) ou `cabecalhos` (http), mais a
   * lista de nomes secretos para quem precisa tratar esses valores a parte.
   * Id desconhecido (removido depois de o agente ser configurado) e ignorado.
   */
  function resolve(ids) {
    const wanted = new Set(Array.isArray(ids) ? ids : [])
    const secrets = readSecrets()
    return readDefinitions()
      .filter((server) => wanted.has(server.id))
      .map((server) => {
        const values = secrets[server.id] ?? {}
        const secretValues = Object.fromEntries(server.segredos.filter((name) => hasValue(values[name])).map((name) => [name, values[name]]))
        return { ...server, secretValues }
      })
  }

  return { list, save, remove, resolve }
}

function hasValue(value) {
  return typeof value === 'string' && value !== ''
}

function normalize(input) {
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!ID_PATTERN.test(id)) throw new Error('Id de MCP invalido: use letras minusculas, numeros e hifen (ate 40).')

  const nome = typeof input.nome === 'string' && input.nome.trim() ? input.nome.trim().slice(0, 80) : id
  const transporte = input.transporte
  if (transporte !== 'stdio' && transporte !== 'http') throw new Error('Transporte de MCP deve ser "stdio" ou "http".')

  const segredos = [...new Set(Array.isArray(input.segredos) ? input.segredos : [])]
  if (!segredos.every((name) => typeof name === 'string' && SECRET_NAME_PATTERN.test(name))) {
    throw new Error('Nome de segredo invalido.')
  }

  const server = {
    id,
    nome,
    origem: typeof input.origem === 'string' && input.origem.trim() ? input.origem.trim().slice(0, 120) : 'manual',
    transporte,
    segredos,
    execucao: EXECUCOES.includes(input.execucao) ? input.execucao : transporte === 'http' ? 'remoto' : 'por-agente',
    ferramentasQueAgemFora: stringList(input.ferramentasQueAgemFora),
    versao: typeof input.versao === 'string' ? input.versao.trim().slice(0, 40) : '',
  }

  if (transporte === 'stdio') {
    const comando = typeof input.comando === 'string' ? input.comando.trim() : ''
    if (!comando) throw new Error('MCP stdio requer um comando.')
    return { ...server, comando, args: stringList(input.args), env: stringMap(input.env, segredos) }
  }

  let url
  try {
    url = new URL(input.url)
  } catch {
    throw new Error('MCP http requer uma url valida.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('MCP http requer url http ou https.')
  if (url.username || url.password) throw new Error('Nao ponha credenciais na url: use um cabecalho secreto.')
  return { ...server, url: url.href, cabecalhos: stringMap(input.cabecalhos, segredos) }
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

// Valor secreto nunca entra na definicao: o nome so existe em `segredos`.
function stringMap(value, segredos) {
  const entries = Object.entries(value && typeof value === 'object' ? value : {})
  return Object.fromEntries(entries.filter(([key, item]) => typeof item === 'string' && !segredos.includes(key)))
}

module.exports = { createMcpRegistry }
