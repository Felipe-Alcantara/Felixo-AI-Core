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
const { killProcessTree } = require('../core/process-tree.cjs')
const { compareCliVersions, coreVersion } = require('./cli-auto-install-plan.cjs')

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const LATEST_LOOKUP_TIMEOUT_MS = 30 * 1000
const OUTPUT_LIMIT = 12000

/**
 * Monta os argumentos do npm para instalar dentro do prefixo do app.
 *
 * `--no-audit`/`--no-fund` só cortam ruído de saída. `--loglevel=error`
 * mantém o log legível para quem eventualmente for ler o relatório de falha.
 *
 * `--cache` (quando `cacheDir` é passado) aponta o npm para uma pasta
 * persistente dentro do `userData` do app, em vez do cache global padrão do
 * sistema (`~/.npm`). O tarball é endereçado pelo hash, então é reaproveitado
 * do cache nos dois modos abaixo; o que muda é a lista de versões do pacote:
 *
 * - `--prefer-offline` usa a lista guardada sem perguntar ao registry. Serve
 *   para o alvo do manifesto de fallback, que só existe quando o registry não
 *   respondeu.
 * - `--prefer-online` (`preferOnline`) revalida a lista. É obrigatório quando o
 *   alvo acabou de vir do registry: uma lista guardada de antes da publicação
 *   não tem a versão, e o npm responde ETARGET (caso real em 14/10/2026, com o
 *   Claude Code 2.1.300).
 *
 * @param {object} options
 * @param {string} options.npmCliPath
 * @param {string} options.npmPackage
 * @param {string} options.prefix
 * @param {string} [options.cacheDir]
 * @param {boolean} [options.preferOnline] - O alvo foi confirmado no registry agora.
 * @returns {string[]}
 */
function createNpmInstallArgs({ npmCliPath, npmPackage, prefix, cacheDir, preferOnline = false }) {
  return [
    npmCliPath,
    'install',
    '--global',
    '--prefix',
    prefix,
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
    ...(cacheDir ? ['--cache', cacheDir, preferOnline ? '--prefer-online' : '--prefer-offline'] : []),
    npmPackage,
  ]
}

/**
 * Consulta os canais publicados (`dist-tags`) e a data de publicação de cada
 * versão (`time`) de um pacote, com `--prefer-online` para nunca reaproveitar
 * um canal antigo do cache.
 *
 * @param {object} options
 * @param {string} options.npmCliPath
 * @param {string} options.npmPackage
 * @returns {string[]}
 */
function createNpmViewChannelsArgs({ npmCliPath, npmPackage }) {
  return [npmCliPath, 'view', '--prefer-online', npmPackage, 'dist-tags', 'time', '--json']
}

/**
 * O mapa de datas lista todas as versões já publicadas (o do Codex passa de
 * 300 KB, por causa dos binários de plataforma), muito acima do que a saída
 * guardada de um comando comum precisa.
 */
const CHANNELS_OUTPUT_LIMIT = 4 * 1024 * 1024

/**
 * Versão que é o binário de UMA plataforma, publicada como versão do próprio
 * pacote (o Codex faz isso: `0.162.1-win32-x64`). Ela ordena acima da versão
 * principal e não é instalável sozinha, então nunca pode virar o alvo.
 */
const PLATFORM_PAYLOAD_VERSION = /-(?:linux|darwin|win32)-(?:x64|arm64)(?:-musl)?$/

/**
 * Escolhe a versão mais nova entre os canais publicados, inclusive os de
 * pré-lançamento (`next`, `preview`, `alpha`, `nightly`), que é a política
 * de atualização das CLIs.
 *
 * "Mais nova" é a maior versão principal (`0.65.0` acima de `0.64.0`) e, dentro
 * dela, a publicada por último: a nightly de 14/10 do Gemini vem depois da
 * preview de 13/10, embora "preview" ordene acima de "nightly" no semver. Sem as
 * datas, vale o semver. Canais que apontam para um binário de plataforma ou para
 * algo que não é semver são ignorados.
 *
 * @param {Record<string, unknown> | null | undefined} distTags
 * @param {Record<string, unknown> | null | undefined} [publishTimes] - Versão -> data ISO.
 * @returns {{ version: string, tag: string } | null}
 */
