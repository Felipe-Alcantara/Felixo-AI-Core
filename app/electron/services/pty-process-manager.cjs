/**
 * @module pty-process-manager
 * Interactive PTY session lifecycle for terminal nodes.
 *
 * Unlike {@link module:cli-process-manager}, which spawns CLIs through pipes
 * and parses their JSONL output for orchestration, this manager runs each CLI
 * inside a real pseudo-terminal (PTY). The raw bytes are streamed verbatim to
 * an xterm.js view in the renderer, so interactive CLIs behave exactly as they
 * would in a native terminal — no output parsing, no masking.
 *
 * The two managers intentionally coexist: the pipe-based path keeps powering
 * structured orchestration, while this path powers human-driven terminal nodes.
 *
 * Exceção medida (28/09/2026): terminal de agente com vigia injetada
 * (`createOutputWatcher`) tem a cauda de replay lida, fora do `onData`, pela
 * vigia de falha por conta (`accounts/account-output-watcher.cjs`). Os bytes
 * entregues ao renderer continuam intocados e saem antes da vigia; o custo
 * por pedaço é medido em `scripts/pty-output-path-benchmark.cjs`.
 *
 * `node-pty` is a native addon compiled against a specific ABI. To keep this
 * module loadable under both the test runner (Node) and the app (Electron), the
 * binding is required lazily and can be replaced with an injected factory in
 * tests, so unit tests never touch the native binary.
 */

