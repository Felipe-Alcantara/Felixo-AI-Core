'use strict'

const fs = require('node:fs')
const path = require('node:path')

const BARE_KEY = /^[A-Za-z0-9_-]+$/

/**
 * Monta o que um terminal precisa para enxergar os MCPs do registro SEM gravar
 * na configuracao da CLI (`~/.claude.json`, `config.toml`, `settings.json`):
 * argumentos, ambiente e arquivos de sessao. Cada adaptador devolve
 * `{ args, env, files }` a partir dos servidores resolvidos; so o Claude e o
 * Codex sao entregues no spawn (o Gemini so tem o conteudo do arquivo, ver
 * `geminiSettings`).
 */

/** Claude Code: `--mcp-config <arquivo>`. O arquivo de sessao leva os segredos (0600, apagado ao fechar). */
function claudeInjection(servers, file) {
  const mcpServers = {}
  for (const server of servers) {
    mcpServers[server.id] =
      server.transporte === 'stdio'
        ? {
            type: 'stdio',
            command: server.comando,
            args: server.args,
            env: { ...server.env, ...server.secretValues },
          }
        : { type: 'http', url: server.url, headers: { ...server.cabecalhos, ...server.secretValues } }
  }
  return { args: ['--mcp-config', file], env: {}, files: [{ path: file, content: JSON.stringify({ mcpServers }, null, 2) }] }
}

/**
 * Codex: `-c mcp_servers.<id>.*`. Segredo nunca vai em argv (a linha de
 * comando e legivel por qualquer processo do usuario): o stdio recebe o nome em
 * `env_vars` e o valor pelo ambiente do terminal; o HTTP aponta o cabecalho
 * para uma variavel propria em `env_http_headers`.
 */
function codexInjection(servers) {
  const args = []
  const env = {}
  const set = (id, field, value) => args.push('-c', `mcp_servers.${id}.${field}=${value}`)

  for (const server of servers) {
    const secretNames = Object.keys(server.secretValues)
    if (server.transporte === 'stdio') {
      set(server.id, 'command', toml(server.comando))
      if (server.args.length > 0) set(server.id, 'args', toml(server.args))
      if (Object.keys(server.env).length > 0) set(server.id, 'env', toml(server.env))
      if (secretNames.length > 0) set(server.id, 'env_vars', toml(secretNames))
      for (const name of secretNames) {
        // Mesmo nome com valores diferentes nao cabe num unico ambiente.
        if (name in env && env[name] !== server.secretValues[name]) {
          throw new Error(`Os MCPs usam o segredo "${name}" com valores diferentes; o Codex so aceita um por terminal.`)
        }
        env[name] = server.secretValues[name]
      }
    } else {
      set(server.id, 'url', toml(server.url))
      if (Object.keys(server.cabecalhos).length > 0) set(server.id, 'http_headers', toml(server.cabecalhos))
      const viaEnv = {}
      for (const name of secretNames) {
        const variable = `FELIXO_MCP_${server.id.toUpperCase().replace(/-/g, '_')}_${name.toUpperCase().replace(/-/g, '_')}`
        viaEnv[name] = variable
        env[variable] = server.secretValues[name]
      }
      if (secretNames.length > 0) set(server.id, 'env_http_headers', toml(viaEnv))
    }
  }
  return { args, env, files: [] }
}

/** Gemini 0.65: `mcpServers` com `url` + `type: "http"` (o `httpUrl` esta obsoleto). */
function geminiSettings(servers) {
  const mcpServers = {}
  for (const server of servers) {
    mcpServers[server.id] =
      server.transporte === 'stdio'
        ? { command: server.comando, args: server.args, env: { ...server.env, ...server.secretValues } }
        : { url: server.url, type: 'http', headers: { ...server.cabecalhos, ...server.secretValues } }
  }
  return JSON.stringify({ mcpServers }, null, 2)
}

// JSON basico e TOML valido para string, lista de strings e tabela inline.
function toml(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const pairs = Object.entries(value).map(([key, item]) => `${BARE_KEY.test(key) ? key : JSON.stringify(key)}=${JSON.stringify(item)}`)
    return `{${pairs.join(',')}}`
  }
  return JSON.stringify(value)
}

function createMcpInjection({ registry, userData, fileSystem = fs } = {}) {
  const sessionsDir = path.join(userData, 'mcp', 'sessions')

  /** @returns {{ args: string[], env: Record<string,string>, dispose: () => void } | null} */
  return function build({ ids, providerId, sessionId }) {
    if (providerId !== 'claude' && providerId !== 'codex') return null
    const servers = registry.resolve(ids)
    if (servers.length === 0) return null

    const safeName = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')
    const file = path.join(sessionsDir, `${safeName}.claude.json`)
    const { args, env, files } = providerId === 'claude' ? claudeInjection(servers, file) : codexInjection(servers)

    for (const entry of files) {
      fileSystem.mkdirSync(path.dirname(entry.path), { recursive: true })
      fileSystem.writeFileSync(entry.path, entry.content, { encoding: 'utf8', mode: 0o600 })
    }
    const dispose = () => {
      for (const entry of files) {
        try {
          fileSystem.unlinkSync(entry.path)
        } catch {
          // Ja apagado (outro spawn da mesma sessao ou limpeza da pasta).
        }
      }
    }
    return { args, env, dispose }
  }
}

module.exports = { createMcpInjection, claudeInjection, codexInjection, geminiSettings }