function chooseNewestPublishedVersion(distTags, publishTimes = null) {
  if (!distTags || typeof distTags !== 'object') return null
  const candidates = Object.entries(distTags)
    .filter(([, version]) => isValidPackageVersion(version) && !PLATFORM_PAYLOAD_VERSION.test(version))
    .map(([tag, version]) => ({ tag, version, publishedAt: publishedAtOf(publishTimes, version) }))
  if (candidates.length === 0) return null

  let newest = candidates[0]
  for (const candidate of candidates.slice(1)) {
    const core = compareCliVersions(coreVersion(candidate.version), coreVersion(newest.version))
    if (core === 1) {
      newest = candidate
      continue
    }
    if (core !== 0) continue
    const byTime = candidate.publishedAt - newest.publishedAt
    const bySemver = compareCliVersions(candidate.version, newest.version)
    // Em empate total, `latest` dá o nome ao canal: é o mais fácil de reconhecer no aviso.
    if (
      byTime > 0 ||
      (byTime === 0 && bySemver === 1) ||
      (byTime === 0 && bySemver === 0 && candidate.tag === 'latest')
    ) {
      newest = candidate
    }
  }
  return { version: newest.version, tag: newest.tag }
}

function publishedAtOf(publishTimes, version) {
  const value = publishTimes && typeof publishTimes === 'object' ? Date.parse(publishTimes[version]) : NaN
  return Number.isNaN(value) ? 0 : value
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

  // Fatia 3/5 de "cache offline por perfil": defesa em profundidade — a
  // instalação gerenciada roda no processo principal, nunca dentro da PTY de
  // uma conta, então não deveria herdar credencial nenhuma. Mas
  // `createCliEnv` clona `baseEnv` (`process.env` por padrão) inteiro, sem
  // filtrar; se alguma dessas chaves algum dia acabar setada no processo
  // principal por engano, ela vazaria pro ambiente do `npm install` e,
  // por extensão, pro cache offline que ele escreve. Removidas
  // explicitamente aqui, não confiando em "isso nunca deveria acontecer".
  delete env.CODEX_HOME
  delete env.CLAUDE_CONFIG_DIR
  delete env.OPENROUTER_API_KEY
  delete env.FELIXO_REAL_HOME

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
  return [npmCliPath, 'view', '--prefer-online', npmPackage, 'dist.integrity']
}

/**
 * Resolve o alvo mais novo e o hash que sera conferido imediatamente antes
 * da instalacao. O manifesto versionado continua sendo o fallback do
 * chamador quando o registry estiver indisponivel.
 *
 * @param {object} options
 * @param {string} options.npmPackage - Nome sem versao, ex.: `@openai/codex`.
 * @param {string} options.npmCliPath
 * @param {string} options.nodeExecutable
 * @param {import('../core/managed-cli-paths.cjs').ManagedCliLayout} options.layout
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.spawn]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.platformName]
 * @param {Function} [options.killTree]
 * @returns {Promise<{ ok: boolean, npmPackage?: string, version?: string, integrity?: string, message: string, output: string }>}
 */
