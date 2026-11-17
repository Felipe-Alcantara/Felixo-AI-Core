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

const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const { logQaEvent } = require('./qa-logger.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { discoverAgentModels } = require('./agent-models/agent-model-discovery.cjs')
const { createAgentModelStore } = require('./agent-models/agent-model-store.cjs')
const { createCliRunner } = require('./agent-models/agent-model-runner.cjs')
const { createAgentModelRefresher } = require('./agent-models/agent-model-refresher.cjs')

/** Uma CLI de agente carrega bastante antes de responder ao `/model`. */
const CLI_TIMEOUT_MS = 30_000

function registerAgentModelsIpcHandlers(appPaths, dependencies = {}) {
  const store =
    dependencies.store ?? createAgentModelStore({ cacheDir: appPaths.cache })
  const runner = createCliRunner({ timeoutMs: CLI_TIMEOUT_MS })
  const refresh = createAgentModelRefresher({
    store,
    discover: dependencies.discover ?? discoverAgentModels,
    runCli: (comando, args) => runner(comando, args, createCliEnv()),
    readCodexCache,
    timeoutMs: CLI_TIMEOUT_MS,
    log: (details) =>
      logQaEvent({
        level: 'info',
        scope: 'agent-models:refresh',
        message: 'Descoberta de modelos das CLIs concluida.',
        details,
      }),
  })

  ipcMain.handle('agent-models:get', async () => {
    try {
      return { ok: true, catalog: (await store.read()) ?? {} }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel ler os modelos em cache.')
    }
  })

  ipcMain.handle('agent-models:refresh', async () => {
    try {
      return await refresh()
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel consultar os modelos das CLIs.')
    }
  })
}

/** O cache que a própria CLI do Codex mantém, com modelos e esforços. */
function readCodexCache() {
  return fsp.readFile(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8')
}

module.exports = {
  registerAgentModelsIpcHandlers,
}