const os = require('node:os')
const { criarFilaDeEscrita } = require('./pty-write-queue.cjs')
const { createReplayBuffer } = require('./pty-replay-buffer.cjs')
const path = require('node:path')
const fs = require('node:fs')
const platform = require('../core/platform/index.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { discoverAgentSession, isSafeSessionId, selectDiscoveryContext } = require('./agent-session-discovery.cjs')
const { normalizeCliVersion } = require('./agent-cli-versions.cjs')
const { validatePtyAccountSelection } = require('./pty-account-validation.cjs')
const { applyProfileEnv } = require('./cli-account-profiles.cjs')
const { ensureNodePtySpawnHelperExecutable } = require('./pty-native-assets.cjs')

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const FORCE_KILL_DELAY_MS = 5000

// Windows-only safety net for the argv-quoting fix in createPtyLaunchSpec below:
// if a PTY launched there with extra args (e.g. codex --model ... -c ...) exits
// this fast, the CLI almost certainly never started — cmd.exe/CreateProcess
// choked on the command line rather than the CLI itself exiting. Retrying with
// the plain command (no extra args) trades those flags for a session that
// actually opens, instead of leaving the user with a frozen pane. Scoped to
// win32 only: on other platforms args are passed straight through (no argv
// re-joining to go wrong), so a fast exit there is a real CLI outcome — e.g.
// `--version`/`--help` — that must reach the caller as-is, not be retried away.
const EARLY_EXIT_THRESHOLD_MS = 800
const WINDOWS_SHELL_PATH_ERROR = /(?:cannot find the path specified|sistema não pode encontrar o caminho especificado)/i
const SHELL_STARTUP_RECOVERY_WINDOW_MS = 3000
const MAX_REPLAY_BUFFER_CHARS = 200_000
const AGENT_SESSION_DISCOVERY_WINDOW_MS = 15_000
const AGENT_SESSION_DISCOVERY_INTERVAL_MS = 250
/**
 * Quantas vezes uma mensagem enviada DEPOIS da janela do spawn reabre a
 * descoberta (cada vez, mais uma janela de 15 s). Claude e Codex só criam o
 * arquivo da conversa na primeira mensagem; quem escreve depois de 15 s
 * ficava sem referência, e a retomada caía no seletor sem explicação. O teto
 * existe porque uma CLI cujo histórico nunca aparece (pasta trocada, histórico
 * desligado) faria a busca rodar a cada mensagem para sempre. Três cobre os
 * Enters que vêm antes da primeira mensagem de verdade (diálogo de confiança
 * na pasta, um comando de barra).
 */
const AGENT_SESSION_DISCOVERY_MAX_REARMS = 3
const AGENT_SESSION_DISCOVERY_COMMANDS = Object.freeze(['codex', 'claude', 'gemini'])
/**
 * Marcas do bracketed paste (DECSET 2004, que o Claude e o Codex ligam): o
 * xterm embrulha a colagem entre elas, e um CR ali dentro é texto colado, não
 * o Enter de quem envia.
 */
const BRACKETED_PASTE_START = '\u001b[200~'
const BRACKETED_PASTE_END = '\u001b[201~'
/**
 * Modo da conta do bloco. `pinned` (fixa) é o padrão, inclusive de bloco
 * antigo sem o campo: só vira `chain` o bloco aberto pela cadeia de contas.
 */
const PTY_ACCOUNT_MODES = Object.freeze(['pinned', 'chain'])
const DEFAULT_PTY_ACCOUNT_MODE = 'pinned'
const PTY_SESSION_ACCOUNT_MISMATCH = 'PTY_SESSION_ACCOUNT_MISMATCH'

/**
 * @typedef {object} PtyHandle
 * @property {number} pid
 * @property {(data: string) => void} write
 * @property {(cols: number, rows: number) => void} resize
 * @property {(signal?: string) => void} kill
 * @property {(listener: (data: string) => void) => void} onData
 * @property {(listener: (event: { exitCode: number, signal?: number }) => void) => void} onExit
 */

/**
 * @typedef {(file: string, args: string[], options: object) => PtyHandle} PtyFactory
 */

class PtyProcessManager {
  /**
   * @param {object} [dependencies]
   * @param {PtyFactory} [dependencies.spawnPty] - Injectable PTY factory (tests).
   * @param {() => number} [dependencies.now] - Injectable clock (tests).
   * @param {typeof platform} [dependencies.platform] - Injectable platform adapter (tests).
   * @param {{ warn?: (...args: unknown[]) => void }} [dependencies.logger] - Diagnostic logger.
   * @param {(command: string, env: Record<string, string>) => string | null} [dependencies.resolveCodexPath] - Injectable Codex resolver.
   * @param {() => boolean} [dependencies.isDebugSession] - Whether detailed local diagnostics are enabled.
   * @param {(options: object) => object | null} [dependencies.discoverAgentSession] - Provider history resolver.
   * @param {(accountId: string, providerId?: string) => Record<string, string>} [dependencies.buildAccountEnv] - Ambiente da conta escolhida.
   * @param {(accountId: string, providerId: string) => {ok: boolean, message?: string}} [dependencies.validateAccount] - Confere a conta antes de montar o ambiente.
   * @param {((options: object) => import('./accounts/account-output-watcher.cjs').AccountOutputWatcher | null) | null} [dependencies.createOutputWatcher] - Fábrica da vigia de falha por conta; sem ela nenhum terminal é vigiado.
   * @param {((detection: object) => void) | null} [dependencies.onOutputFailure] - Recebe cada detecção da vigia, com a sessão, a conta e o modo.
   * @param {(provider: string) => string | null} [dependencies.getCliVersion] - Última versão lida da CLI (`agent-cli-versions.cjs`), gravada junto de cada conversa.
   */
  constructor({ spawnPty, now, platform: platformAdapter, logger, resolveCodexPath, isDebugSession, discoverAgentSession: discover = discoverAgentSession, buildAccountEnv, validateAccount, createOutputWatcher = null, onOutputFailure = null, getCliVersion = null } = {}) {
    this.sessions = new Map()
    this.injectedSpawnPty = spawnPty ?? null
    this.now = now ?? (() => Date.now())
    this.platform = platformAdapter ?? platform
    this.logger = logger ?? console
    this.resolveCodexPath = resolveCodexPath ?? resolveWindowsCodexPath
    this.isDebugSession = isDebugSession ?? (() => process.env.FELIXO_DEBUG_SESSION === '1')
    // Sem loja de contas o terminal nasce no login do sistema, como antes.
    this.buildAccountEnv = buildAccountEnv ?? (() => ({}))
    this.validateAccount = validateAccount
    this.discoverAgentSession = discover
    // Vigia de falha por conta: só existe com a fábrica e um consumidor. Sem
    // eles (testes antigos, bancada `atual`) o onData fica como era.
    this.createOutputWatcher = typeof createOutputWatcher === 'function' ? createOutputWatcher : null
    this.onOutputFailure = typeof onOutputFailure === 'function' ? onOutputFailure : null
    // Sem leitor de versão (testes antigos), as conversas saem sem versão, como antes.
    this.getCliVersion = typeof getCliVersion === 'function' ? getCliVersion : () => null
  }

  /**
   * A conversa com a versão da CLI deste processo carimbada, quando se sabe.
   * O renderer compara essa versão com a instalada na hora de retomar.
   *
   * @param {object} reference
   */
  withCliVersion(reference) {
    let version = null
    try {
      version = normalizeCliVersion(this.getCliVersion(reference.provider))
    } catch {
      version = null
    }
    return version ? { ...reference, cliVersion: version } : reference
  }

  /**
   * Start an interactive PTY session and stream its raw output.
   *
   * @param {string} sessionId
   * @param {object} [options]
   * @param {string} [options.command] - Binary to run; defaults to the user shell.
   * @param {string[]} [options.args]
   * @param {string} [options.cwd]
   * @param {number} [options.cols]
   * @param {number} [options.rows]
   * @param {(data: string) => void} [options.onData] - Raw output sink.
   * @param {(event: { exitCode: number, signal?: number }) => void} [options.onExit]
   * @param {(reference: object) => void} [options.onSession] - Provider session metadata, without conversation content.
   * @param {boolean} [options.reuseExisting] - Reattach to a live/completed session with this id.
   * @param {string} [options.defaultShell] - Internal Windows fallback shell.
   * @param {string} [options.fallbackCommand] - Interpreter to retry with when
   *   `command` isn't installed (e.g. Windows `py` → `python`).
   * @param {boolean} [options.keepShellOpen] - Leave an interactive shell behind
   *   once the command exits, for "run this file" sessions where the command is
   *   the whole job and its output must remain readable.
   * @param {string} [options.accountId] - Conta própria do terminal; ausente = login do sistema.
   * @param {string} [options.providerId] - Provedor já validado contra a conta.
   * @param {'pinned' | 'chain'} [options.accountMode] - Modo da conta do bloco; ausente = `pinned`.
   * @param {string} [options.lineageId] - Linhagem da cadeia, devolvida pelo ticket confirmado.
   * @param {boolean} [isFallbackRetry] - Internal: true when this call is a
   *   recovery retry after an early exit or Windows PTY backend error. Callers
   *   should never pass this themselves.
   * @param {boolean} [useConpty] - Internal Windows backend override. `false`
   *   retries through WinPTY after a ConPTY startup-path error.
   * @returns {PtyHandle}
   */
  spawn(
    sessionId,
    options = {},
    isFallbackRetry = false,
    allowEmergencyShellFallback = true,
    useConpty,
  ) {
    const accountValidation = validatePtyAccountSelection({
      accountId: options.accountId,
      providerId: options.providerId,
      command: options.command,
      validateAccount: this.validateAccount,
    })

    if (!accountValidation.ok) {
      throw new Error(accountValidation.message)
    }

    const accountId = normalizeSessionAccountId(options.accountId)

    if (!isFallbackRetry && options.reuseExisting) {
      const existing = this.sessions.get(sessionId)
      if (existing) {
        // Processo vivo nunca troca de conta: o ambiente da conta só entra no
        // spawn. Reanexar um bloco cuja conta mudou (recarga depois de trocar
        // a conta no configurador) entregaria à pessoa um terminal que ainda
        // cobra da conta antiga, com a nova escrita no card.
        if ((existing.accountId ?? null) !== accountId) {
          throw createAccountMismatchError()
        }
        this.attach(sessionId, options)
        return existing.ptyProcess
      }
    }

    if (!isFallbackRetry) {
      this.kill(sessionId, { force: true })
    }

    const spawnPty = this.resolveSpawnPty()
    // A conta escolhida entra por variável de ambiente, depois do PATH: é o
    // que faz duas contas do mesmo provedor conviverem sem logout. Com conta
    // própria o terminal também deixa de herdar as chaves de API do ambiente
    // do app (senão a CLI cobraria pela chave, não pela conta escolhida). Sem
    // conta escolhida o objeto vem vazio e nada muda: é o login do sistema.
    const accountEnv = this.buildAccountEnv(options.accountId, accountValidation.providerId)
    const env = accountId
      ? applyProfileEnv(
          createCliEnv(),
          { providerId: accountValidation.providerId, profileEnv: accountEnv },
          this.platform.name,
        )
      : { ...createCliEnv(), ...accountEnv }
    // Rolagem no Claude Code: sem alternate screen o xterm guarda scrollback.
    if (options.classicScreen === true && isClaudeCommandName(options.command)) {
      env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN = '1'
    }
    const args = Array.isArray(options.args) ? options.args : []
    const defaultShell = options.defaultShell || this.platform.getDefaultShell(env)
    const requestedCommand = options.command || defaultShell
    const command = resolvePtyCommand(
      requestedCommand,
      Boolean(options.command),
      env,
      this.platform,
      this.resolveCodexPath,
    )
    const keepShellOpen = Boolean(options.keepShellOpen)
    const launch = options.command
      ? createPtyLaunchSpec(command, args, env, this.platform, keepShellOpen)
      : { command, args: getDefaultPtyShellArgs(command, this.platform) }
    const cols = normalizeDimension(options.cols, DEFAULT_COLS)
    const rows = normalizeDimension(options.rows, DEFAULT_ROWS)
    const cwd = resolveWorkingDirectory(options.cwd)
    // Retomada por ID: a conversa é conhecida antes de o processo nascer (ver
    // resolveResumeTarget). Muda a descoberta e o fallback de argumentos.
    const resumeTarget = options.command ? resolveResumeTarget(requestedCommand, args) : null

    if (typeof options.cwd === 'string' && options.cwd.trim() && cwd !== options.cwd) {
      this.reportLayer(
        options,
        'diretório de trabalho',
        'O caminho salvo não está disponível; usando a pasta do usuário.',
        'invalid-cwd',
      )
    }

    // Only a first attempt with a real command + extra args, on the platform
    // where the argv-quoting fallback applies (see EARLY_EXIT_THRESHOLD_MS
    // above), gets a retry — a bare shell, a command with no args, or the
    // retry itself has nothing simpler left to fall back to.
    //
    // Run-a-file sessions are excluded: the retry drops the extra args, which
    // for a CLI means losing optional flags but for a file means losing the
    // file itself — `py script.py` would silently become a bare `py` REPL,
    // running something the user never asked for.
    //
    // Retomada por ID também fica de fora: a CLI recusa uma retomada (conversa
    // inexistente, login) imprimindo o motivo e saindo com erro, às vezes em
    // menos de 800 ms, e tirar os argumentos transformava a recusa num Codex
    // sem argumentos (conversa nova, sem os flags do bloco) antes de a pessoa
    // escolher. O processo encerra e o renderer mostra a faixa da retomada.
    const allowFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      Boolean(options.command) &&
      !keepShellOpen &&
      args.length > 0 &&
      !resumeTarget
    const allowWindowsBackendFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      useConpty !== false
    const allowCodexPathFallback =
      !isFallbackRetry &&
      this.platform.name === 'win32' &&
      Boolean(options.command) &&
      isCodexCommand(requestedCommand)
    // Unlike the other fallbacks this one may run on a retry: the caller names
    // a specific replacement interpreter, so there is exactly one alternative
    // to try and no risk of looping (the retry clears fallbackCommand).
    const allowInterpreterFallback =
      Boolean(options.command) &&
      typeof options.fallbackCommand === 'string' &&
      Boolean(options.fallbackCommand) &&
      options.fallbackCommand !== command
    let windowsBackendFallbackRetried = false

    let ptyProcess
    try {
      ptyProcess = spawnPty(launch.command, launch.args, {
        name: 'xterm-256color',
        cols,
        rows,
        // No project selected → open in the user's home, like a fresh terminal,
        // instead of inheriting the app's working directory.
        cwd,
        env,
        ...(useConpty === false ? { useConpty: false } : {}),
      })
    } catch (error) {
      if (isWindowsLongPathFailure(error, cwd, this.platform.name)) {
        // Medido ao vivo em 12/09/2026 (release-smoke, v0.1.311): o
        // WindowsPtyAgent nativo do node-pty recusa abrir sessão quando o
        // cwd passa do MAX_PATH clássico (260 caracteres) — "Cannot create
        // process, error code: 267" — mesmo a pasta existindo de verdade no
        // disco. Sem esta checagem o usuário só via "não foi possível criar
        // a sessão", sem entender por quê. O comprimento é informação
        // segura de expor (não vaza o caminho em si).
        this.reportLayer(
          options,
          'inicialização do PTY',
          `A pasta de trabalho tem um caminho longo demais para o Windows abrir um terminal aqui (${cwd.length} caracteres, limite prático é ~260). Mova o projeto para um caminho mais curto.`,
          'pty-spawn-error-long-path',
        )
        throw new Error(
          `Camada de inicialização do PTY: cwd excede o limite de caminho do Windows (${cwd.length} caracteres).`,
          { cause: error },
        )
      }

      this.reportLayer(
        options,
        'inicialização do PTY',
        'Não foi possível criar a sessão do terminal.',
        'pty-spawn-error',
      )
      const detalhe = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Camada de inicialização do PTY: não foi possível criar a sessão: ${detalhe}`,
        { cause: error },
      )
    }

    const entry = {
      ptyProcess,
      cols,
      rows,
      killTimer: null,
      spawnedAt: this.now(),
      // Guardados para responder "quais terminais usam esta CLI?" antes de uma
      // operação que mexe na credencial dela. Sem isso, a troca de conta só
      // poderia avisar "pode afetar algum terminal", que é aviso que ninguém lê.
      requestedCommand: options.command ? requestedCommand : null,
      args: [...args],
      cwd,
      outputBuffer: createReplayBuffer(MAX_REPLAY_BUFFER_CHARS),
      exitEvent: null,
      onData: options.onData,
      onExit: options.onExit,
      onSession: options.onSession,
      discoveryTimer: null,
      // Estado da descoberta da conversa (ver scheduleAgentSessionDiscovery):
      // comando a procurar, fim da janela do spawn, prazo corrente, instante
      // da última mensagem que reabriu a busca, quantas reaberturas já foram
      // gastas e se a entrada está no meio de uma colagem (bracketed paste).
      discoveryCommand: null,
      discoverySpawnWindowEnd: 0,
      discoveryDeadline: 0,
      discoverySubmitAt: null,
      discoveryRearms: 0,
      discoveryInPaste: false,
      // Retomada por ID já nasce com a conversa; o resto espera a descoberta.
      agentSession: resumeTarget
        ? this.withCliVersion(createResumeAgentSession(resumeTarget, cwd, accountId, this.now()))
        : null,
      filaDeEscrita: null,
      // Conta com que o processo nasceu. Não muda depois do spawn: é o que o
      // reattach confere e o que a cadeia de contas lê para saber de quem é
      // cada terminal vivo. Sem conta = login do sistema.
      accountId,
      providerId: accountValidation.providerId ?? null,
      accountMode: accountId ? normalizeAccountMode(options.accountMode) : DEFAULT_PTY_ACCOUNT_MODE,
      // Sequência de trocas da cadeia que criou este bloco (entra com o
      // ticket confirmado); `null` em todo bloco aberto à mão.
      lineageId: accountId && typeof options.lineageId === 'string' && options.lineageId ? options.lineageId : null,
      // Onde a CLI deste terminal grava o histórico (pasta do perfil da conta,
      // ou a do login do sistema). Só as variáveis de pasta, nunca o ambiente.
      agentSessionContext: selectDiscoveryContext(env),
      // Horário do último pedaço de saída; `null` = ainda não imprimiu nada.
      // A cadeia de contas pergunta por ele antes de abrir a continuação de um
      // terminal que ainda está trabalhando.
      lastOutputAt: null,
      watcher: null,
    }
    entry.watcher = this.createSessionOutputWatcher(sessionId, entry, options)

    // Escrita grande vai fatiada e em ordem: o ConPTY do Windows descarta em
    // silêncio o excedente de uma escrita única grande, e era isso que cortava
    // o prompt inicial de contexto.
    entry.filaDeEscrita = criarFilaDeEscrita({
      escrever: (dados) => ptyProcess.write(dados),
      ativa: () => this.sessions.get(sessionId) === entry && !entry.exitEvent,
    })

    this.sessions.set(sessionId, entry)
    if (entry.agentSession) {
      // Retomada por ID: nada de descoberta nem de reabertura na mensagem. A
      // CLI grava a retomada no arquivo ANTIGO da conversa, nascido antes de
      // qualquer mensagem deste processo, que nunca passa na busca ancorada;
      // a busca acabava adotando a conversa de outro terminal da mesma pasta.
      this.emitKnownAgentSession(sessionId, entry)
    } else {
      this.scheduleAgentSessionDiscovery(sessionId, options)
    }

    ptyProcess.onData((data) => {
      entry.outputBuffer.append(String(data))
      entry.lastOutputAt = this.now()
      try {
        // ConPTY can start a default shell successfully and only then report
        // an invalid path. Only handle the platform's own startup text here:
        // a CLI may legitimately print "File not found" for its work, and
        // treating that as a shell failure used to kill Codex sessions.
        if (
          allowWindowsBackendFallback &&
          !windowsBackendFallbackRetried &&
          this.now() - entry.spawnedAt <= SHELL_STARTUP_RECOVERY_WINDOW_MS &&
          WINDOWS_SHELL_PATH_ERROR.test(String(data))
        ) {
          windowsBackendFallbackRetried = true
          this.reportWindowsShellStartupDiagnostic(launch, cwd, data, useConpty)
          this.reportLayer(
            { ...options, onData: entry.onData },
            'backend PTY do Windows',
            'A camada de terminal reportou um erro de caminho; tentando o backend alternativo.',
            'shell-path-error',
          )
          this.safeKill(ptyProcess, 'SIGKILL')
          this.cleanup(sessionId, ptyProcess)
          this.spawn(
            sessionId,
            { ...options, cwd },
            true,
            allowEmergencyShellFallback,
            false,
          )
          return
        }
        entry.onData?.(data)
      } catch {
        // A renderer callback must not bring down the PTY process.
      }
      // Depois do renderer, nunca antes: a vigia não atrasa o pedaço que a
      // pessoa vê. Por pedaço ela só marca "há texto novo" (O(1)).
      if (entry.watcher !== null) {
        try {
          entry.watcher.push(entry.lastOutputAt)
        } catch {
          // A vigia é segurança de custo, não pode derrubar o terminal.
        }
      }
    })

    ptyProcess.onExit((event) => {
      // A kill()/re-spawn may have already replaced this session's entry by
      // the time this fires — only the still-current attempt gets to retry
      // or report its exit; a superseded attempt's exit is not this session's
      // outcome anymore.
      const isCurrentAttempt = this.sessions.get(sessionId) === entry
      if (!isCurrentAttempt) {
        return
      }

      // A última mensagem antes de sair costuma ser o motivo ("Not logged
      // in", o aviso de limite): varre já, sem esperar o debounce, e desliga.
      this.finishSessionOutputWatcher(entry, { flush: true })

      const exitedEarly =
        isCurrentAttempt &&
        this.platform.name === 'win32' &&
        event.exitCode !== 0 &&
        this.now() - entry.spawnedAt < EARLY_EXIT_THRESHOLD_MS

      if (exitedEarly) {
        // Tried before every other recovery: a missing interpreter is the
        // likeliest cause of an instant failure for a run-a-file session, and
        // swapping it keeps the user's actual file running — unlike the args
        // retry or the emergency shell, which both abandon the request.
        if (allowInterpreterFallback) {
          this.reportLayer(
            options,
            'interpretador',
            `O comando "${command}" não pôde ser executado; tentando "${options.fallbackCommand}".`,
            'interpreter-fallback',
          )
          this.spawn(
            sessionId,
            { ...options, command: options.fallbackCommand, fallbackCommand: undefined },
            true,
            allowEmergencyShellFallback,
          )
          return
        }

        if (!isFallbackRetry && allowCodexPathFallback) {
          const resolvedCodexPath = this.resolveCodexPath(requestedCommand, env)
          if (resolvedCodexPath && resolvedCodexPath !== command) {
            this.reportLayer(
              options,
              'localização do Codex',
              'O Codex falhou cedo; um executável local foi encontrado e será usado.',
              'codex-path-resolved',
            )
            this.spawn(
              sessionId,
              { ...options, command: resolvedCodexPath },
              true,
              allowEmergencyShellFallback,
            )
            return
          }
          this.reportLayer(
            options,
            'localização do Codex',
            'O Codex falhou cedo e não foi localizado nos caminhos conhecidos.',
            'codex-path-not-found',
          )
        }

        if (!isFallbackRetry && allowFallback) {
          this.reportLayer(
            options,
            'argumentos da CLI',
            'A CLI encerrou cedo; tentando iniciar sem os argumentos adicionais.',
            'early-exit-args-retry',
          )
          this.spawn(sessionId, { ...options, args: [] }, true, allowEmergencyShellFallback)
          return
        }

        // Retomada por ID que sai cedo é a resposta da CLI (recusou a
        // retomada), não um lançamento que falhou: trocá-la por um shell na
        // pasta do usuário esconderia o fim do processo do renderer, que é
        // quem mostra a faixa da retomada.
        if (allowEmergencyShellFallback && !resumeTarget) {
          // The emergency shell throws away the command, the args and the cwd,
          // so whatever the process printed before dying is the only remaining
          // evidence of WHY it died — a Python traceback, a missing
          // interpreter, a bad path. Replaying it into the new session turns an
          // unactionable "the terminal opened somewhere else" report into one
          // that names the actual error.
          this.replayFailureOutput(options, entry.outputBuffer.toString(), event.exitCode)
          this.reportLayer(
            options,
            'shell de emergência',
            'As tentativas da CLI falharam; abrindo um shell limpo do Windows.',
            'emergency-shell-fallback',
          )
          this.spawn(
            sessionId,
            { cwd: os.homedir(), onData: options.onData, onExit: options.onExit },
            true,
            false,
          )
          return
        }
      }

      // Keep a completed entry until the renderer explicitly kills/removes the
      // node. A renderer reload can then restore the final output and status
      // instead of spawning a fresh agent for a task that already ended.
      //
      // The entry stays, but the pending SIGKILL timer must not: the process
      // is already gone, so the escalation has nothing left to do and would
      // just sit armed until it fires.
      if (entry.killTimer) {
        clearTimeout(entry.killTimer)
        entry.killTimer = null
      }
      entry.exitEvent = event
      // O que ainda estava na fila não tem mais para onde ir; escrever num
      // processo encerrado só produziria erro dentro do node-pty.
      entry.filaDeEscrita?.descartar()
      entry.onExit?.(event)
    })

    return ptyProcess
  }

  /**
   * @param {string} sessionId
   * @returns {PtyHandle | null}
   */
  get(sessionId) {
    return this.sessions.get(sessionId)?.ptyProcess ?? null
  }

  /**
   * @param {string} sessionId
   * @returns {boolean}
   */
  has(sessionId) {
    return this.sessions.has(sessionId)
  }

  /**
   * Quantas sessões ainda têm processo vivo.
   *
   * Uma entrada com `exitEvent` já preenchido é histórico: o processo morreu e
   * o registro só continua ali para responder ao renderer. Contar essas daria
   * "tem agente rodando" para uma janela vazia — e a guarda de fechamento, que
   * é quem consome este número, passaria a perguntar sem motivo. Guarda que
   * pergunta à toa é guarda que a pessoa aprende a ignorar.
   *
   * @returns {number}
   */
  contarSessoesVivas() {
    let vivas = 0

    for (const entry of this.sessions.values()) {
      if (!entry.exitEvent) {
        vivas += 1
      }
    }

    return vivas
  }

  /**
   * Sessões com processo vivo, com o comando que cada uma pediu.
   *
   * Só o comando pedido pelo renderer entra aqui — nunca o caminho resolvido
   * nem o shell padrão de uma sessão sem comando explícito. Quem consome quer
   * saber "esta sessão é do Codex?", e é o comando pedido que responde isso de
   * forma estável entre plataformas.
   *
   * A conta, o provedor e o modo vão junto: a troca do login do sistema só
   * afeta terminal sem conta própria, e a cadeia precisa saber de quem é cada
   * terminal vivo. Nunca sai caminho de perfil nem ambiente.
   *
   * `lastOutputAt` (ms) diz à cadeia se a origem ainda trabalha, e
   * `lineageId` liga o bloco à sequência de trocas que o criou.
   *
   * @returns {Array<{ sessionId: string, command: string | null, args: string[], cwd: string, startedAt: number, accountId: string | null, providerId: string | null, accountMode: 'pinned' | 'chain', lastOutputAt: number | null, lineageId: string | null }>}
   */
  listarSessoesVivas() {
    const sessoes = []

    for (const [sessionId, entry] of this.sessions.entries()) {
      if (entry.exitEvent) {
        continue
      }

      sessoes.push({
        sessionId,
        command: entry.requestedCommand ?? null,
        args: [...(entry.args ?? [])],
        cwd: entry.cwd ?? '',
        startedAt: entry.spawnedAt,
        accountId: entry.accountId ?? null,
        providerId: entry.providerId ?? null,
        accountMode: entry.accountMode ?? DEFAULT_PTY_ACCOUNT_MODE,
        lastOutputAt: entry.lastOutputAt ?? null,
        lineageId: entry.lineageId ?? null,
      })
    }

    return sessoes
  }

  /**
   * Muda o modo da conta de um terminal vivo (fixar ou pôr na cadeia). A
   * conta do processo não muda: só quem decide o que fazer numa falha. Sem
   * conta própria (login do sistema) não há `chain`.
   *
   * @param {string} sessionId
   * @param {'pinned' | 'chain'} mode
   * @returns {boolean} `true` quando a sessão viva aceitou o modo.
   */
  setAccountMode(sessionId, mode) {
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.exitEvent || !PTY_ACCOUNT_MODES.includes(mode)) {
      return false
    }
    if (mode === 'chain' && !entry.accountId) {
      return false
    }
    entry.accountMode = mode
    return true
  }

  /** Replaces renderer callbacks and replays output after an HMR/navigation reload. */
  attach(sessionId, options = {}) {
    const entry = this.sessions.get(sessionId)

    if (!entry) {
      return false
    }

    entry.onData = options.onData
    entry.onExit = options.onExit
    entry.onSession = options.onSession

    // O reanexo (todo remonte do canvas com reuseExisting) só reemite a
    // conversa já conhecida. Sem ela, não mexe na descoberta: a janela é do
    // spawn, e reabri-la aqui esticava o prazo com o spawnedAt antigo e
    // desligava a âncora de uma reabertura em curso, e o bloco adotava a
    // conversa mexida há pouco por outro terminal. A busca que estiver
    // correndo segue no processo principal e responde pelo `onSession` novo;
    // a próxima mensagem reabre, se ainda houver reabertura.
    if (entry.agentSession) {
      this.emitKnownAgentSession(sessionId, entry)
    }

    const replay = entry.outputBuffer.toString()
    if (replay) {
      try {
        entry.onData?.(replay)
      } catch {
        // A renderer callback must not affect the retained PTY session.
      }
    }

    if (entry.exitEvent) {
      queueMicrotask(() => {
        entry.onExit?.(entry.exitEvent)
      })
    }

    return true
  }

  /**
   * Forward user keystrokes (or programmatic input) to the PTY.
   *
   * @param {string} sessionId
   * @param {string} input
   * @returns {boolean} Whether the input was delivered.
   */
  write(sessionId, input) {
    const entry = this.sessions.get(sessionId)

    if (!entry || entry.exitEvent) {
      return false
    }

    let delivered = true
    if (entry.filaDeEscrita) {
      delivered = entry.filaDeEscrita.enfileirar(input)
    } else {
      entry.ptyProcess.write(input)
    }
    if (delivered) {
      this.rearmAgentSessionDiscoveryOnSubmit(sessionId, entry, input)
    }
    return delivered
  }

  /**
   * Resolve quando tudo que foi enfileirado para a sessao ja saiu.
   *
   * Quem envia um texto grande precisa saber quando a entrega **terminou**, e
   * nao so que foi aceita: o verificador do renderer decide reescrever o
   * contexto se nao o enxergar na tela, e sem esperar o dreno ele reescreveria
   * um texto que ainda estava saindo.
   *
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async aguardarEscritas(sessionId) {
    await this.sessions.get(sessionId)?.filaDeEscrita?.aguardar()
  }

  /**
   * Resize the PTY so the CLI redraws for the current view dimensions.
   *
   * @param {string} sessionId
   * @param {number} cols
   * @param {number} rows
   * @returns {boolean} Whether the resize was applied.
   */
  resize(sessionId, cols, rows) {
    const entry = this.sessions.get(sessionId)

    if (!entry || entry.exitEvent) {
      return false
    }

    const nextCols = normalizeDimension(cols, entry.cols)
    const nextRows = normalizeDimension(rows, entry.rows)

    if (nextCols === entry.cols && nextRows === entry.rows) {
      return true
    }

    entry.cols = nextCols
    entry.rows = nextRows
    entry.ptyProcess.resize(nextCols, nextRows)
    return true
  }

  /**
   * Terminate a session. A graceful SIGTERM is escalated to SIGKILL after a
   * delay; `force` kills immediately and drops the session right away.
   *
   * @param {string} sessionId
   * @param {object} [options]
   * @param {boolean} [options.force]
   * @returns {boolean}
   */
  kill(sessionId, options = {}) {
    const entry = this.sessions.get(sessionId)

    if (!entry) {
      return false
    }

    if (options.force) {
      this.safeKill(entry.ptyProcess, 'SIGKILL')
      this.cleanup(sessionId, entry.ptyProcess)
      return true
    }

    this.safeKill(entry.ptyProcess, 'SIGTERM')

    if (!entry.killTimer) {
      entry.killTimer = setTimeout(() => {
        const current = this.sessions.get(sessionId)

        if (current === entry) {
          this.safeKill(entry.ptyProcess, 'SIGKILL')
        }
      }, FORCE_KILL_DELAY_MS)

      if (typeof entry.killTimer.unref === 'function') {
        entry.killTimer.unref()
      }
    }

    return true
  }

  killAll(options = {}) {
    for (const sessionId of [...this.sessions.keys()]) {
      this.kill(sessionId, options)
    }
  }

  /**
   * @param {string} sessionId
   * @param {PtyHandle} ptyProcess
   */
  cleanup(sessionId, ptyProcess) {
    const entry = this.sessions.get(sessionId)

    if (!entry || entry.ptyProcess !== ptyProcess) {
      return
    }

    if (entry.killTimer) {
      clearTimeout(entry.killTimer)
    }
    if (entry.discoveryTimer) {
      clearTimeout(entry.discoveryTimer)
    }
    entry.filaDeEscrita?.descartar()
    this.finishSessionOutputWatcher(entry, { flush: false })

    this.sessions.delete(sessionId)
  }

  /**
   * Cria a vigia de falha por conta de um terminal de agente. Shell (sem
   * comando), comando sem provedor conhecido e provedor sem frase para vigiar
   * (Openia) ficam sem vigia e não pagam nada além de um `if` por pedaço.
   *
   * A vigia vale também para o login do sistema (sem conta): lá a detecção
   * só vira aviso; quem decide é o consumidor.
   *
   * @returns {import('./accounts/account-output-watcher.cjs').AccountOutputWatcher | null}
   */
  createSessionOutputWatcher(sessionId, entry, options) {
    if (!this.createOutputWatcher || !this.onOutputFailure || !options.command || !entry.providerId) {
      return null
    }

    try {
      return this.createOutputWatcher({
        providerId: entry.providerId,
        readTail: (count) => entry.outputBuffer.tail(count),
        now: this.now,
        logger: this.logger,
        // Conta e modo são lidos na hora da detecção: o modo do bloco pode
        // mudar depois do spawn (fixar ou pôr na cadeia).
        onDetection: (detection) => this.onOutputFailure?.({
          ...detection,
          sessionId,
          accountId: entry.accountId ?? null,
          providerId: entry.providerId,
          accountMode: entry.accountMode ?? DEFAULT_PTY_ACCOUNT_MODE,
          // A linhagem só existe em bloco aberto pela cadeia (entra com o ticket).
          lineageId: entry.lineageId ?? null,
        }),
      }) ?? null
    } catch (error) {
      this.logger?.warn?.('[pty] vigia de contas indisponível para este terminal:', error instanceof Error ? error.message : error)
      return null
    }
  }

  /** Desliga a vigia da entrada; com `flush`, varre antes o que ainda não foi lido. */
  finishSessionOutputWatcher(entry, { flush }) {
    const watcher = entry.watcher
    if (!watcher) return
    entry.watcher = null
    try {
      if (flush) watcher.flush()
    } catch {
      // A última varredura é o melhor esforço; a saída do processo segue.
    }
    try {
      watcher.dispose()
    } catch {
      // Idem.
    }
  }

  /**
   * Provider history is metadata-only and best effort. A missing or ambiguous
   * candidate deliberately produces no event; the renderer then keeps its
   * honest generic /resume fallback instead of guessing another conversation.
   *
   * A janela de 15 s nasce só no spawn real (o reanexo não a toca, e a
   * retomada por ID nem a abre). Como Claude e Codex só criam o arquivo na
   * primeira mensagem, `write` a reabre quando uma mensagem é enviada sem
   * referência ainda (ver rearmAgentSessionDiscoveryOnSubmit): custo limitado
   * a algumas janelas por terminal, nunca uma busca contínua.
   */
  scheduleAgentSessionDiscovery(sessionId, options) {
    if (!options.command || !AGENT_SESSION_DISCOVERY_COMMANDS.includes(options.command)) {
      return
    }

    const entry = this.sessions.get(sessionId)
    if (!entry || typeof this.discoverAgentSession !== 'function') return

    entry.discoveryCommand = options.command
    const windowEnd = this.now() + AGENT_SESSION_DISCOVERY_WINDOW_MS
    entry.discoverySpawnWindowEnd = Math.max(entry.discoverySpawnWindowEnd, windowEnd)
    entry.discoveryDeadline = Math.max(entry.discoveryDeadline, windowEnd)
    this.queueAgentSessionDiscoveryAttempt(sessionId, entry)
  }

  /**
   * Reabre a descoberta quando uma mensagem é enviada (a entrada tem Enter)
   * e o terminal ainda não tem conversa: é nesse momento que Claude e Codex
   * criam o arquivo da sessão. Dentro da janela do spawn só estica o prazo;
   * depois dela, cada reabertura gasta uma das
   * {@link AGENT_SESSION_DISCOVERY_MAX_REARMS}. Tecla sem Enter não conta:
   * digitar não cria arquivo nenhum. Shift+Enter e colagem multilinha também
   * não (ver scanSubmittedInput): gastavam o teto sem mensagem enviada.
   */
  rearmAgentSessionDiscoveryOnSubmit(sessionId, entry, input) {
    if (entry.agentSession || !entry.discoveryCommand) return
    if (typeof input !== 'string') return
    const scan = scanSubmittedInput(input, entry.discoveryInPaste)
    entry.discoveryInPaste = scan.inPaste
    if (!scan.submitted) return

    const now = this.now()
    if (now > entry.discoverySpawnWindowEnd) {
      if (entry.discoveryRearms >= AGENT_SESSION_DISCOVERY_MAX_REARMS) return
      entry.discoveryRearms += 1
    }
    // A última mensagem é a âncora: um "/help" seguido da mensagem de verdade
    // não pode ancorar a busca no "/help", senão a conversa que outro terminal
    // abriu entre os dois ganharia por estar mais perto.
    entry.discoverySubmitAt = now
    entry.discoveryDeadline = Math.max(entry.discoveryDeadline, now + AGENT_SESSION_DISCOVERY_WINDOW_MS)
    this.queueAgentSessionDiscoveryAttempt(sessionId, entry)
  }

  /**
   * Entrega a conversa já conhecida (retomada por ID, reanexo) pelo mesmo
   * caminho da descoberta (`onSession`, que vira `pty:session`), depois do
   * spawn ou reanexo em curso, e só se a entrada ainda for a desta sessão.
   */
  emitKnownAgentSession(sessionId, entry) {
    queueMicrotask(() => {
      if (this.sessions.get(sessionId) !== entry || !entry.agentSession) return
      try {
        entry.onSession?.(entry.agentSession)
      } catch {
        // A renderer callback must not affect the PTY session.
      }
    })
  }

  /** Uma tentativa pendente por terminal, no máximo: spawn e Enter não empilham laços. */
  queueAgentSessionDiscoveryAttempt(sessionId, entry) {
    if (entry.discoveryTimer) return
    entry.discoveryTimer = setTimeout(
      () => this.runAgentSessionDiscoveryAttempt(sessionId, entry),
      AGENT_SESSION_DISCOVERY_INTERVAL_MS,
    )
    if (typeof entry.discoveryTimer.unref === 'function') {
      entry.discoveryTimer.unref()
    }
  }

  runAgentSessionDiscoveryAttempt(sessionId, entry) {
    entry.discoveryTimer = null
    if (this.sessions.get(sessionId) !== entry || entry.agentSession || !entry.discoveryCommand) return

    const now = this.now()
    // Dentro da janela do spawn vale a regra de sempre: arquivo mexido perto
    // do nascimento do processo. Depois dela a âncora é a mensagem que
    // reabriu a busca, e só conta arquivo NASCIDO depois dela; minutos após o
    // spawn, "mexido perto do spawn" pegaria a conversa de outro terminal.
    const createdAfter = now > entry.discoverySpawnWindowEnd && Number.isFinite(entry.discoverySubmitAt)
      ? entry.discoverySubmitAt
      : undefined

    let reference = null
    try {
      reference = this.discoverAgentSession({
        command: entry.discoveryCommand,
        cwd: entry.cwd,
        startedAt: entry.spawnedAt,
        ...(createdAfter === undefined ? {} : { createdAfter }),
        excludeSessionIds: this.collectClaimedAgentSessionIds(sessionId),
        now,
        env: entry.agentSessionContext?.env,
        homeDir: entry.agentSessionContext?.homeDir,
      })
    } catch {
      reference = null
    }

    if (reference?.sessionId) {
      // A conversa pertence à conta em que o processo nasceu: retomá-la em
      // outra conta abriria o histórico de uma pessoa na cobrança de outra.
      const stamped = this.withCliVersion(reference)
      entry.agentSession = entry.accountId ? { ...stamped, accountId: entry.accountId } : stamped
      entry.onSession?.(entry.agentSession)
      return
    }

    if (now >= entry.discoveryDeadline) return
    this.queueAgentSessionDiscoveryAttempt(sessionId, entry)
  }

  /**
   * Conversas já associadas a outros terminais deste app. Com a janela maior
   * (reaberta na mensagem), a conversa de um terminal vizinho no mesmo
   * diretório não pode concorrer com a deste nem transformá-lo em "ambíguo".
   */
  collectClaimedAgentSessionIds(ownSessionId) {
    const claimed = []
    for (const [sessionId, entry] of this.sessions.entries()) {
      if (sessionId !== ownSessionId && entry.agentSession?.sessionId) {
        claimed.push(entry.agentSession.sessionId)
      }
    }
    return claimed
  }

  /**
   * Resolve the PTY factory: injected one in tests, lazily required `node-pty`
   * in production. The require is deferred so importing this module never loads
   * the native binary unless a real session is actually started.
   *
   * @returns {PtyFactory}
   */
  resolveSpawnPty() {
    if (this.injectedSpawnPty) {
      return this.injectedSpawnPty
    }

    // The npm package ships the macOS helper without execute permission. The
    // afterPack hook fixes release artifacts; this idempotent check also keeps
    // `npm run dev` working and is harmless when the bit is already present.
    const helperState = ensureNodePtySpawnHelperExecutable({
      platformName: this.platform.name,
    })
    if (!helperState.ok) {
      this.warn('PTY: não foi possível preparar o spawn-helper nativo.', {
        reason: 'pty-helper-permission',
        platform: this.platform.name,
        detail: helperState.reason,
      })
    }

    const nodePty = require('node-pty')
    return (file, args, options) => nodePty.spawn(file, args, options)
  }

  /**
   * @param {PtyHandle} ptyProcess
   * @param {string} signal
   */
  safeKill(ptyProcess, signal) {
    try {
      // node-pty rejects an explicit signal on Windows. Passing SIGKILL here
      // used to be swallowed by this guard, leaving ConPTY handles and child
      // processes alive after a timeout or a drawer restart.
      if (this.platform.name === 'win32') {
        ptyProcess.kill()
      } else {
        ptyProcess.kill(signal)
      }
    } catch {
      // The PTY may already be gone; treating kill as idempotent keeps the
      // lifecycle predictable for callers.
    }
  }

  /**
   * Keep diagnostics best-effort: logging must never prevent a terminal from
   * starting, especially in packaged builds where console methods may be absent.
   * Paths are intentionally omitted from the log payload.
   *
   * @param {string} message
   * @param {Record<string, string>} details
   */
  warn(message, details) {
    try {
      this.logger?.warn?.(message, details)
    } catch {
      // Diagnostics are never part of the terminal's control flow.
    }
  }

  /**
   * Surface the dead process's own output before a recovery path discards the
   * session it came from. Without this the user only sees the replacement
   * shell, and the error that actually broke their run is lost — which is what
   * made these failures impossible to diagnose from user reports.
   *
   * @param {object} options
   * @param {string} outputBuffer - Raw bytes the failed process emitted.
   * @param {number} exitCode
   */
  replayFailureOutput(options, outputBuffer, exitCode) {
    const output = String(outputBuffer ?? '').trim()

    try {
      if (output) {
        options.onData?.(
          `\r\n[Felixo] O processo encerrou com código ${exitCode}. Saída original:\r\n${output}\r\n`,
        )
        return
      }

      // No output at all is itself the diagnosis: the process never started,
      // so the command could not be found or executed.
      options.onData?.(
        `\r\n[Felixo] O processo encerrou com código ${exitCode} sem produzir saída ` +
          `(o comando provavelmente não foi encontrado).\r\n`,
      )
    } catch {
      // A renderer listener must not alter the PTY recovery path.
    }
  }

  /**
   * Reports the recovery layer to diagnostics and the visible terminal.
   * Paths and command arguments are intentionally omitted from the notice.
   *
   * @param {object} options
   * @param {string} layer
   * @param {string} notice
   * @param {string} reason
   */
  reportLayer(options, layer, notice, reason) {
    this.warn(`PTY: ${notice}`, { reason, platform: this.platform.name })
    try {
      options.onData?.(`\r\n[Felixo] Camada: ${layer}. ${notice}\r\n`)
    } catch {
      // A renderer listener must not alter the PTY recovery path.
    }
  }

  /**
   * The dedicated launcher console is explicitly for local diagnosis, so it
   * may contain the actual shell, cwd and startup text. Normal app launches
   * keep the existing path-free diagnostic to avoid leaking local locations.
   */
  reportWindowsShellStartupDiagnostic(launch, cwd, data, useConpty) {
    if (!this.isDebugSession()) {
      return
    }

    this.warn('PTY: Diagnóstico bruto do shell Windows.', {
      reason: 'shell-path-error',
      platform: this.platform.name,
      backend: useConpty === false ? 'winpty' : 'conpty/auto',
      shell: launch.command,
      args: launch.args,
      cwd,
      output: String(data).replaceAll('\0', '').slice(0, 4000),
    })
  }
}

/**
 * Resolve a Windows Codex shim before creating the PTY. Unlike an interactive
 * user terminal, node-pty launches through CreateProcess and may not inherit
 * the same PATHEXT/PATH resolution behaviour. An absolute codex.cmd removes
 * that environmental difference while preserving the normal bare command when
 * no known shim exists.
 *
 * @param {string} command
 * @param {boolean} isExplicitCommand
 * @param {Record<string, string>} env
 * @param {typeof platform} adapter
 * @param {(command: string, env: Record<string, string>) => string | null} resolveCodexPath
 * @returns {string}
 */
function resolvePtyCommand(command, isExplicitCommand, env, adapter, resolveCodexPath) {
  if (!isExplicitCommand || adapter.name !== 'win32' || !isCodexCommand(command)) {
    return command
  }

  return resolveCodexPath(command, env) ?? command
}

/**
 * Wrap an explicit CLI command so the OS can actually find and launch it.
 *
 * - macOS: GUI apps inherit a reduced environment from LaunchServices, so we run
 *   through the user's interactive login shell to mirror Terminal.app and load
 *   version-manager setup from the shell configuration.
 * - Windows: `node-pty` spawns via `CreateProcess`, which does NOT honour
 *   `PATHEXT` or search the way a shell does — so a bare `claude` (installed as
 *   `claude.cmd`) fails with "Cannot create process, error code: 2". Launching
 *   through `cmd.exe /c` lets the shell resolve the `.cmd`/`.exe`/`.ps1` shim and
 *   the full PATH, exactly like typing the command in a real terminal.
 * - Linux: the binary is on PATH as-is, so the command runs directly.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string>} env
 * @param {typeof platform} [adapter]
 * @param {boolean} [keepShellOpen] - Keep an interactive shell alive after the
 *   command exits, instead of letting the PTY close with it.
 * @returns {{ command: string, args: string[] }}
 */
function createPtyLaunchSpec(command, args, env, adapter = platform, keepShellOpen = false) {
  if (adapter.name === 'darwin') {
    const shell = adapter.getDefaultShell(env)
    const commandLine = [command, ...args]
      .map((value) => adapter.escapeArg(String(value)))
      .join(' ')

    // `exec` replaces the shell with the command, so the PTY dies the moment
    // the command does. A run-a-file session must outlive it: drop the `exec`
    // and hand control back to an interactive shell in the same cwd, so the
    // user can read the output and keep working.
    return {
      command: shell,
      args: keepShellOpen
        ? ['-l', '-i', '-c', `${commandLine}; exec ${adapter.escapeArg(shell)} -i`]
        : ['-l', '-i', '-c', `exec ${commandLine}`],
    }
  }

  if (adapter.name === 'win32') {
    // cmd.exe resolves PATHEXT (.cmd/.exe/.ps1) and searches PATH; `/d /s /c`
    // skips AutoRun and runs the command that follows. Passed as separate argv
    // entries (not pre-joined into one string) so node-pty's own Windows
    // command-line builder — which already quotes each argument correctly for
    // CreateProcess/ConPTY — does the joining, instead of risking a second,
    // divergent round of escaping here.
    //
    // `/k` instead of `/c` for run-a-file sessions: `/c` exits as soon as the
    // command finishes, closing the PTY before the user can read the output or
    // type anything — the "the file doesn't open" report on Windows. `/k`
    // leaves the same cmd.exe interactive in the file's directory.
    // CMD's `/c` parser does not safely execute a quoted first token when it
    // is supplied as the command itself. `call` is CMD's built-in dispatcher:
    // with it, node-pty can continue passing the path and every argument as
    // individual argv values, while CMD correctly executes a `.cmd` shim such
    // as `C:\\Users\\Felipe Martins\\...\\claude.cmd`. Do not use the common
    // extra-outer-quotes form here: under ConPTY it becomes part of the command
    // name and produces "O caminho da rede nÃ£o foi encontrado".
    const usesCallDispatcher = /\s/.test(String(command))

    return {
      command: 'cmd.exe',
      args: [
        '/d',
        '/s',
        keepShellOpen ? '/k' : '/c',
        ...(usesCallDispatcher ? ['call'] : []),
        command,
        ...args,
      ],
    }
  }

  if (keepShellOpen) {
    // Same reasoning as the darwin branch, without the login-shell wrapper:
    // on Linux the command is on PATH as-is, so we only need a shell to stay
    // behind once it exits.
    const shell = adapter.getDefaultShell(env)
    const commandLine = [command, ...args]
      .map((value) => adapter.escapeArg(String(value)))
      .join(' ')

    return {
      command: shell,
      args: ['-i', '-c', `${commandLine}; exec ${adapter.escapeArg(shell)} -i`],
    }
  }

  return { command, args }
}

/** Mesma regra de "tem conta" da validação: string não vazia. */
function hasSelectedAccount(accountId) {
  return typeof accountId === 'string' && accountId.trim() !== ''
}

/** Conta como a sessão a guarda: id aparado, ou `null` no login do sistema. */
function normalizeSessionAccountId(accountId) {
  return hasSelectedAccount(accountId) ? accountId.trim() : null
}

function normalizeAccountMode(mode) {
  return PTY_ACCOUNT_MODES.includes(mode) ? mode : DEFAULT_PTY_ACCOUNT_MODE
}

function createAccountMismatchError() {
  const error = new Error(
    'A sessão viva deste bloco está em outra conta. Reinicie o terminal para abri-lo na conta do bloco.',
  )
  error.code = PTY_SESSION_ACCOUNT_MISMATCH
  return error
}

/**
 * Clamp a terminal dimension to a sane positive integer.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeDimension(value, fallback) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback
  }

  return Math.floor(numeric)
}

/**
 * A PTY needs a persistent shell, unlike one-shot shell command execution.
 * On Windows start it without AutoRun/profile scripts, which can emit startup
 * errors or immediately exit before the user has a usable terminal.
 *
 * @param {string} command
 * @param {typeof platform} adapter
 * @returns {string[]}
 */
function getDefaultPtyShellArgs(command, adapter) {
  if (adapter.name !== 'win32') {
    return []
  }

  if (typeof adapter.getShellArgs === 'function') {
    return adapter.getShellArgs(command)
  }

  return /(?:powershell|pwsh)/i.test(command) ? ['-NoLogo', '-NoProfile'] : ['/d']
}

/**
 * A canvas project can be moved or deleted after a terminal node is saved.
 * node-pty fails before the shell starts when cwd no longer exists, which is
 * especially opaque on Windows (the pane only shows "path not found").
 * Starting in the user's home keeps the terminal usable and lets the user
 * navigate to the project again.
 *
 * @param {unknown} requested
 * @returns {string}
 */

/** MAX_PATH clássico do Windows. Acima disto, WinAPIs sem o prefixo `\\?\` recusam o caminho. */
const WIN32_MAX_PATH = 260

/**
 * Distingue a falha real de path longo (medida ao vivo: `error code: 267`,
 * `ERROR_DIRECTORY`, vindo do `WindowsPtyAgent` nativo) de qualquer outra
 * falha de spawn — sem essa distinção, um cwd comprido por coincidência
 * junto de um erro não relacionado geraria um aviso enganoso.
 *
 * @param {unknown} error
 * @param {string} cwd
 * @param {string} platformName
 * @returns {boolean}
 */
function isWindowsLongPathFailure(error, cwd, platformName) {
  if (platformName !== 'win32' || typeof cwd !== 'string' || cwd.length < WIN32_MAX_PATH) {
    return false
  }
  const message = error instanceof Error ? error.message : String(error)
  return /error code:\s*267\b/i.test(message) || /ERROR_DIRECTORY/i.test(message)
}

function resolveWorkingDirectory(requested) {
  const fallback = os.homedir()
  if (typeof requested !== 'string' || !requested.trim()) {
    return fallback
  }

  try {
    return fs.statSync(requested).isDirectory() ? requested : fallback
  } catch {
    return fallback
  }
}

/**
 * Locate the Windows Codex shim without invoking a shell. This covers PATH
 * entries plus the npm global directory used by the standard Windows install.
 *
 * @param {string} command
 * @param {Record<string, string>} env
 * @param {(candidate: string) => boolean} [exists]
 * @returns {string | null}
 */
function resolveWindowsCodexPath(command, env, exists = fs.existsSync) {
  if (!isCodexCommand(command)) {
    return null
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  const pathEntries = String(pathKey ? env[pathKey] : '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const home = env.USERPROFILE || env.HOME || os.homedir()
  const knownDirectories = [
    ...pathEntries,
    env.APPDATA ? path.win32.join(env.APPDATA, 'npm') : null,
    env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'npm') : null,
    home ? path.win32.join(home, 'AppData', 'Roaming', 'npm') : null,
  ].filter(Boolean)
  const commandName = path.win32.basename(command).replace(/\.(?:cmd|exe|bat|ps1)$/i, '')

  for (const directory of [...new Set(knownDirectories)]) {
    for (const extension of ['.cmd', '.exe', '.bat', '.ps1', '']) {
      const candidate = path.win32.join(directory, `${commandName}${extension}`)
      try {
        if (exists(candidate)) {
          return candidate
        }
      } catch {
        continue
      }
    }
  }

  return null
}

function isCodexCommand(command) {
  return path.win32
    .basename(String(command ?? ''))
    .replace(/\.(?:cmd|exe|bat|ps1)$/i, '')
    .toLowerCase() === 'codex'
}

/** O comando é o Gemini CLI (o `gemini.cmd` do npm no Windows incluído)? */
function isGeminiCommand(command) {
  return path.win32
    .basename(String(command ?? ''))
    .replace(/\.(?:cmd|exe|bat|ps1)$/i, '')
    .toLowerCase() === 'gemini'
}

/** O comando é o Claude Code? A variável de tela clássica só existe nele. */
function isClaudeCommandName(command) {
  if (typeof command !== 'string') return false
  const name = command.replace(/\\/g, '/').split('/').pop() || ''
  return /^claude(\.exe|\.cmd)?$/i.test(name)
}

/**
 * A conversa que um spawn retoma pelo ID, no formato que o renderer monta
 * (`buildAgentResumeArgs` em agent-session.ts): Codex `resume …args <id>`,
 * com o ID no fim, e Claude e Gemini `--resume <id> …args`. O ID passa pela
 * mesma regra do renderer; fora dela (`codex resume --last`, `claude
 * --resume` sem ID, `gemini --resume latest` ou um índice, que não apontam
 * uma conversa fixa) não há conversa conhecida e a descoberta segue como num
 * terminal novo.
 *
 * O comando pode vir como caminho (o Codex resolvido no Windows), por isso a
 * comparação é pelo nome do executável.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {{ provider: 'codex' | 'claude' | 'gemini', sessionId: string } | null}
 */
function resolveResumeTarget(command, args) {
  if (!Array.isArray(args) || args.length < 2) return null
  if (isCodexCommand(command) && args[0] === 'resume') {
    const sessionId = args[args.length - 1]
    return isSafeSessionId(sessionId) ? { provider: 'codex', sessionId } : null
  }
  const provider = isClaudeCommandName(command) ? 'claude' : isGeminiCommand(command) ? 'gemini' : null
  if (provider && args[0] === '--resume') {
    const sessionId = args[1]
    return isSafeSessionId(sessionId) ? { provider, sessionId } : null
  }
  return null
}

/**
 * Referência de uma retomada por ID, no mesmo formato da que a descoberta
 * entrega: a pasta é a efetiva do PTY e a conta do processo vai carimbada do
 * mesmo jeito (retomar em outra conta abriria o histórico de uma conta na
 * cobrança de outra). Sem conta = login do sistema, sem o campo.
 *
 * @param {{ provider: 'codex' | 'claude' | 'gemini', sessionId: string }} target
 * @param {string} cwd
 * @param {string | null} accountId
 * @param {number} capturedAt
 */
function createResumeAgentSession({ provider, sessionId }, cwd, accountId, capturedAt) {
  return {
    version: 1,
    provider,
    sessionId,
    cwd,
    capturedAt,
    source: 'resume-args',
    ...(accountId ? { accountId } : {}),
  }
}

/**
 * A entrada envia uma mensagem? Só o CR (o Enter do xterm) envia: o LF puro é
 * o Shift+Enter do bloco (nova linha, sem enviar), e o que vem dentro do
 * bracketed paste é texto colado, mesmo com CR. A colagem pode chegar partida
 * em mais de uma escrita, então quem chama guarda se ela ficou aberta.
 *
 * @param {string} input
 * @param {boolean} inPaste - Havia colagem aberta antes desta entrada.
 * @returns {{ submitted: boolean, inPaste: boolean }}
 */
function scanSubmittedInput(input, inPaste) {
  let submitted = false
  let open = Boolean(inPaste)
  let index = 0
  while (index < input.length) {
    if (open) {
      const end = input.indexOf(BRACKETED_PASTE_END, index)
      if (end === -1) break
      open = false
      index = end + BRACKETED_PASTE_END.length
      continue
    }
    const start = input.indexOf(BRACKETED_PASTE_START, index)
    const typed = start === -1 ? input.slice(index) : input.slice(index, start)
    if (typed.includes('\r')) submitted = true
    if (start === -1) break
    open = true
    index = start + BRACKETED_PASTE_START.length
  }
  return { submitted, inPaste: open }
}

module.exports = {
  PtyProcessManager,
  AGENT_SESSION_DISCOVERY_MAX_REARMS,
  AGENT_SESSION_DISCOVERY_WINDOW_MS,
  MAX_REPLAY_BUFFER_CHARS,
  PTY_ACCOUNT_MODES,
  PTY_SESSION_ACCOUNT_MISMATCH,
  isClaudeCommandName,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  WIN32_MAX_PATH,
  createPtyLaunchSpec,
  getDefaultPtyShellArgs,
  isWindowsLongPathFailure,
  resolvePtyCommand,
  resolveWorkingDirectory,
  resolveWindowsCodexPath,
}