async function resolveLatestManagedPackage({
  npmPackage,
  npmCliPath,
  nodeExecutable,
  layout,
  signal,
  spawn = spawnChildProcess,
  timeoutMs = LATEST_LOOKUP_TIMEOUT_MS,
  platformName = platformAdapter.name,
  killTree = killProcessTree,
}) {
  const env = createManagedInstallEnv({ layout, platformName })
  const query = (args, successMessage, failureMessage, outputLimit) =>
    runCommand({
      outputLimit,
      command: nodeExecutable,
      args,
      env,
      cwd: layout.root,
      signal,
      spawn,
      timeoutMs,
      platformName,
      killTree,
      successMessage,
      failureMessage,
    })

  const tagsResult = await query(
    createNpmViewChannelsArgs({ npmCliPath, npmPackage }),
    `Canais de ${npmPackage} consultados.`,
    `Nao foi possivel consultar os canais de ${npmPackage}.`,
    CHANNELS_OUTPUT_LIMIT,
  )
  if (!tagsResult.ok) {
    return tagsResult
  }

  const channels = parseJsonObject(tagsResult.output)
  const newest = chooseNewestPublishedVersion(
    channels?.['dist-tags'] ?? channels,
    channels?.time,
  )
  if (!newest) {
    return {
      ok: false,
      message: `O registry devolveu canais inválidos para ${npmPackage}.`,
      output: tagsResult.output,
    }
  }

  const integrityResult = await query(
    createNpmViewIntegrityArgs({ npmCliPath, npmPackage: `${npmPackage}@${newest.version}` }),
    `Hash de ${npmPackage}@${newest.version} consultado.`,
    `Nao foi possivel consultar o hash de ${npmPackage}@${newest.version}.`,
  )
  const integrity = String(integrityResult.output ?? '').trim()
  if (!integrityResult.ok || !isValidIntegrity(integrity)) {
    return {
      ok: false,
      message: `O registry não devolveu o hash de ${npmPackage}@${newest.version}.`,
      output: integrityResult.output,
    }
  }

  return {
    ok: true,
    npmPackage,
    version: newest.version,
    integrity,
    tag: newest.tag,
    message: `${npmPackage}@${newest.version} é a versão mais nova publicada (canal ${newest.tag}).`,
    // O mapa de datas é enorme e não serve para diagnóstico.
    output: '',
  }
}

