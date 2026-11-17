'use strict'

const { execFile } = require('node:child_process')

const CLI_NAME = 'notion-tasks'
const CLI_TIMEOUT_MS = 15000
const INSTALL_HINT = 'pipx install notion-automacoes'

/**
 * Credencial do Notion para o terminal de um agente: o token da conexão que o
 * app já guarda (cofre `safeStorage` de `notion-connection-store.cjs`) vira a
 * variavel `NOTION_TOKEN` so no ambiente daquele terminal, que e onde a CLI
 * `notion-tasks` o le. O renderer so manda o id da conexao; o valor nunca
 * atravessa a ponte, nunca vai para argv, log nem arquivo de contexto.
 * Conexao inexistente ou sem token = `null` (o terminal nasce sem credencial).
 */
function createNotionAgentEnv({ getConnectionStore } = {}) {
  return function buildNotionEnv(connectionId) {
    if (typeof connectionId !== 'string' || !connectionId.trim()) return null
    const credential = getConnectionStore?.()?.getCredential(connectionId.trim())
    return credential?.token ? { NOTION_TOKEN: credential.token } : null
  }
}

/**
 * Diagnostico da CLI sem token: `perfis listar` so le o arquivo local de perfis
 * (o token sai mascarado e nem e repassado). O perfil ativo importa porque a
 * CLI o aplica DEPOIS do ambiente: ele vence o `NOTION_TOKEN` entregue pelo app.
 */
function checkNotionCli({ run = runCli, env = process.env } = {}) {
  const cleanEnv = { ...env }
  delete cleanEnv.NOTION_TOKEN
  return run(CLI_NAME, ['--json', 'perfis', 'listar'], cleanEnv).then(
    (stdout) => ({ installed: true, activeProfile: parseActiveProfile(stdout), installHint: INSTALL_HINT }),
    (error) => ({
      installed: error?.code === 'ENOENT' ? false : null,
      activeProfile: null,
      installHint: INSTALL_HINT,
    }),
  )
}

function parseActiveProfile(stdout) {
  try {
    const active = JSON.parse(stdout)?.dados?.ativo
    return typeof active === 'string' && active ? active : null
  } catch {
    return null
  }
}

function runCli(command, args, env) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      // Sem shell: o .exe do pipx resolve pelo PATH e ENOENT vira "nao instalada".
      { env, timeout: CLI_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    )
  })
}

module.exports = { INSTALL_HINT, checkNotionCli, createNotionAgentEnv }
