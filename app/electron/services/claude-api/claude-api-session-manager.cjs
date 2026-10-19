'use strict'

const {
  createLineSplitter,
  translateClaudeStreamMessage,
} = require('./claude-stream-events.cjs')

/**
 * Bloco de conversa do Claude por chave de API.
 *
 * Cada bloco do canvas tem um processo `claude -p` próprio, vivo entre os
 * turnos, falando JSON por linha nos dois sentidos (`--input-format
 * stream-json`). É o mesmo motor que o Agent SDK usa. Com uma chave de API,
 * esse modo usa também o crédito promocional do Agent SDK; o Claude Code
 * interativo só usa saldo comprado.
 *
 * O ambiente é o da conta: `CLAUDE_CONFIG_DIR` do perfil mais
 * `ANTHROPIC_API_KEY`, montado por `applyProfileEnv`, que antes tira qualquer
 * credencial do Claude herdada do app. A chave nunca passa pelo renderer.
 *
 * Pedidos de permissão chegam como `control_request` (com
 * `--permission-prompt-tool stdio`) e ficam esperando a resposta do bloco.
 * Com o Yolo, o processo nasce em `bypassPermissions` e não pede nada.
 */

const MODELOS_PERMITIDOS = /^[a-z0-9][a-z0-9.\-[\]]{0,79}$/i
const ESFORCOS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
const ID_SEGURO = /^[A-Za-z0-9_-]{1,128}$/
const ID_SESSAO_CLAUDE = /^[0-9a-f-]{8,64}$/i
const MAX_MENSAGEM = 400_000
const STDERR_GUARDADO = 4000

/**
 * Tira do ambiente tudo o que um Claude Code pai deixaria herdado.
 *
 * Com o Felixo aberto de dentro de um terminal com Claude Code, o ambiente traz
 * `CLAUDE_CODE_SESSION_ID`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`,
 * `ANTHROPIC_BASE_URL` e afins. Medido em 19/10/2026: com
 * `CLAUDE_CODE_SESSION_ID` herdado, todo bloco gravava a conversa com o mesmo
 * id da sessão pai. Só ficam as duas variáveis da conta.
 */
function sanitizeClaudeApiEnv(env, platformName = process.platform) {
  const keep = new Set(['CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY'])
  const clean = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    const name = platformName === 'win32' ? key.toUpperCase() : key
    const inherited = name === 'CLAUDECODE' || name.startsWith('CLAUDE_') || name.startsWith('ANTHROPIC_')
    if (inherited && !keep.has(name)) continue
    clean[key] = value
  }
  return clean
}

function buildClaudeApiArgs({ model, effort, yolo, resumeSessionId } = {}) {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ]
  if (yolo) {
    args.push('--permission-mode', 'bypassPermissions')
  } else {
    args.push('--permission-mode', 'default', '--permission-prompt-tool', 'stdio')
  }
  if (typeof model === 'string' && MODELOS_PERMITIDOS.test(model.trim())) {
    args.push('--model', model.trim())
  }
  if (typeof effort === 'string' && ESFORCOS.has(effort)) {
    args.push('--effort', effort)
  }
  if (typeof resumeSessionId === 'string' && ID_SESSAO_CLAUDE.test(resumeSessionId)) {
    args.push('--resume', resumeSessionId)
  }
  return args
}

/**
 * @param {object} deps
 * @param {(command: string, args: string[], options: object) => import('node:child_process').ChildProcess} deps.spawnProcess
 * @param {(accountId: string) => { ok: boolean, message?: string }} deps.validateAccount
 * @param {(accountId: string) => Record<string, string>} deps.buildAccountEnv - Ambiente final da conta (já sem credenciais herdadas).
 * @param {(sessionId: string, event: object) => void} deps.emit
 * @param {(entry: object) => void} [deps.log]
 * @param {() => string} [deps.newRequestId]
 */
