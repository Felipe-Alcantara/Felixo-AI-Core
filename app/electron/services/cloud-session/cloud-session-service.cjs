'use strict'

/**
 * Serviço do "Agente na nuvem": cria uma sessão do Claude Code na nuvem
 * (`claude --cloud`) e envia follow-ups (`claude -p … --cloud <id>`).
 *
 * Por que um serviço e não um bloco de terminal: o `--cloud` exige TTY mas não
 * abre TUI — cria a sessão em poucos segundos e sai. Um bloco de terminal é
 * restaurado e reiniciado pelo app, e cada uma dessas vezes relançaria o
 * comando e gastaria crédito de novo. Aqui o PTY é descartável e só nasce de
 * uma chamada explícita de `launch`.
 *
 * Garantias (cada uma com teste):
 * - a tarefa e o follow-up chegam ao processo só como `argv`;
 * - as credenciais herdadas do Claude (ANTHROPIC_API_KEY etc.) nunca entram,
 *   nem no Login do sistema: a nuvem exige login de assinatura;
 * - um nó só tem uma operação por vez (`busy`).
 */

const fs = require('node:fs')
const { execFile: nodeExecFile } = require('node:child_process')
const defaultPlatform = require('../../core/platform/index.cjs')
const { createCliEnv } = require('../cli-process-manager.cjs')
const { applyProfileEnv } = require('../cli-account-profiles.cjs')
const { createPtyLaunchSpec } = require('../pty-process-manager.cjs')
const { ensureNodePtySpawnHelperExecutable } = require('../pty-native-assets.cjs')
const { buildPosixExecLine, buildWindowsCommandLine } = require('./cloud-session-command-line.cjs')
const { resolveNativeClaude } = require('./cloud-session-executable.cjs')
const {
  hasShellUnsafeChars,
  validateFollowUpInput,
  validateLaunchInput,
} = require('./cloud-session-input.cjs')
const {
  CLOUD_SESSION_ERROR_MESSAGES,
  isFollowUpSent,
  parseCloudSessionOutput,
  summarizeTail,
} = require('./cloud-session-output.cjs')

const LAUNCH_TIMEOUT_MS = 60_000
const FOLLOW_UP_TIMEOUT_MS = 90_000
// Depois de ver a sessão criada, o CLI ainda sai sozinho; só o encerramos se
// ele não o fizer.
const CREATED_GRACE_MS = 3_000
const PTY_COLS = 120
const PTY_ROWS = 40
const MAX_OUTPUT_CHARS = 20_000
const MAX_EXEC_BUFFER = 1024 * 1024

function fail(code, message = CLOUD_SESSION_ERROR_MESSAGES[code]) {
  return { ok: false, code, message }
}

function unknownWithTail(output, exitCode) {
  const suffix = Number.isInteger(exitCode) ? ` (código de saída ${exitCode})` : ''
  const tail = summarizeTail(output)
  return fail('unknown', `${CLOUD_SESSION_ERROR_MESSAGES.unknown}${suffix}${tail ? `\n${tail}` : ''}`)
}

/** Falhas que a pessoa não causou nem corrige sozinha: nível `error` no log. */
const ERROR_LEVEL_CODES = new Set(['timeout', 'unknown', 'interrupted'])

/**
 * Traduz o evento de uma operação em entrada de log: nível, mensagem neutra e
 * detalhes. Nada que a pessoa digitou (tarefa, mensagem), nenhuma pasta e
 * nenhum ID de sessão entram aqui — o log ajuda a rastrear a falha sem expor
 * conteúdo privado (DESIGN_SYSTEM_BACKEND §9.2 e README §3.5).
 *
 * @param {{ operation: 'launch' | 'follow-up', ok: boolean, code?: string, durationMs: number }} event
 * @returns {{ level: 'info' | 'warn' | 'error', message: string, details: Record<string, unknown> }}
 */
