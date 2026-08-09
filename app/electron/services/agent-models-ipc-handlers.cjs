/**
 * @module agent-models-ipc-handlers
 * Expõe ao renderer os modelos que cada CLI de agente oferece hoje.
 *
 * `agent-models:get` responde na hora, a partir do cache em disco — é o que
 * faz o menu de agentes abrir instantâneo com a lista certa. `agent-models:refresh`
 * consulta as CLIs, grava o cache e devolve o resultado; o renderer o chama em
 * background ao abrir o app e ao clicar em "atualizar".
 *
 * Nenhum dos dois falha: sem cache e sem descoberta, o renderer recebe `{}` e
 * usa a lista fixa do próprio código, para que o menu nunca abra vazio.
 */

const { execFile } = require('node:child_process')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { discoverAgentModels } = require('./agent-models/agent-model-discovery.cjs')
const { mergeDiscovered } = require('./agent-models/agent-model-catalog.cjs')
const { createAgentModelStore } = require('./agent-models/agent-model-store.cjs')

/** Uma CLI de agente carrega bastante antes de responder ao `/model`. */
const CLI_TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

function registerAgentModelsIpcHandlers(appPaths, dependencies = {}) {
  const store =
    dependencies.store ?? createAgentModelStore({ cacheDir: appPaths.cache })
  const discover = dependencies.discover ?? discoverAgentModels

  ipcMain.handle('agent-models:get', async () => {
    try {
      return { ok: true, catalog: (await store.read()) ?? {} }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel ler os modelos em cache.')
    }
  })

  ipcMain.handle('agent-models:refresh', async () => {
    try {
      const descoberto = await discover({
        runCli,
        readCodexCache,
        timeoutMs: CLI_TIMEOUT_MS,
      })

      const catalogo = mergeDiscovered(
        Object.entries(descoberto).map(([agentId, dados]) => ({ agentId, ...dados })),
      )
      const gravou = await store.save(catalogo)

      logQaEvent({
        level: 'info',
        scope: 'agent-models:refresh',
        message: 'Descoberta de modelos das CLIs concluida.',
        details: {
          agentes: Object.keys(descoberto),
          gravouCache: gravou,
        },
      })

      // Sem descoberta, devolve o cache atual em vez de vazio: o renderer não
      // deve regredir para a lista fixa só porque uma rodada falhou.
      return { ok: true, catalog: catalogo ?? (await store.read()) ?? {} }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel consultar os modelos das CLIs.')
    }
  })
}

/**
 * Executa a CLI e devolve stdout+stderr juntos.
 *
 * As duas correntes são unidas de propósito: algumas CLIs escrevem a listagem
 * em stderr, e outras saem com código != 0 mesmo tendo impresso a lista. Só
 * uma saída totalmente vazia conta como falha.
 */
function runCli(comando, args) {
  return new Promise((resolve, reject) => {
    execFile(
      comando,
      args,
      { timeout: CLI_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env: createCliEnv() },
      (erro, stdout, stderr) => {
        const saida = `${stdout ?? ''}\n${stderr ?? ''}`

        if (erro && !saida.trim()) {
          reject(erro)
          return
        }

        resolve(saida)
      },
    )
  })
}

/** O cache que a própria CLI do Codex mantém, com modelos e esforços. */
function readCodexCache() {
  return fsp.readFile(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8')
}

module.exports = {
  registerAgentModelsIpcHandlers,
}