function createClaudeApiSessionManager({
  spawnProcess,
  validateAccount,
  buildAccountEnv,
  emit,
  log = () => {},
  newRequestId = () => `felixo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
}) {
  /** @type {Map<string, object>} */
  const sessions = new Map()

  function emitTo(sessionId, event) {
    try {
      emit(sessionId, event)
    } catch {
      // A janela pode ter fechado; o processo segue até o stop.
    }
  }

  function writeLine(session, payload) {
    const child = session.child
    if (!child || child.exitCode !== null || !child.stdin || child.stdin.destroyed) return false
    child.stdin.write(`${JSON.stringify(payload)}\n`)
    return true
  }

  function spawnFor(sessionId, session) {
    const env = sanitizeClaudeApiEnv(buildAccountEnv(session.config.accountId))
    const args = buildClaudeApiArgs({
      ...session.config,
      resumeSessionId: session.claudeSessionId ?? session.config.resumeSessionId,
    })
    const child = spawnProcess('claude', args, {
      cwd: session.config.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    session.child = child
    session.stderrTail = ''
    session.pendingPermissions = new Set()

    const splitter = createLineSplitter((line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      for (const event of translateClaudeStreamMessage(message)) {
        if (event.kind === 'ready' && event.claudeSessionId) {
          session.claudeSessionId = event.claudeSessionId
        }
        if (event.kind === 'permission-request' && event.requestId) {
          session.pendingPermissions.add(event.requestId)
        }
        if (event.kind === 'turn-end') {
          session.busy = false
        }
        emitTo(sessionId, event)
      }
    })

    child.stdout?.on('data', (chunk) => splitter.push(chunk))
    child.stderr?.on('data', (chunk) => {
      session.stderrTail = `${session.stderrTail}${chunk.toString('utf8')}`.slice(-STDERR_GUARDADO)
    })
    child.on('error', (error) => {
      if (session.child !== child) return
      session.child = null
      session.busy = false
      const notFound = error?.code === 'ENOENT'
      emitTo(sessionId, {
        kind: 'process-exit',
        code: null,
        message: notFound
          ? 'O Claude Code não foi encontrado. Instale a CLI do Claude (Gerenciar modelos > CLIs oficiais) e tente de novo.'
          : `O Claude Code não abriu: ${error?.message ?? 'erro desconhecido'}.`,
      })
    })
    child.on('close', (code, signal) => {
      splitter.flush()
      if (session.child !== child) return
      session.child = null
      const wasBusy = session.busy
      session.busy = false
      if (session.stopping) return
      const stderr = session.stderrTail.trim()
      emitTo(sessionId, {
        kind: 'process-exit',
        code,
        signal: signal ?? null,
        // Saída normal entre turnos não é erro: o próximo envio reabre com --resume.
        message: wasBusy || (code !== 0 && code !== null)
          ? stderr
            ? `O Claude Code encerrou: ${stderr.split('\n').slice(-3).join(' ')}`
            : `O Claude Code encerrou (código ${code ?? signal ?? '?'}).`
          : null,
      })
      log({ level: code === 0 ? 'info' : 'warn', message: 'Processo do Claude por chave encerrou.', details: { code, signal } })
    })
    return child
  }

  function start(params = {}) {
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : ''
    if (!ID_SEGURO.test(sessionId)) return { ok: false, message: 'Bloco inválido.' }
    const accountId = typeof params.accountId === 'string' ? params.accountId.trim() : ''
    const valid = validateAccount(accountId)
    if (!valid?.ok) return { ok: false, message: valid?.message ?? 'Conta inválida.' }
    if (typeof params.cwd !== 'string' || !params.cwd.trim()) {
      return { ok: false, message: 'Escolha a pasta do projeto do agente.' }
    }

    const previous = sessions.get(sessionId)
    const config = {
      accountId,
      cwd: params.cwd,
      model: typeof params.model === 'string' ? params.model : '',
      effort: typeof params.effort === 'string' ? params.effort : '',
      yolo: params.yolo === true,
      resumeSessionId:
        typeof params.resumeSessionId === 'string' && ID_SESSAO_CLAUDE.test(params.resumeSessionId)
          ? params.resumeSessionId
          : null,
    }
    if (previous) {
      // A retomada não entra na comparação: o bloco manda o id da sessão do
      // Claude a cada envio, e isso não pode reabrir o processo vivo.
      const keyOf = ({ resumeSessionId: _ignored, ...rest }) => JSON.stringify(rest)
      if (keyOf(previous.config) === keyOf(config)) {
        if (!previous.claudeSessionId && config.resumeSessionId) {
          previous.claudeSessionId = config.resumeSessionId
        }
        return { ok: true, alreadyRunning: true }
      }
      stop(sessionId)
    }
    sessions.set(sessionId, {
      config,
      child: null,
      claudeSessionId: config.resumeSessionId,
      busy: false,
      stopping: false,
      stderrTail: '',
      pendingPermissions: new Set(),
    })
    return { ok: true }
  }

  function send(sessionId, text) {
    const session = sessions.get(sessionId)
    if (!session) return { ok: false, message: 'O bloco não está aberto.' }
    if (typeof text !== 'string' || !text.trim()) return { ok: false, message: 'Mensagem vazia.' }
    if (text.length > MAX_MENSAGEM) return { ok: false, message: 'Mensagem grande demais.' }
    if (!session.child) {
      try {
        spawnFor(sessionId, session)
      } catch (error) {
        return { ok: false, message: error?.message ?? 'Não foi possível abrir o Claude Code.' }
      }
    }
    session.busy = true
    const ok = writeLine(session, {
      type: 'user',
      message: { role: 'user', content: text },
    })
    return ok ? { ok: true } : { ok: false, message: 'O Claude Code não está aceitando mensagens.' }
  }

  function respondPermission(sessionId, requestId, decision = {}) {
    const session = sessions.get(sessionId)
    if (!session || !session.pendingPermissions?.has(requestId)) {
      return { ok: false, message: 'Esse pedido de permissão não está mais aberto.' }
    }
    session.pendingPermissions.delete(requestId)
    const response =
      decision.allow === true
        ? { behavior: 'allow', updatedInput: decision.input && typeof decision.input === 'object' ? decision.input : {} }
        : {
            behavior: 'deny',
            message:
              typeof decision.message === 'string' && decision.message.trim()
                ? decision.message.trim().slice(0, 2000)
                : 'A pessoa negou esta ação.',
          }
    const ok = writeLine(session, {
      type: 'control_response',
      response: { subtype: 'success', request_id: requestId, response },
    })
    return ok ? { ok: true } : { ok: false, message: 'O Claude Code não está aceitando respostas.' }
  }

  function interrupt(sessionId) {
    const session = sessions.get(sessionId)
    if (!session?.child) return { ok: false, message: 'Nada em andamento.' }
    const ok = writeLine(session, {
      type: 'control_request',
      request_id: newRequestId(),
      request: { subtype: 'interrupt' },
    })
    return ok ? { ok: true } : { ok: false, message: 'Não foi possível interromper.' }
  }

  function stop(sessionId) {
    const session = sessions.get(sessionId)
    if (!session) return { ok: true }
    sessions.delete(sessionId)
    session.stopping = true
    const child = session.child
    session.child = null
    if (child && child.exitCode === null) {
      try {
        child.stdin?.end()
      } catch {}
      try {
        child.kill()
      } catch {}
    }
    return { ok: true }
  }

  function stopAll() {
    for (const sessionId of [...sessions.keys()]) stop(sessionId)
  }

  function describe(sessionId) {
    const session = sessions.get(sessionId)
    if (!session) return null
    return {
      running: Boolean(session.child),
      busy: session.busy,
      claudeSessionId: session.claudeSessionId,
      accountId: session.config.accountId,
    }
  }

  return { start, send, respondPermission, interrupt, stop, stopAll, describe }
}

module.exports = {
  sanitizeClaudeApiEnv,
  buildClaudeApiArgs,
  createClaudeApiSessionManager,
}