function parseJsonObject(output) {
  try {
    const value = JSON.parse(String(output ?? '').trim())
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function isValidPackageVersion(version) {
  return typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
}

function isValidIntegrity(integrity) {
  return typeof integrity === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)
}

/**
 * Confere, contra o registry, se o hash do pacote exato escolhido ainda é o
 * mesmo antes de deixar o npm baixar e extrair qualquer coisa.
 *
 * Isso é defesa em profundidade, não substituição da verificação que o
 * próprio npm já faz ao instalar (ele recusa um tarball cujo hash não bate
 * com o que o registry anunciou). O que este passo cobre é o cenário em que
 * o registry passa a anunciar, para a mesma versão escolhida, um hash
 * diferente do metadata consultado antes — sinal de pacote alterado ou de
 * registry comprometido, que o npm sozinho aceitaria como válido.
 *
 * @param {object} options
 * @param {string} options.npmPackage - Já com a versão exata, ex.: `pkg@1.2.3`.
 * @param {string} options.expectedIntegrity - Hash esperado, do metadata resolvido.
 * @param {string} options.npmCliPath
 * @param {string} options.nodeExecutable
 * @param {Record<string, string>} options.env
 * @param {string} options.cwd
 * @param {AbortSignal} [options.signal] - Cancelamento externo.
 * @param {Function} [options.spawn]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.platformName]
 * @returns {Promise<{ ok: boolean, message: string, output: string }>}
 */
async function verifyManagedPackageIntegrity({
  npmPackage,
  expectedIntegrity,
  npmCliPath,
  nodeExecutable,
  env,
  cwd,
  signal,
  spawn = spawnChildProcess,
  timeoutMs = INSTALL_TIMEOUT_MS,
  platformName = platformAdapter.name,
  killTree = killProcessTree,
}) {
  const args = createNpmViewIntegrityArgs({ npmCliPath, npmPackage })

  const result = await runCommand({
    command: nodeExecutable,
    args,
    env,
    cwd,
    signal,
    spawn,
    timeoutMs,
    platformName,
    killTree,
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
 * @param {string} [options.expectedIntegrity] - Hash esperado, do metadata resolvido.
 * @param {string} [options.cacheDir] - Cache offline do npm (`getNpmRegistryCacheDir`).
 * @param {boolean} [options.preferOnline] - Revalida a lista de versões (ver `createNpmInstallArgs`).
 * @param {(line: string) => void} [options.onLog]
 * @param {AbortSignal} [options.signal] - Cancelamento externo (ex.: a pessoa fechou o diálogo de instalação).
 * @param {Function} [options.spawn] - Injetável nos testes.
 * @param {number} [options.timeoutMs]
 * @param {string} [options.platformName]
 * @returns {Promise<{ ok: boolean, message: string, output: string, cancelled?: boolean }>}
 */
async function installManagedPackage({
  npmPackage,
  npmCliPath,
  nodeExecutable,
  layout,
  expectedIntegrity,
  cacheDir,
  preferOnline = false,
  onLog,
  signal,
  spawn = spawnChildProcess,
  timeoutMs = INSTALL_TIMEOUT_MS,
  platformName = platformAdapter.name,
  killTree = killProcessTree,
}) {
  const env = createManagedInstallEnv({ layout, platformName })

  if (expectedIntegrity) {
    const integrityCheck = await verifyManagedPackageIntegrity({
      npmPackage,
      expectedIntegrity,
      npmCliPath,
      nodeExecutable,
      env,
      cwd: layout.root,
      signal,
      spawn,
      timeoutMs,
      platformName,
      killTree,
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
    cacheDir,
    preferOnline,
  })

  return runCommand({
    command: nodeExecutable,
    args,
    env,
    cwd: layout.root,
    onLog,
    signal,
    spawn,
    timeoutMs,
    platformName,
    killTree,
    successMessage: `${npmPackage} instalado.`,
    failureMessage: `Nao foi possivel instalar ${npmPackage}.`,
  })
}

/**
 * Roda um comando, com dois jeitos de interromper: o `timeoutMs` de sempre e um
 * `signal` (`AbortSignal`) para cancelamento pedido de fora — hoje nenhuma camada
 * acima oferece cancelamento externo de instalação; este é o ponto que passa a
 * aceitar, para quem vier a oferecer (ex.: um botão "cancelar" na interface).
 *
 * Nos dois casos, a árvore de processos inteira é encerrada antes de resolver —
 * não só o processo imediato do `npm`. Um `npm install` roda scripts de
 * pós-instalação como processos-filho do próprio npm; matar só o npm deixa esses
 * netos vivos (reproduzido com processo real em `core/process-tree.test.cjs`).
 * No POSIX isso exige nascer com `detached: true` (vira líder de um grupo de
 * processos próprio, que é o que `killProcessTree` consegue matar por inteiro);
 * sem isso o processo herdaria o grupo do próprio app, e matar o grupo mataria
 * o app junto — por isso o `detached` é condicional à plataforma, nunca fixo.
 */
function runCommand({
  command,
  args,
  env,
  cwd,
  onLog,
  signal,
  spawn,
  timeoutMs,
  platformName,
  killTree = killProcessTree,
  successMessage,
  failureMessage,
  outputLimit = OUTPUT_LIMIT,
}) {
  if (signal?.aborted) {
    return Promise.resolve({ ok: false, cancelled: true, message: `${failureMessage} A instalacao foi cancelada.`, output: '' })
  }

  return new Promise((resolve) => {
    let output = ''
    let settled = false

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Só no POSIX: no Windows não existe kill de grupo por sinal, e
      // `killProcessTree` usa `taskkill /T` ali, que não depende disto.
      detached: platformName !== 'win32',
    })

    const collect = (chunk) => {
      const text = String(chunk)
      output = `${output}${text}`.slice(-(outputLimit ?? OUTPUT_LIMIT))
      onLog?.(text)
    }

    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)

    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    const finish = (result) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ ...result, output: output.trim() })
    }

    // Espera a tentativa de matar a árvore terminar antes de resolver: quem
    // chama isto pode, na sequência, apagar a pasta temporária da instalação
    // (`cwd`) — resolver cedo demais arriscaria apagar um diretório que um
    // script de pós-instalação ainda não tinha soltado.
    const finishAfterKill = async (result) => {
      if (settled) return
      await killTree({ pid: child.pid, platformName })
      finish(result)
    }

    const timer = setTimeout(() => {
      void finishAfterKill({
        ok: false,
        message: `${failureMessage} A instalacao passou do tempo limite.`,
      })
    }, timeoutMs)

    const onAbort = () => {
      void finishAfterKill({
        ok: false,
        cancelled: true,
        message: `${failureMessage} A instalacao foi cancelada.`,
      })
    }
    signal?.addEventListener('abort', onAbort, { once: true })

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
  LATEST_LOOKUP_TIMEOUT_MS,
  createManagedInstallEnv,
  createNpmInstallArgs,
  chooseNewestPublishedVersion,
  createNpmViewChannelsArgs,
  createNpmViewIntegrityArgs,
  installManagedPackage,
  resolveLatestManagedPackage,
  runCommand,
  verifyManagedPackageIntegrity,
}
