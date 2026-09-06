/**
 * @module managed-cli-installer
 * Instala uma CLI oficial na pasta gerenciada pelo app.
 *
 * Diferente de `official-cli-service`, que roda o comando oficial (`npm i -g`)
 * com o Node da máquina, aqui a instalação usa o npm empacotado e o Node
 * embutido no Electron, com `--prefix` apontando para a pasta do app. É o
 * caminho usado pela instalação automática: funciona em máquina sem Node,
 * sem permissão de administrador e sem mexer no ambiente global de quem já
 * tem as CLIs instaladas.
 */

const spawnChildProcess = require('cross-spawn')
const path = require('node:path')
const platformAdapter = require('../core/platform/index.cjs')
const { createNodeEnv } = require('../core/node-runtime.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const OUTPUT_LIMIT = 12000

/**
 * Monta os argumentos do npm para instalar dentro do prefixo do app.
 *
 * `--no-audit`/`--no-fund` só cortam ruído de saída. `--loglevel=error`
 * mantém o log legível para quem eventualmente for ler o relatório de falha.
 *
 * @param {object} options
 * @param {string} options.npmCliPath
 * @param {string} options.npmPackage
 * @param {string} options.prefix
 * @returns {string[]}
 */
function createNpmInstallArgs({ npmCliPath, npmPackage, prefix }) {
  return [
    npmCliPath,
    'install',
    '--global',
    '--prefix',
    prefix,
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    npmPackage,
  ]
}

/**
 * Ambiente do processo de instalação.
 *
 * O atalho `node` do app entra no **início** do PATH aqui — ao contrário do
 * PATH normal das CLIs, onde ele fica por último. Durante a instalação não se
 * trata de escolher a CLI preferida da pessoa: é o npm precisando de um Node
 * para rodar os scripts de instalação dos pacotes, e o único que temos
 * garantido é o nosso.
 *
 * @param {object} options
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {Record<string, string>} [options.baseEnv]
 * @param {string} [options.platformName]
 * @returns {Record<string, string>}
 */
function createManagedInstallEnv({
  layout,
  baseEnv = process.env,
  platformName = platformAdapter.name,
}) {
  // Usa o adaptador da plataforma pedida, não o do processo real: os testes
  // fixam `platformName` para descrever a máquina Windows/Linux/macOS que
  // estão simulando, e isso só vale se a chave do PATH e o separador de
  // entradas também seguirem essa escolha, não o SO onde a suíte roda.
  const adapter = platformAdapter.getAdapter(platformName)
  const platformPath = platformName === 'win32' ? path.win32 : path.posix
  // `createCliEnv` usa o adaptador do processo atual. Quando a suíte descreve
  // outro SO, recalculá-lo aqui misturaria delimitadores e ainda poderia
  // substituir `Path` por um `PATH` vazio do host. No app real os dois nomes
  // são iguais; no cenário simulado, o ambiente recebido já é a fonte fiel.
  const cliEnv =
    platformName === platformAdapter.name ? createCliEnv(baseEnv) : { ...baseEnv }
  const env = createNodeEnv(cliEnv)
  const pathKey = adapter.getPathEnvKey(env)

  env[pathKey] = [layout.runtimeBin, env[pathKey]].filter(Boolean).join(platformPath.delimiter)

  if (pathKey !== 'PATH') {
    env.PATH = env[pathKey]
  }

  // O npm respeita o prefixo por config do usuário/ambiente; fixar aqui evita
  // que um `.npmrc` com prefixo global mande os pacotes para fora da pasta do
  // app — onde eles poderiam sobrescrever a instalação da própria pessoa.
  env.npm_config_prefix = layout.root
  env.npm_config_global = 'true'
  env.npm_config_update_notifier = 'false'

  if (platformName === 'win32') {
    env.npm_config_script_shell = env.ComSpec || 'cmd.exe'
  }

  return env
}

/**
 * Monta os argumentos do npm para consultar o hash publicado de um pacote,
 * sem baixar nem instalar nada.
 *
 * @param {object} options
 * @param {string} options.npmCliPath
 * @param {string} options.npmPackage
 * @returns {string[]}
 */
function createNpmViewIntegrityArgs({ npmCliPath, npmPackage }) {
  return [npmCliPath, 'view', npmPackage, 'dist.integrity']
}

/**
 * Confere, contra o registry, se o hash do pacote pinado no manifesto ainda
 * é o mesmo antes de deixar o npm baixar e extrair qualquer coisa.
 *
 * Isso é defesa em profundidade, não substituição da verificação que o
 * próprio npm já faz ao instalar (ele recusa um tarball cujo hash não bate
 * com o que o registry anunciou). O que este passo cobre é o cenário em que
 * o registry passa a anunciar, para a mesma versão pinada, um hash diferente
 * do que foi revisado e commitado no manifesto — sinal de pacote alterado ou
 * de registry comprometido, que o npm sozinho aceitaria como válido.
 *
 * @param {object} options
 * @param {string} options.npmPackage - Já com a versão pinada, ex.: `pkg@1.2.3`.
 * @param {string} options.expectedIntegrity - Hash esperado, do manifesto.
 * @param {string} options.npmCliPath
 * @param {string} options.nodeExecutable
 * @param {Record<string, string>} options.env
 * @param {string} options.cwd
 * @param {Function} [options.spawn]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ ok: boolean, message: string, output: string }>}
 */
async function verifyManagedPackageIntegrity({
  npmPackage,
  expectedIntegrity,
  npmCliPath,
  nodeExecutable,
  env,
  cwd,
  spawn = spawnChildProcess,
  timeoutMs = INSTALL_TIMEOUT_MS,
}) {
  const args = createNpmViewIntegrityArgs({ npmCliPath, npmPackage })

  const result = await runCommand({
    command: nodeExecutable,
    args,
    env,
    cwd,
    spawn,
    timeoutMs,
    successMessage: `Hash de ${npmPackage} consultado.`,
    failureMessage: `Nao foi possivel consultar o hash de ${npmPackage}.`,
  })

  if (!result.ok) {
    return result
  }

  const actualIntegrity = result.output.trim()

  if (actualIntegrity !== expectedIntegrity) {
    return {
      ok: false,
      message: `Hash de ${npmPackage} divergiu do manifesto — instalacao recusada.`,
      output: actualIntegrity,
    }
  }

  return { ok: true, message: `Hash de ${npmPackage} confere com o manifesto.`, output: actualIntegrity }
}

/**
 * Instala um pacote npm na pasta gerenciada.
 *
 * Quando `expectedIntegrity` é passado, o hash é conferido contra o registry
 * **antes** de qualquer download/extração — hash divergente cancela a
 * instalacao e devolve falha, sem chegar a chamar `npm install`. Sem
 * `expectedIntegrity` (pacote fora do manifesto), o comportamento é o
 * mesmo de antes: instala sem checagem prévia de hash.
 *
 * @param {object} options
 * @param {string} options.npmPackage - Pacote a instalar (idealmente já `pkg@versao`).
 * @param {string} options.npmCliPath - `npm-cli.js` empacotado.
 * @param {string} options.nodeExecutable - Binário que roda como Node.
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {string} [options.expectedIntegrity] - Hash esperado, do manifesto.
 * @param {(line: string) => void} [options.onLog]
 * @param {Function} [options.spawn] - Injetável nos testes.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ ok: boolean, message: string, output: string }>}
 */
async function installManagedPackage({
  npmPackage,
  npmCliPath,
  nodeExecutable,
  layout,
  expectedIntegrity,
  onLog,
  spawn = spawnChildProcess,
  timeoutMs = INSTALL_TIMEOUT_MS,
}) {
  const env = createManagedInstallEnv({ layout })

  if (expectedIntegrity) {
    const integrityCheck = await verifyManagedPackageIntegrity({
      npmPackage,
      expectedIntegrity,
      npmCliPath,
      nodeExecutable,
      env,
      cwd: layout.root,
      spawn,
      timeoutMs,
    })

    if (!integrityCheck.ok) {
      onLog?.(integrityCheck.output)
      return integrityCheck
    }
  }

  const args = createNpmInstallArgs({
    npmCliPath,
    npmPackage,
    prefix: layout.root,
  })

  return runCommand({
    command: nodeExecutable,
    args,
    env,
    cwd: layout.root,
    onLog,
    spawn,
    timeoutMs,
    successMessage: `${npmPackage} instalado.`,
    failureMessage: `Nao foi possivel instalar ${npmPackage}.`,
  })
}

function runCommand({
  command,
  args,
  env,
  cwd,
  onLog,
  spawn,
  timeoutMs,
  successMessage,
  failureMessage,
}) {
  return new Promise((resolve) => {
    let output = ''
    let settled = false

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const collect = (chunk) => {
      const text = String(chunk)
      output = `${output}${text}`.slice(-OUTPUT_LIMIT)
      onLog?.(text)
    }

    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...result, output: output.trim() })
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({
        ok: false,
        message: `${failureMessage} A instalacao passou do tempo limite.`,
      })
    }, timeoutMs)

    child.once('error', (error) => {
      finish({
        ok: false,
        message: `${failureMessage} ${error?.message ?? ''}`.trim(),
      })
    })

    child.once('close', (code) => {
      finish(
        code === 0
          ? { ok: true, message: successMessage }
          : { ok: false, message: `${failureMessage} (codigo ${code})` },
      )
    })
  })
}

module.exports = {
  INSTALL_TIMEOUT_MS,
  createManagedInstallEnv,
  createNpmInstallArgs,
  createNpmViewIntegrityArgs,
  installManagedPackage,
  verifyManagedPackageIntegrity,
}