function describeCloudSessionEvent(event) {
  const { operation, ok, code, durationMs } = event
  if (ok) {
    const done = operation === 'launch' ? 'Sessão na nuvem criada' : 'Mensagem enviada à sessão na nuvem'
    return { level: 'info', message: `${done} em ${durationMs} ms.`, details: { operation, durationMs } }
  }
  const attempted = operation === 'launch' ? 'criar a sessão na nuvem' : 'enviar a mensagem à sessão na nuvem'
  return {
    level: ERROR_LEVEL_CODES.has(code) ? 'error' : 'warn',
    message: `Falha ao ${attempted} (${code}) após ${durationMs} ms.`,
    details: { operation, code, durationMs },
  }
}

function loadNodePtySpawn(platformName) {
  // Mesmo preparo que o terminal do canvas faz: no macOS o spawn-helper do
  // node-pty pode vir sem o bit de execução.
  if (platformName === 'darwin') {
    const helper = ensureNodePtySpawnHelperExecutable({ platformName })
    if (!helper.ok) {
      throw new Error(`não foi possível preparar o helper nativo do node-pty: ${helper.reason}`)
    }
  }
  return require('node-pty').spawn
}

/**
 * @param {object} [dependencies] Tudo é injetável para teste.
 * @param {(file: string, args: string[], options: object) => object} [dependencies.spawnPty]
 * @param {typeof nodeExecFile} [dependencies.execFile]
 * @param {(accountId?: string) => Record<string, string>} [dependencies.resolveProfileEnv]
 *   Variáveis do perfil da conta (`cliAccounts.buildEnv`); lança se a conta não existe.
 * @param {() => Record<string, string | undefined>} [dependencies.createBaseEnv]
 * @param {typeof resolveNativeClaude} [dependencies.resolveClaude]
 * @param {{ name: string }} [dependencies.platform]
 * @param {{ statSync: (target: string) => { isDirectory(): boolean } }} [dependencies.fsApi]
 * @param {(event: { operation: 'launch' | 'follow-up', ok: boolean, code?: string, durationMs: number }) => void} [dependencies.onEvent]
 *   Recebe o resultado de cada operação (sem tarefa, mensagem, pasta nem ID);
 *   o main o liga ao QA Logger com `describeCloudSessionEvent`.
 * @param {() => number} [dependencies.now]
 */
function createCloudSessionService({
  spawnPty,
  execFile = nodeExecFile,
  resolveProfileEnv = () => ({}),
  createBaseEnv = () => createCliEnv(),
  resolveClaude = resolveNativeClaude,
  platform = defaultPlatform,
  fsApi = fs,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onEvent = () => {},
  now = () => Date.now(),
} = {}) {
  /** Nós com uma operação em andamento. */
  const busyNodes = new Set()
  /** Operações com PTY vivo, para `dispose`. */
  const active = new Set()

  /**
   * Registra o fim de uma operação. `busy` e entrada inválida ficam de fora:
   * são ruído de uso do cartão, não falha de integração. Um log com defeito
   * nunca pode mudar o resultado de quem criou a sessão.
   */
  async function reported(operation, run) {
    const startedAt = now()
    const result = await run()
    if (result.ok === false && (result.code === 'busy' || result.code === 'invalid-input')) {
      return result
    }
    try {
      onEvent({
        operation,
        ok: result.ok,
        ...(result.ok ? {} : { code: result.code }),
        durationMs: Math.max(0, now() - startedAt),
      })
    } catch {
      // Observabilidade é melhor esforço.
    }
    return result
  }

  function readNodeId(value) {
    return typeof value === 'string' && value.trim() ? value : null
  }

  function buildEnv(accountId) {
    const profileEnv = resolveProfileEnv(accountId)
    // `applyProfileEnv` remove as credenciais herdadas do Claude mesmo quando
    // o perfil é vazio (Login do sistema): a nuvem exige login de assinatura.
    return applyProfileEnv(createBaseEnv(), { providerId: 'claude', profileEnv }, platform.name)
  }

  /**
   * O que executar: o binário nativo direto, ou o launch spec do app.
   *
   * - Windows, PTY: a linha de comando é montada aqui, porque o node-pty não cita
   *   um argumento que começa e termina com aspas (cloud-session-command-line.cjs).
   *   O `execFile` (follow-up) cita certo e recebe a lista.
   * - macOS: um app com janela herda um PATH reduzido, então o `claude` roda pelo
   *   shell de login. O texto NÃO passa pelo escape de shell: cada argumento viaja
   *   numa variável de ambiente e o shell só a expande entre aspas duplas. O
   *   follow-up não tem TTY, então usa o shell de login sem `-i`.
   * - Linux e o resto: o node-pty entrega a lista como argv ao processo.
   * - Só o shim `.cmd` do Windows (`viaShell`) usa o launch spec do app.
   */
  function buildSpec(claude, args, env, { pty }) {
    if (claude.viaShell) {
      return createPtyLaunchSpec(claude.command, args, env, platform)
    }
    if (platform.name === 'darwin') {
      const variables = Object.fromEntries(args.map((value, index) => [`FELIXO_ARG_${index}`, String(value)]))
      const line = buildPosixExecLine(platform.escapeArg(claude.command), args.length)
      return {
        command: platform.getDefaultShell(env),
        args: pty ? ['-l', '-i', '-c', line] : ['-l', '-c', line],
        env: { ...env, ...variables },
      }
    }
    return {
      command: claude.command,
      args: pty && platform.name === 'win32' ? buildWindowsCommandLine(args) : args,
    }
  }

  /** Env + executável + recusa de texto que um shell reinterpretaria. */
  function prepare(accountId, args, freeText, { pty }) {
    let env
    try {
      env = buildEnv(accountId)
    } catch (error) {
      return { error: fail('invalid-input', error?.message || CLOUD_SESSION_ERROR_MESSAGES['invalid-input']) }
    }
    const claude = resolveClaude({ platformName: platform.name, env })
    if (claude.viaShell && hasShellUnsafeChars(freeText)) {
      return {
        error: fail(
          'invalid-input',
          'Não encontrei o programa nativo do Claude neste computador; sem ele o texto não pode ter % " ^ & | < > nem quebras de linha.',
        ),
      }
    }
    const spec = buildSpec(claude, args, env, { pty })
    return { env: spec.env ?? env, spec }
  }

  function runPty(spec, cwd, env) {
    return new Promise((resolve) => {
      let output = ''
      let settled = false
      let exited = false
      let pty = null
      let timeoutId = null
      let graceId = null

      const kill = () => {
        if (!pty || exited) return
        try {
          pty.kill()
        } catch {
          // O processo já pode ter saído entre a checagem e o kill.
        }
      }
      const handle = {
        abort: () => finish(fail('interrupted')),
      }
      const finish = (result, { graceMs = 0 } = {}) => {
        if (settled) return
        settled = true
        clearTimeoutFn(timeoutId)
        resolve(result)
        if (graceMs > 0 && !exited) {
          graceId = setTimeoutFn(() => {
            graceId = null
            kill()
            active.delete(handle)
          }, graceMs)
          return
        }
        kill()
        active.delete(handle)
      }

      // `final` só vale depois da saída do processo: antes disso a última linha
      // pode estar cortada no meio do ID.
      const evaluate = (final) => {
        const parsed = parseCloudSessionOutput(output, { final })
        if (parsed.kind === 'created') {
          finish({ ok: true, session: parsed.session }, { graceMs: CREATED_GRACE_MS })
          return true
        }
        if (parsed.kind === 'trust-required') {
          finish(fail('trust-required'))
          return true
        }
        if (parsed.kind === 'error') {
          finish(fail(parsed.code, parsed.message))
          return true
        }
        return false
      }

      try {
        const factory = spawnPty ?? loadNodePtySpawn(platform.name)
        pty = factory(spec.command, spec.args, {
          name: 'xterm-256color',
          cols: PTY_COLS,
          rows: PTY_ROWS,
          cwd,
          env,
        })
      } catch {
        resolve(fail('unknown', 'Não foi possível iniciar o Claude neste computador.'))
        return
      }

      active.add(handle)
      timeoutId = setTimeoutFn(() => finish(fail('timeout')), LAUNCH_TIMEOUT_MS)

      pty.onData((chunk) => {
        if (settled) return
        output = `${output}${String(chunk)}`.slice(-MAX_OUTPUT_CHARS)
        evaluate(false)
      })
      pty.onExit((info) => {
        exited = true
        active.delete(handle)
        if (graceId !== null) {
          clearTimeoutFn(graceId)
          graceId = null
        }
        if (settled) return
        if (!evaluate(true)) {
          finish(unknownWithTail(output, info?.exitCode))
        }
      })
    })
  }

  function runExec(spec, cwd, env) {
    return new Promise((resolve) => {
      try {
        const child = execFile(
          spec.command,
          spec.args,
          { cwd, env, timeout: FOLLOW_UP_TIMEOUT_MS, windowsHide: true, maxBuffer: MAX_EXEC_BUFFER, encoding: 'utf8' },
          (error, stdout, stderr) => {
            const output = `${stdout ?? ''}\n${stderr ?? ''}`
            if (isFollowUpSent(output)) {
              resolve({ ok: true })
              return
            }
            if (error?.killed) {
              resolve(fail('timeout'))
              return
            }
            const parsed = parseCloudSessionOutput(output, { final: true })
            resolve(parsed.kind === 'error' ? fail(parsed.code, parsed.message) : unknownWithTail(output))
          },
        )
        // Sem fechar o stdin o CLI espera 3 s por dados que nunca chegam.
        child?.stdin?.end()
      } catch {
        resolve(fail('unknown', 'Não foi possível executar o Claude neste computador.'))
      }
    })
  }

  async function runLaunch(input) {
    const nodeId = readNodeId(input?.nodeId)
    if (!nodeId) return fail('invalid-input')
    const valid = validateLaunchInput({ task: input?.task, cwd: input?.cwd }, fsApi)
    if (!valid.ok) return valid
    if (busyNodes.has(nodeId)) return fail('busy')

    busyNodes.add(nodeId)
    try {
      const prepared = prepare(input?.accountId, ['--cloud', valid.task], valid.task, { pty: true })
      if (prepared.error) return prepared.error
      return await runPty(prepared.spec, valid.cwd, prepared.env)
    } finally {
      busyNodes.delete(nodeId)
    }
  }

  async function runFollowUp(input) {
    const nodeId = readNodeId(input?.nodeId)
    if (!nodeId) return fail('invalid-input')
    const valid = validateFollowUpInput(
      { sessionId: input?.sessionId, text: input?.text, cwd: input?.cwd },
      fsApi,
    )
    if (!valid.ok) return valid
    if (busyNodes.has(nodeId)) return fail('busy')

    busyNodes.add(nodeId)
    try {
      const prepared = prepare(input?.accountId, ['-p', valid.text, '--cloud', valid.sessionId], valid.text, { pty: false })
      if (prepared.error) return prepared.error
      return await runExec(prepared.spec, valid.cwd, prepared.env)
    } finally {
      busyNodes.delete(nodeId)
    }
  }

  /**
   * Cria uma sessão na nuvem. Só é chamada por um clique confirmado no cartão.
   *
   * @param {{ nodeId: string, task: string, cwd: string, accountId?: string }} input
   * @returns {Promise<{ ok: true, session: { id: string, url: string, title: string } } | { ok: false, code: string, message: string }>}
   */
  function launch(input) {
    return reported('launch', () => runLaunch(input))
  }

  /**
   * Envia uma mensagem a uma sessão existente.
   *
   * @param {{ nodeId: string, sessionId: string, text: string, cwd: string, accountId?: string }} input
   * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
   */
  function followUp(input) {
    return reported('follow-up', () => runFollowUp(input))
  }

  /** Encerra os PTY vivos (fechamento do app). */
  function dispose() {
    for (const handle of [...active]) handle.abort()
  }

  return { launch, followUp, dispose }
}

module.exports = {
  CREATED_GRACE_MS,
  FOLLOW_UP_TIMEOUT_MS,
  LAUNCH_TIMEOUT_MS,
  createCloudSessionService,
  describeCloudSessionEvent,
}
