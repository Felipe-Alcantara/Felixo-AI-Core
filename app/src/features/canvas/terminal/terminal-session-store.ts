import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  activateTerminalExternalLink,
  isAllowedTerminalExternalLink,
  openAllowedTerminalExternalLink,
} from './terminal-external-link'
import { buildDroppedFileReference } from './terminal-dropped-files'
import { splitTerminalSubmission, toSubmittedTerminalText } from './terminal-input'
import { decideCopyShortcut } from './terminal-copy-shortcut'
import {
  buildForcedSelectionEventInit,
  buildReplayEventInit,
  exceedsDragThreshold,
  isMacPlatform,
  shouldDeferMouseDown,
  xtermAlreadyForcesSelection,
} from './terminal-mouse-selection'
import {
  buildClearInputSequence,
  findMultiLineTypedInputRange,
  isDeleteSelectionKey,
  isNewlineShortcut,
  isSelectInputShortcut,
} from './terminal-input-selection'
import {
  findClipboardImage,
  formatImagePathForPrompt,
  hasClipboardText,
  isImagePasteShortcut,
} from './terminal-image-paste'
import { isSubmissionPending } from './terminal-submission'
import {
  buildContextFileReferences,
  buildInlineFallback,
  contextFileKindForPrompt,
  isAgentCliCommand,
  splitInitialContext,
} from '../services/context-file-delivery'
import type { ContextFileKind } from '../services/context-file-delivery'
import { prepareHandoffTranscript } from '../services/terminal-handoff'
import {
  buildAgentResumeArgs,
  isAgentSessionReference,
  type AgentSessionReference,
} from '../services/agent-session'
import type { SessionMetadata } from './session-metadata'
import {
  computePreview,
  computeSignature,
  readBuffer,
  readShellHistory,
  readViewport,
} from './terminal-buffer-reader'
import {
  cleanPrompt,
  isBusyScreen,
  isClaudeBypassPermissionsWarning,
  isCodexTrustPrompt,
  looksLikeApprovalPrompt,
  readInputLineState,
} from './terminal-screen-state'

/**
 * Activity derived from the output stream:
 * - `working`: received output very recently (the agent is generating).
 * - `idle`: alive but quiet for a while (waiting for you / finished a turn).
 * - `waiting_approval`: quiet, and the settled buffer looks like an
 *   interactive decision prompt (approval, question, plan confirmation).
 * - `exited`: the underlying process ended.
 * - `error`: failed to start.
 */
export type SessionActivity =
  | 'starting'
  | 'working'
  | 'idle'
  | 'waiting_approval'
  | 'exited'
  | 'error'

export type SessionSnapshot = {
  activity: SessionActivity
  /** Last lines of output, for the collapsed card preview. */
  previewLines: string[]
  exitCode?: number
  message?: string
  /** File delivery failed; the session used the old inline fallback. */
  contextWarning?: string
  /** The most recent prompt submitted to the session (typed or programmatic). */
  lastPrompt?: string
  /**
   * Bumped every time `ensure()` creates a brand-new `xterm.Terminal` for this
   * id (first mount, or after `restart()`). The id itself doesn't change on
   * restart, so consumers that mount the terminal's DOM element into a
   * container (the drawer) need this to notice the swap and re-attach —
   * otherwise the new instance is never mounted until the component remounts.
   */
  generation?: number
}

export type TerminalTranscript = {
  /** Text currently available in xterm's active scrollback buffer. */
  text: string
}

type SessionListener = (snapshot: SessionSnapshot) => void

/** Ms of output silence after which a running session is considered idle. */
const IDLE_AFTER_MS = 1500
/** A configured agent should not terminate silently immediately after launch. */
const SILENT_EARLY_EXIT_MS = 5000
/** A tela reconhecida, e não um atraso fixo, decide quando o texto pode entrar. */
const DEFAULT_INITIAL_TEXT_DELAY_MS = 0
/** Fallback de silêncio para CLIs cuja linha de entrada não conhecemos. */
const INITIAL_TEXT_READY_QUIET_MS = 500
/** Safety fallback for CLIs that do not emit a startup banner. */
const INITIAL_TEXT_MAX_WAIT_MS = 10000
/**
 * Teto para as CLIs cuja linha de entrada sabemos reconhecer (Claude, Codex).
 *
 * Enquanto a entrada não aparece, escrever é jogar o texto fora, então vale
 * esperar bem mais do que o fallback cego: um boot travado num aviso só sai de
 * lá quando a pessoa responde, e é melhor entregar o contexto tarde do que
 * digitá-lo numa tela que ninguém lê.
 */
const INITIAL_TEXT_INPUT_WAIT_MS = 60000
/** Espera curta depois de reconhecer uma tela de aceite antes de responder a ela. */
const SCREEN_ACCEPT_DELAY_MS = 150
/**
 * Intervalo entre duas teclas de uma mesma resposta (mover a seleção, confirmar).
 *
 * Mesma razão do intervalo entre o texto inicial e o seu Enter: com as duas
 * teclas na mesma escrita, o TUI trata o bloco como uma sequência só e ignora a
 * confirmação — verificado contra a CLI real, em que `seta-baixo + Enter` juntos
 * deixavam o aviso do modo yolo intocado e separados o aceitavam.
 */
const KEY_SEQUENCE_DELAY_MS = 200
/** Reconferência do aceite: a tela diz se a tecla foi recebida. */
const SCREEN_ACCEPT_ATTEMPTS = 3
/** Depois de aceitar a tela, tempo para a CLI sair dela e carregar o REPL. */
/** Após o aceite, basta dar ao TUI uma volta curta antes de reler a tela. */
const POST_ACCEPT_INITIAL_TEXT_DELAY_MS = 250
const ACCEPT_SCREEN_BUFFER_LIMIT = 12000
/** Lets the Codex TUI process pasted text before it receives the Enter key. */
const INITIAL_TEXT_SUBMIT_DELAY_MS = 75
/**
 * O Enter pode se perder quando o TUI ainda está redesenhando — sob carga (o
 * app reiniciando com vários agentes), o texto fica escrito na linha de entrada
 * esperando submissão. Estas constantes governam a reconferência: se o texto
 * ainda estiver na linha de entrada, o Enter é reenviado.
 */
const SUBMIT_RETRY_DELAY_MS = 600
const SUBMIT_RETRY_LIMIT = 3
/**
 * Reconferência do texto de contexto, que não tem Enter e portanto não tem
 * submissão para confirmar: o único sinal de que ele chegou é ele aparecer na
 * linha de entrada. Sem isso, um contexto perdido é perdido em silêncio — foi o
 * que manteve este bug de pé por três rodadas.
 */
// Give the TUI time to redraw the pasted context before deciding it was lost.
// This remains a delivery check, not a startup delay: the first write is still
// released as soon as the recognized input line is ready.
const CONTEXT_CONFIRM_DELAY_MS = 2000
const CONTEXT_REWRITE_LIMIT = 3
/** Janela total da reconferência, para o timer não sobreviver ao boot da CLI. */
const CONTEXT_DELIVERY_WINDOW_MS = 30000
/**
 * Janela em que uma segunda tentativa de colar imagem é tratada como eco da
 * primeira. Curta o bastante para não atrapalhar quem cola duas imagens em
 * sequência, longa o bastante para cobrir a ida e volta ao processo principal.
 */
const IMAGE_PASTE_DEDUPE_MS = 500

/**
 * Até onde subir atrás do começo da caixa de edição.
 *
 * Eram 4 linhas, e isso quebrava o Ctrl+A no Codex: ele mantém cada linha do
 * que foi escrito, então o contexto inicial que o app digita no composer
 * empurra o marcador para uma dúzia de linhas acima do cursor. (O Claude
 * escapava porque colapsa texto longo em `[Pasted text #1 +6 lines]`, uma
 * linha só.) O teto é a altura da janela, porque a caixa de edição não passa
 * disso — e quem procura o marcador exige que ele esteja na borda esquerda,
 * então subir mais não faz eleger saída antiga como entrada.
 */
const MAX_MULTILINE_INPUT_ROWS = 200

type SessionOptions = {
  command?: string
  args?: string[]
  cwd?: string
  /** Text submitted to the PTY shortly after spawn (e.g. a standing instruction). */
  initialText?: string
  /** Human label used in the generated context-file header. */
  sourceLabel?: string
  /** Interpreter to try when `command` isn't installed (Windows `py`/`python`). */
  fallbackCommand?: string
  /** Keeps the terminal interactive after the command exits (run-a-file). */
  keepShellOpen?: boolean
  /** Restored timestamp; omitted on restart so a fresh clock is created. */
  startedAt?: number
  /** Cria um bloco Página Web quando a pessoa abre um link do terminal. */
  onOpenWebpage?: (url: string) => void
  agentSession?: AgentSessionReference
  resumeAgentSession?: boolean
  onAgentSession?: (reference: AgentSessionReference) => void
}

type LinkMenuActions = {
  onOpenWebpage: (url: string) => void
}

function mountTerminalLinkMenu(
  event: MouseEvent,
  url: string,
  actions: LinkMenuActions,
): () => void {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Ações do link')
  menu.style.cssText = [
    'position:fixed',
    `left:${Math.min(event.clientX, window.innerWidth - 220)}px`,
    `top:${Math.min(event.clientY, window.innerHeight - 100)}px`,
    'z-index:10000',
    'display:flex',
    'flex-direction:column',
    'min-width:210px',
    'padding:4px',
    'border:1px solid rgba(110,231,183,.3)',
    'border-radius:6px',
    'background:#101a18',
    'box-shadow:0 10px 25px rgba(0,0,0,.4)',
  ].join(';')

  const addAction = (label: string, action: () => void) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.setAttribute('role', 'menuitem')
    button.style.cssText = [
      'padding:7px 9px',
      'border:0',
      'border-radius:4px',
      'background:transparent',
      'color:#d1fae5',
      'text-align:left',
      'font:13px system-ui,sans-serif',
      'cursor:pointer',
    ].join(';')
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255,255,255,.1)'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent'
    })
    button.addEventListener('click', () => {
      action()
      cleanup()
    })
    menu.appendChild(button)
  }

  addAction('Abrir no canvas', () => actions.onOpenWebpage(url))
  addAction('Abrir no navegador', () => {
    openAllowedTerminalExternalLink(url)
  })
  document.body.appendChild(menu)

  const cleanup = () => {
    menu.remove()
    document.removeEventListener('mousedown', onOutside)
    document.removeEventListener('keydown', onEscape)
  }
  const onOutside = (outsideEvent: MouseEvent) => {
    if (!menu.contains(outsideEvent.target as Node)) cleanup()
  }
  const onEscape = (keyboardEvent: KeyboardEvent) => {
    if (keyboardEvent.key === 'Escape') cleanup()
  }
  queueMicrotask(() => {
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
  })
  return cleanup
}

type Session = {
  id: string
  ptySessionId: string
  terminal: Terminal
  fitAddon: FitAddon
  listeners: Set<SessionListener>
  snapshot: SessionSnapshot
  idleTimer: ReturnType<typeof setTimeout> | null
  offData: () => void
  offExit: () => void
  offSession: () => void
  disposed: boolean
  startedAt: number
  receivedOutput: boolean
  /**
   * A CLI já desenhou algo, não apenas emitiu bytes.
   *
   * Uma CLI de tela cheia começa mandando só sequências de escape (cursor,
   * modos do terminal, alt-screen) que não mudam nada na tela. Tratar esses
   * bytes como "a CLI começou" fazia a espera por silêncio terminar antes de
   * existir qualquer prompt: o relógio do silêncio nunca era reiniciado, então
   * "quieto há 500 ms" já era verdade no primeiro byte.
   */
  paintedOutput: boolean
  pendingWrites: number
  pendingExit?: { exitCode: number; signal?: number }
  command?: string
  /** Printable keystrokes typed since the last submit, to capture the prompt. */
  inputBuffer: string
  /**
   * O texto que o Ctrl+A destacou na linha de entrada.
   *
   * Guardado para que o Backspace só apague a linha quando a seleção ainda for
   * aquela — uma seleção feita com o mouse no meio do histórico não pode virar
   * um comando de limpar a entrada.
   */
  selectedInput?: {
    /** Texto que o xterm destacou, usado para confirmar que ele ainda está ativo. */
    selection: string
    /** Texto digitado sem o prompt nem a moldura que a CLI desenha. */
    text: string
    /**
     * Quantas linhas visuais do buffer a seleção ocupou.
     *
     * É o que decide quantas vezes `Ctrl+U` precisa se repetir para apagar a
     * entrada inteira — uma por linha visual, não uma por quebra lógica
     * (`\n`), porque é a linha visual que o composer da CLI desenha e é nela
     * que o `Ctrl+U` age.
     */
    visualLineCount: number
  }
  /** Buffer signature at the last idle check, to ignore in-place UI redraws. */
  lastSignature: string
  /** When output last changed the buffer in a meaningful way. */
  lastMeaningfulAt: number
  args: string[]
  initialText?: string
  rawInitialText?: string
  sourceLabel?: string
  optionsOnOpenWebpage?: (url: string) => void
  agentSession?: AgentSessionReference
  /** Serializes programmatic deliveries so file creation cannot reorder prompts. */
  sendChain: Promise<void>
  initialTextTimer: ReturnType<typeof setTimeout> | null
  /** Reconferência de que o prompt inicial foi submetido, não só digitado. */
  submitRetryTimer: ReturnType<typeof setTimeout> | null
  /** Reconferência de que o texto de contexto chegou na linha de entrada. */
  contextRetryTimer: ReturnType<typeof setTimeout> | null
  initialTextSent: boolean
  /**
   * Alguém já escreveu nesta entrada depois de nós (o usuário digitando, um
   * aviso de renomeação). A partir daí a linha é dele: reescrever contexto ali
   * atropelaria o que ele está montando.
   */
  inputTouched: boolean
  /** The paste interceptor is bound to the xterm element, which outlives attach. */
  imagePasteBound: boolean
  /** O interceptador de clique-arrastar é ligado ao elemento do xterm, como o de colar imagem. */
  mouseSelectionBound: boolean
  hoveredLink?: string
  offLinkContextMenu?: () => void
  /** Encerra um gesto de mouse retido e solta os listeners do documento. */
  offMouseSelection?: () => void
  linkMenuCleanup?: () => void
  fileDropBound: boolean
  /**
   * Quando uma imagem foi colada por aqui pela última vez.
   *
   * Colar imagem chega por dois caminhos — o evento `paste` e a tecla Ctrl+V —
   * e qual deles dispara depende de plataforma e do que está na área de
   * transferência. Se os dois dispararem para a mesma colagem, o arquivo seria
   * salvo duas vezes e o caminho digitado duas vezes.
   */
  lastImagePasteAt: number
  codexTrustBuffer: string
  codexTrustHandled: boolean
  claudeBypassBuffer: string
  claudeBypassHandled: boolean
}

/**
 * Owns terminal sessions independently of any React component, so a terminal
 * keeps running while its card is collapsed. The xterm DOM element is moved
 * (attach/detach) between the collapsed preview and the expanded drawer rather
 * than re-created, so scrollback and the live process survive.
 */
export class TerminalSessionStore {
  private sessions = new Map<string, Session>()
  private listeners = new Map<string, Set<SessionListener>>()
  private allListeners = new Set<() => void>()
  /** Immutable cache used by React's external-store subscription. */
  private snapshots: Record<string, SessionSnapshot> = {}
  /** Survives `remove()`, so a restart's fresh session gets a new generation. */
  private generations = new Map<string, number>()

  /**
   * Ends an exited/errored session and immediately re-creates it with the
   * same launch options — e.g. after a Codex login attempt closes the CLI,
   * so the user can retry without deleting and re-adding the terminal node.
   */
  restart(id: string, options: SessionOptions = {}): void {
    const listeners = this.listeners.get(id)
    this.remove(id)
    if (listeners) {
      this.listeners.set(id, listeners)
    }
    this.ensure(id, options)
  }

  /** Returns the existing session for an id, creating it on first use. */
  ensure(id: string, options: SessionOptions = {}): void {
    if (this.sessions.has(id)) {
      return
    }

    const pty = window.felixo?.pty
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      // HMR/navigation can recreate the renderer while the Electron PTY keeps
      // running. A generous scrollback lets the replacement renderer restore
      // enough context for both review and responsibility handoff.
      scrollback: 20_000,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0b0f14' },
      // A seleção de mouse deste app força Option no macOS para vencer o
      // "mouse tracking" das CLIs de tela cheia (ver terminal-mouse-selection.ts).
      // Sem esta opção, Option-arrastar cairia no modo de seleção em coluna do
      // xterm.js em vez de selecionar o texto normalmente; com ela, o próprio
      // xterm.js neutraliza esse modo quando Option está forçando seleção.
      macOptionClickForcesSelection: true,
      // O mesmo Option forçado dispararia "mover o cursor da CLI para onde
      // cliquei" num clique rápido sem arrastar — comportamento do xterm.js
      // que este app não pediu e que confundiria quem só queria clicar.
      altClickMovesCursor: false,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    let createdSession: Session | null = null
    terminal.loadAddon(
      new WebLinksAddon(activateTerminalExternalLink, {
        hover: (_event, text) => {
          if (createdSession && isAllowedTerminalExternalLink(text)) {
            createdSession.hoveredLink = text
            if (createdSession.terminal.element) {
              createdSession.terminal.element.title =
                'Ctrl/Cmd+clique: abrir no navegador · clique direito: mais opções'
            }
          }
        },
        leave: () => {
          if (createdSession?.terminal.element) {
            createdSession.terminal.element.title = ''
          }
        },
      }),
    )

    const generation = (this.generations.get(id) ?? 0) + 1
    this.generations.set(id, generation)

    const launchArgs = options.resumeAgentSession
      ? buildAgentResumeArgs(
          options.command,
          options.args ?? [],
          options.cwd,
          options.agentSession,
        ) ?? options.args ?? []
      : options.args ?? []

    const session: Session = {
      id,
      // The id must survive renderer HMR, navigation to Chat and a drawer
      // remount. The Electron process uses it to reattach instead of spawning
      // a second CLI in the same project.
      ptySessionId: `canvas:${id}`,
      terminal,
      fitAddon,
      listeners: this.listeners.get(id) ?? new Set(),
      snapshot: { activity: 'starting', previewLines: [], generation },
      idleTimer: null,
      offData: () => {},
      offExit: () => {},
      offSession: () => {},
      disposed: false,
      startedAt: options.startedAt ?? Date.now(),
      receivedOutput: false,
      paintedOutput: false,
      pendingWrites: 0,
      command: options.command,
      inputBuffer: '',
      lastSignature: '',
      lastMeaningfulAt: Date.now(),
      args: [...launchArgs],
      initialText: undefined,
      rawInitialText: options.initialText,
      sourceLabel: options.sourceLabel,
      optionsOnOpenWebpage: options.onOpenWebpage,
      agentSession: isAgentSessionReference(options.agentSession)
        ? options.agentSession
        : undefined,
      sendChain: Promise.resolve(),
      initialTextTimer: null,
      submitRetryTimer: null,
      contextRetryTimer: null,
      initialTextSent: false,
      inputTouched: false,
      imagePasteBound: false,
      mouseSelectionBound: false,
      hoveredLink: undefined,
      fileDropBound: false,
      lastImagePasteAt: 0,
      codexTrustBuffer: '',
      codexTrustHandled: false,
      claudeBypassBuffer: '',
      claudeBypassHandled: false,
    }
    createdSession = session
    this.listeners.set(id, session.listeners)
    this.sessions.set(id, session)
    this.snapshots = { ...this.snapshots, [id]: session.snapshot }
    this.notifyAll()

    if (!pty) {
      this.update(session, { activity: 'error', message: 'Bridge PTY indisponível.' })
      return
    }

    session.offData = pty.onData((event) => {
      if (event.sessionId === session.ptySessionId) {
        session.receivedOutput ||= event.data.length > 0
        session.pendingWrites += 1
        this.handleCodexTrustPrompt(session, event.data)
        this.handleClaudeBypassWarning(session, event.data)
        terminal.write(event.data, () => {
          session.pendingWrites -= 1
          if (session.disposed) {
            return
          }

          if (session.pendingWrites === 0 && session.pendingExit) {
            const pendingExit = session.pendingExit
            session.pendingExit = undefined
            this.finishExit(session, pendingExit)
            return
          }

          this.onOutput(session)
        })
      }
    })

    session.offExit = pty.onExit((event) => {
      if (event.sessionId !== session.ptySessionId) {
        return
      }
      this.clearIdleTimer(session)
      if (session.pendingWrites > 0) {
        session.pendingExit = event
        return
      }
      this.finishExit(session, event)
    })

    session.offSession =
      pty.onSession?.((event) => {
        if (event.ptySessionId !== session.ptySessionId || !isAgentSessionReference(event)) {
          return
        }
        session.agentSession = event
        options.onAgentSession?.(event)
        this.notifyAll()
      }) ?? (() => {})

    // Shift+Enter inserts a newline instead of submitting. xterm sends plain
    // CR ('\r') for both Enter and Shift+Enter, so the agent CLI can't tell
    // them apart. We intercept Shift+Enter here and send a bare LF ('\n'),
    // which Claude Code treats as "new line, don't send" (CR is "send").
    // Returning false stops xterm's default handling so it doesn't also emit a
    // CR via onData, which would submit.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown') {
        // Tecla de verdade, vinda do teclado: daqui em diante a linha de entrada
        // tem dono. É o sinal mais confiável para isso — ao contrário do
        // `onData`, nada além de uma pessoa gera keydown.
        session.inputTouched = true
      }
      if (isNewlineShortcut(event)) {
        // Só escrevemos no keydown — isNewlineShortcut também reconhece o
        // keypress que o xterm.js dispara logo depois (ver o porquê no
        // próprio módulo), e escrever nos dois duplicaria o '\n'.
        if (event.type === 'keydown') {
          void pty.write({ sessionId: session.ptySessionId, data: '\n' })
        }
        return false
      }
      // Ctrl+A: selecionar o que foi escrito na linha de entrada.
      //
      // No terminal essa tecla é o `0x01` — "ir para o começo da linha" — e não
      // existe seleção de texto numa linha de PTY. O que existe é a seleção do
      // xterm, a mesma do mouse, que o Ctrl+C já copia: é ela que destacamos,
      // do fim do prompt até o cursor. Com a entrada vazia (ou numa linha sem
      // prompt) não há o que destacar e a tecla segue crua, preservando o gesto
      // de sempre onde ele não atrapalha.
      if (isSelectInputShortcut(event)) {
        // `false` engole a tecla quando houve seleção; `true` deixa o `0x01`
        // seguir para o PTY quando não havia nada escrito.
        return !this.selectTypedInput(session)
      }
      // Backspace com essa seleção ativa apaga a linha inteira — sem isso, o
      // Ctrl+A destacaria um texto que ninguém consegue apagar de uma vez, que
      // era exatamente a queixa de origem.
      if (isDeleteSelectionKey(event) && this.hasTypedInputSelection(session)) {
        const clearSequence = buildClearInputSequence(session.selectedInput?.visualLineCount ?? 1)
        void pty.write({ sessionId: session.ptySessionId, data: clearSequence })
        session.terminal.clearSelection()
        session.selectedInput = undefined
        return false
      }
      // Ctrl+C dentro do terminal é o `0x03`: `SIGINT` para a CLI do agente, que
      // interrompe o turno (e encerra a sessão no segundo aperto seguido). Com
      // texto selecionado a intenção é copiar, e é isso que atendemos aqui,
      // devolvendo `false` para o PTY não receber o sinal. Sem seleção a tecla
      // segue intacta: interromper com Ctrl+C é o gesto padrão de terminal.
      const copyDecision = decideCopyShortcut(event, terminal.hasSelection())
      if (copyDecision === 'copy') {
        void this.copySelection(session)
        return false
      }
      if (copyDecision === 'passthrough') {
        return true
      }
      // Ctrl+V (Cmd+V no macOS) com imagem na área de transferência não gera
      // evento `paste` nenhum — ver `pasteClipboardImageFromOs`. A tecla, essa,
      // chega, e é por ela que a colagem é atendida.
      //
      // `false` impede o xterm de mandar o ^V (0x16) para o PTY. Sem isso a
      // tecla é atendida duas vezes: por nós e pela própria CLI, para quem lê a
      // área de transferência sozinha — o Codex lê, com biblioteca nativa e sem
      // depender de `xclip`, e anexava a mesma imagem de novo (`[Image #1]
      // [Image #2]` por um único Ctrl+V). Colar texto não depende do ^V: quem
      // cola é o evento `paste`, que continua nascendo normalmente.
      if (isImagePasteShortcut(event)) {
        void this.pasteClipboardImageFromOs(session)
        return false
      }
      return true
    })

    // Keyboard → PTY. We also track what's typed so we can surface the last
    // submitted prompt. The PTY is raw, so we reconstruct the current line:
    // accumulate printable chars, handle backspace, and on CR (Enter = submit)
    // commit the buffer as the last prompt. Shift+Enter sends LF via the custom
    // handler above and never reaches here, so it correctly keeps building.
    terminal.onData((data) => {
      void pty.write({ sessionId: session.ptySessionId, data })

      // O `onData` do xterm carrega duas coisas diferentes: o que a pessoa
      // digita e as respostas que o próprio terminal dá às perguntas da CLI
      // (atributos do dispositivo, foco), que chegam como sequência de escape
      // durante o boot. Tratar essas respostas como digitação fazia o store
      // acreditar que a linha de entrada já tinha dono — e, antes disso, colava
      // o texto da resposta (`[?1;2c`) no início do prompt mostrado no card.
      if (data.startsWith('\x1b')) {
        return
      }

      session.inputTouched = true
      this.trackTypedInput(session, data)
    })

    void pty
      .spawn({
        sessionId: session.ptySessionId,
        command: options.command,
        args: launchArgs,
        cwd: options.cwd,
        cols: terminal.cols || 80,
        rows: terminal.rows || 24,
        reuseExisting: true,
        fallbackCommand: options.fallbackCommand,
        keepShellOpen: options.keepShellOpen,
      })
      .then((result) => {
        if (session.disposed) {
          return
        }
        // Só `result.ok` decide se o spawn deu certo. A checagem de
        // `activity === 'starting'` mora no ramo de erro, e não aqui: o
        // `onData` é assinado antes do `spawn`, então a CLI pode pintar a
        // primeira tela — e levar a sessão para 'working' — antes desta
        // promise resolver. No Windows o ConPTY ganha essa corrida quase
        // sempre, e o spawn bem-sucedido era marcado como erro, o que ainda
        // impedia `scheduleInitialText` de enviar o texto inicial.
        if (result?.ok) {
          if (result.reused) {
            // The PTY already contains the original agent turn. Replaying the
            // initial instruction here would submit a duplicate task after a
            // renderer reload, which was the development reset bug.
            session.initialTextSent = true
            this.clearInitialTextTimer(session)
            this.markWorking(session)
            return
          }

          void this.prepareInitialText(session).then(() => {
            if (session.disposed) return

            this.markWorking(session)

            // Nada de delay calculado para adivinhar quando a CLI está pronta:
            // o relógio só decide quando começar a olhar a tela. Quem libera a
            // escrita é a linha de entrada aparecer (`scheduleInitialText`), e
            // as telas de aceite que aparecem antes dela são respondidas pelos
            // observadores do stream de saída mais abaixo.
            this.scheduleInitialText(session, getInitialTextDelay())
          })
        } else if (session.snapshot.activity === 'starting') {
          // Uma sessão que já saiu de 'starting' teve seu estado definido por
          // algo mais recente (saída da CLI, exit, dispose); não o sobrescreve.
          this.update(session, {
            activity: 'error',
            message: result?.message ?? 'Falha ao iniciar o terminal.',
          })
        }
      })
  }

  /** Mounts the session's terminal element into a container. */
  attach(id: string, container: HTMLElement): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }

    // The drawer reuses one container across sessions; clear any previously
    // mounted terminal element so switching cards doesn't stack terminals.
    for (const child of Array.from(container.children)) {
      if (child !== session.terminal.element) {
        container.removeChild(child)
      }
    }

    if (!session.terminal.element) {
      session.terminal.open(container)
    } else if (session.terminal.element.parentElement !== container) {
      container.appendChild(session.terminal.element)
    }

    this.bindLinkContextMenu(session)
    this.bindFileDrop(session)

    this.bindImagePaste(session)
    this.bindMouseSelection(session)
    this.fit(session)
  }

  private bindLinkContextMenu(session: Session): void {
    const element = session.terminal.element
    if (!element || session.offLinkContextMenu) return

    const onContextMenu = (event: MouseEvent) => {
      const url = session.hoveredLink
      if (!url || !isAllowedTerminalExternalLink(url)) return
      event.preventDefault()
      event.stopPropagation()
      session.linkMenuCleanup?.()
      session.linkMenuCleanup = mountTerminalLinkMenu(event, url, {
        onOpenWebpage: (link) => session.optionsOnOpenWebpage?.(link),
      })
    }
    element.addEventListener('contextmenu', onContextMenu)
    session.offLinkContextMenu = () => element.removeEventListener('contextmenu', onContextMenu)
  }

  private bindFileDrop(session: Session): void {
    const element = session.terminal.element
    if (!element || session.fileDropBound) return

    session.fileDropBound = true
    const isFileDrag = (event: DragEvent) =>
      Boolean(
        Array.from(event.dataTransfer?.types ?? []).includes('Files') ||
          event.dataTransfer?.files.length,
      )
    const clearFeedback = () => element.classList.remove('felixo-terminal-drop-target')

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      element.classList.add('felixo-terminal-drop-target')
    }
    const onDragLeave = (event: DragEvent) => {
      if (!element.contains(event.relatedTarget as Node | null)) {
        clearFeedback()
      }
    }
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      clearFeedback()
      this.handleFileDrop(session.id, event.dataTransfer?.files ?? [])
    }

    element.addEventListener('dragover', onDragOver)
    element.addEventListener('dragleave', onDragLeave)
    element.addEventListener('drop', onDrop)
  }

  /** Insere referências no terminal exato do drop; nunca envia Enter. */
  handleFileDrop(id: string, files: Iterable<File>): void {
    const session = this.sessions.get(id)
    if (!session || session.disposed) return

    const reference = buildDroppedFileReference(
      files,
      (file) => window.felixo?.getFilePath?.(file) ?? '',
    )
    if (!reference.text) return

    this.typeIntoSession(session, reference.text)
    session.terminal.focus()
  }

  /**
   * Makes a plain Ctrl+V / Cmd+V carry images, not just text.
   *
   * xterm only knows how to paste text, and the agent CLIs that do accept an
   * image each use a different shortcut — and, on Linux, depend on `xclip` or
   * `wl-paste` being installed, which they usually are not. Intercepting the
   * paste here, before xterm sees it, saves the image alongside the other
   * attachments and types its path into the prompt. One shortcut, same result
   * on every OS and for every agent.
   */
  private bindImagePaste(session: Session): void {
    const element = session.terminal.element

    if (!element || session.imagePasteBound) {
      return
    }

    session.imagePasteBound = true

    // Capture phase: xterm listens on its inner textarea, so this runs first
    // and can stop an image from being pasted as the empty string it looks
    // like to a text-only handler. The listener needs no teardown — it lives on
    // the element, which `terminal.dispose()` destroys along with the session.
    element.addEventListener(
      'paste',
      (event) => {
        void this.handleImagePaste(session, event as ClipboardEvent)
      },
      { capture: true },
    )
  }

  /**
   * Decide, por gesto, quem fica com o mouse: a CLI (clique) ou a seleção
   * (arrasto) — ver `terminal-mouse-selection.ts` para o porquê de a decisão
   * não poder sair no `mousedown`.
   *
   * A fase de captura garante que este listener roda antes dos `mousedown` do
   * próprio xterm.js, que estão presos ao mesmo elemento em fase de bolha
   * (`CoreBrowserTerminal` os registra em `element`, um para o relatório de
   * mouse e outro para a seleção). Retemos o evento, esperamos o gesto se
   * revelar e então redisparamos o que for o caso. Os sintéticos passam de novo
   * por aqui, mas `shouldDeferMouseDown` os deixa seguir (`isTrusted: false`).
   */
  private bindMouseSelection(session: Session): void {
    const element = session.terminal.element

    if (!element || session.mouseSelectionBound) {
      return
    }

    session.mouseSelectionBound = true
    const isMac = isMacPlatform(window.navigator)

    // O `mousedown` retido, à espera de virar clique ou arrasto. Enquanto ele
    // existe, o gesto está indefinido e ninguém — nem a CLI, nem a seleção —
    // recebeu nada.
    let pendingDown: MouseEvent | null = null

    const forget = (): void => {
      pendingDown = null
      document.removeEventListener('mousemove', onDocumentMove, true)
      document.removeEventListener('mouseup', onDocumentUp, true)
      window.removeEventListener('blur', onWindowBlur)
    }

    // Andou o bastante: é arrasto. A seleção nasce ancorada em onde o gesto
    // COMEÇOU, não em onde o ponteiro está agora — senão os primeiros pixels
    // do arrasto ficariam de fora da seleção.
    function onDocumentMove(event: Event): void {
      const origin = pendingDown
      if (!origin || !exceedsDragThreshold(origin, event as MouseEvent)) {
        return
      }

      forget()
      redispatch(origin, 'mousedown', buildForcedSelectionEventInit(origin, isMac))
      // Se o ponteiro já saiu do elemento, o movimento original tem `document`
      // como alvo e o xterm.js não o verá. Reenviar o primeiro movimento ao
      // alvo do `mousedown` mantém a seleção ancorada e inicia o trecho que
      // ultrapassou o limiar.
      redispatch(origin, 'mousemove', buildReplayEventInit(event as MouseEvent))
    }

    // Soltou sem sair do lugar: é clique, e a CLI precisa dele inteiro. O par
    // é devolvido na ordem original, sem modificador nenhum; o `mouseup` real
    // é engolido no lugar dele para o processo não receber duas soltas.
    function onDocumentUp(event: Event): void {
      const origin = pendingDown
      const up = event as MouseEvent
      if (!origin || up.button !== 0) {
        return
      }

      forget()
      event.preventDefault()
      event.stopImmediatePropagation()
      redispatch(origin, 'mousedown', buildReplayEventInit(origin))
      redispatch(origin, 'mouseup', buildReplayEventInit(up))
    }

    // A janela perdeu o foco no meio do gesto: não haverá `mouseup` para
    // fechá-lo. Descartar é melhor que deixar um gesto pendente que
    // transformaria o próximo movimento do ponteiro numa seleção fantasma.
    function onWindowBlur(): void {
      forget()
    }

    function redispatch(origin: MouseEvent, type: string, init: MouseEventInit): void {
      const target = origin.target
      if (target instanceof EventTarget) {
        target.dispatchEvent(new MouseEvent(type, init))
      }
    }

    element.addEventListener(
      'mousedown',
      (event) => {
        const mouseEvent = event as MouseEvent

        const mouseTrackingActive = session.terminal.modes.mouseTrackingMode !== 'none'

        if (
          !shouldDeferMouseDown(mouseEvent, mouseTrackingActive) ||
          xtermAlreadyForcesSelection(mouseEvent, isMac)
        ) {
          return
        }

        event.preventDefault()
        event.stopImmediatePropagation()

        pendingDown = mouseEvent
        // No documento, e em captura: o gesto continua valendo se o ponteiro
        // sair do terminal, e a decisão precisa acontecer antes de qualquer
        // outro interessado no mesmo evento.
        document.addEventListener('mousemove', onDocumentMove, true)
        document.addEventListener('mouseup', onDocumentUp, true)
        window.addEventListener('blur', onWindowBlur)
      },
      { capture: true },
    )

    session.offMouseSelection = forget
  }

  private async handleImagePaste(
    session: Session,
    event: ClipboardEvent,
  ): Promise<void> {
    const clipboardData = event.clipboardData
    const image = findClipboardImage(clipboardData)

    if (!image && hasClipboardText(clipboardData)) {
      // Ordinary text: xterm's own paste still owns this.
      return
    }

    // Claim the event before the first `await`. Afterwards the paste has
    // already happened and preventing it is too late.
    event.preventDefault()
    event.stopPropagation()

    if (!image) {
      // Nem imagem no evento, nem texto. Alguns ambientes — a ferramenta de
      // captura do Linux Mint entre eles — publicam o bitmap num formato que o
      // renderer nunca enxerga, mas a leitura nativa acha.
      await this.pasteClipboardImageFromOs(session)
      return
    }

    if (!this.claimImagePaste(session)) {
      return
    }

    const saved = await window.felixo?.files?.saveAttachment({
      name: image.name,
      type: image.type,
      data: await image.arrayBuffer(),
    })

    if (saved?.ok && saved.filePath) {
      this.typeIntoSession(session, formatImagePathForPrompt(saved.filePath))
    }
  }

  /**
   * Lê a imagem da área de transferência do sistema e digita o caminho dela.
   *
   * É o caminho que atende o Ctrl+V: com uma imagem na área de transferência não
   * há nada para inserir como texto, então o comando de colar do Chromium não
   * faz nada e **nenhum evento `paste` chega à página** — o evento só nasce
   * quando há texto. Sem isso, Ctrl+V simplesmente não colava imagem, e só o
   * Ctrl+Shift+V (que não tem acelerador de menu e segue o caminho nativo do
   * navegador) funcionava.
   */
  private async pasteClipboardImageFromOs(session: Session): Promise<void> {
    if (!this.claimImagePaste(session)) {
      return
    }

    const saved = await window.felixo?.files?.saveClipboardImage()

    if (saved?.ok && saved.filePath) {
      this.typeIntoSession(session, formatImagePathForPrompt(saved.filePath))
    }
  }

  /**
   * Reserva esta colagem, para os dois caminhos (evento e tecla) não atenderem
   * o mesmo Ctrl+V. Devolve `false` quando outro caminho acabou de atender.
   */
  private claimImagePaste(session: Session): boolean {
    const now = Date.now()

    if (now - session.lastImagePasteAt < IMAGE_PASTE_DEDUPE_MS) {
      return false
    }

    session.lastImagePasteAt = now
    return true
  }

  /** Writes text into the PTY exactly as if the person had typed it. */
  private typeIntoSession(session: Session, text: string): void {
    if (!text || session.disposed) {
      return
    }

    const delivery = session.sendChain.then(() => {
      if (session.disposed) return
      void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: text })
      session.inputTouched = true
      this.trackTypedInput(session, text)
    })
    session.sendChain = delivery.catch(() => {})
  }

  /** Re-fits the terminal to its current container and pushes a PTY resize. */
  fit(id: string): void
  fit(session: Session): void
  fit(target: string | Session): void {
    const session = typeof target === 'string' ? this.sessions.get(target) : target
    if (!session || !session.terminal.element) {
      return
    }

    try {
      session.fitAddon.fit()
      void window.felixo?.pty?.resize({
        sessionId: session.ptySessionId,
        cols: session.terminal.cols,
        rows: session.terminal.rows,
      })
    } catch {
      // Container may be momentarily zero-sized; ignore.
    }
  }

  focus(id: string): void {
    this.sessions.get(id)?.terminal.focus()
  }

  /** Types text into the session's PTY as if the user had typed it. */
  async sendText(
    id: string,
    text: string,
    options: { kind?: ContextFileKind } = {},
  ): Promise<void> {
    const session = this.sessions.get(id)
    if (!session || session.disposed || !text) {
      return
    }

    const delivery = session.sendChain.then(async () => {
      if (session.disposed) return

      const delivered = await this.deliverContextText(
        session,
        text,
        options.kind ?? 'catalog-prompt',
      )
      if (session.disposed) return

      void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: delivered })
      session.inputTouched = true
      const prompt = cleanPrompt(delivered)
      if (prompt) {
        this.update(session, { lastPrompt: prompt })
      }
    })

    // Keep the chain alive after one failed delivery. A transient IPC failure
    // must not permanently disable later prompts for this session.
    session.sendChain = delivery.catch(() => {})
    await delivery.catch(() => {})
  }

  /**
   * Reconstruct the line being typed so we can capture it on submit. xterm emits
   * one `onData` per keystroke (or a chunk for paste): printable text appends,
   * backspace (\x7f / \b) deletes, and CR (\r) submits — at which point we store
   * the line as the last prompt and reset. Control sequences (arrows, etc.) are
   * best-effort ignored; this is a convenience label, not a perfect transcript.
   */
  private trackTypedInput(session: Session, data: string): void {
    for (const char of data) {
      if (char === '\r') {
        const prompt = cleanPrompt(session.inputBuffer)
        session.inputBuffer = ''
        if (prompt) {
          this.update(session, { lastPrompt: prompt })
        }
      } else if (char === '\x7f' || char === '\b') {
        session.inputBuffer = session.inputBuffer.slice(0, -1)
      } else if (char === '\n') {
        // Shift+Enter newline inside the prompt — keep it as a line break.
        session.inputBuffer += '\n'
      } else if (char >= ' ') {
        // Printable character (skips other control/escape bytes).
        session.inputBuffer += char
      }
    }
  }

  /**
   * Destaca o texto digitado na linha onde o cursor está.
   *
   * Devolve `false` quando não há nada a destacar, para quem chamou deixar a
   * tecla seguir para o PTY.
   */
  private selectTypedInput(session: Session): boolean {
    const { terminal } = session
    const buffer = terminal.buffer.active
    const cursorRow = buffer.baseY + buffer.cursorY

    // Quebras visuais e lógicas deixam o cursor numa linha sem marcador. A
    // janela cobre a caixa de edição inteira sem varrer o histórico: no máximo
    // a altura da janela, que é o tamanho que o composer pode ter.
    const searchRows = Math.min(MAX_MULTILINE_INPUT_ROWS, terminal.rows)
    const firstRow = Math.max(0, cursorRow - (searchRows - 1))
    const lines: string[] = []
    // `isWrapped` separa a quebra que o terminal fez da que a pessoa digitou:
    // só a segunda vira `\n` no texto copiado.
    const wrapped: boolean[] = []
    for (let row = firstRow; row <= cursorRow; row += 1) {
      const line = buffer.getLine(row)
      lines.push(line?.translateToString(false) ?? '')
      wrapped.push(line?.isWrapped === true)
    }

    const range = findMultiLineTypedInputRange(
      lines,
      lines.length - 1,
      buffer.cursorX,
      wrapped,
    )
    if (!range) {
      return false
    }

    const startRow = firstRow + range.startLine
    const selectionLength =
      (cursorRow - startRow) * terminal.cols + buffer.cursorX - range.startColumn
    terminal.select(range.startColumn, startRow, selectionLength)
    session.selectedInput = {
      selection: terminal.getSelection(),
      text: range.text,
      // `cursorRow - startRow` linhas visuais entre o começo da seleção e o
      // cursor, mais a própria linha do cursor.
      visualLineCount: cursorRow - startRow + 1,
    }

    return Boolean(session.selectedInput)
  }

  /** Se a seleção ativa ainda é a que o Ctrl+A fez na linha de entrada. */
  private hasTypedInputSelection(session: Session): boolean {
    const selectedInput = session.selectedInput
    if (!selectedInput) {
      return false
    }

    return session.terminal.hasSelection() && session.terminal.getSelection() === selectedInput.selection
  }

  /**
   * Copia a seleção pelo teclado e a desfaz em seguida.
   *
   * Diferente de `copy`, não cai para o viewport: quem chega aqui só chega com
   * seleção, e limpar depois evita que o próximo Ctrl+C copie de novo sem querer
   * quando a intenção já era interromper o agente.
   */
  private async copySelection(session: Session): Promise<void> {
    const selection = session.terminal.getSelection()
    const text =
      session.selectedInput?.selection === selection ? session.selectedInput.text : selection
    if (!text) {
      return
    }
    await navigator.clipboard?.writeText(text)
    session.terminal.clearSelection()
    session.selectedInput = undefined
  }

  /**
   * Copies the current mouse selection to the clipboard. Falls back to the
   * visible viewport text when nothing is selected, so the button is never a
   * no-op. Returns the copied text (empty string if there was nothing).
   */
  async copy(id: string): Promise<string> {
    const session = this.sessions.get(id)
    if (!session) {
      return ''
    }

    const selection = session.terminal.getSelection()
    const text = selection || readViewport(session.terminal)
    if (text) {
      await navigator.clipboard?.writeText(text)
    }
    return text
  }

  /** Returns the complete text available in the active xterm scrollback. */
  getTranscript(id: string): TerminalTranscript {
    const session = this.sessions.get(id)
    return { text: session ? readBuffer(session.terminal) : '' }
  }

  /**
   * Histórico de comandos do shell, mesmo com um app de tela cheia
   * (nano/vim/less/htop…) ocupando a tela agora — ver `readShellHistory`.
   */
  getShellHistory(id: string): TerminalTranscript {
    const session = this.sessions.get(id)
    return { text: session ? readShellHistory(session.terminal) : '' }
  }

  getSnapshot(id: string): SessionSnapshot | undefined {
    return this.sessions.get(id)?.snapshot
  }

  /** Metadata for the details surface; keeps PTY lifecycle out of React. */
  getSessionMetadata(id: string): SessionMetadata | undefined {
    const session = this.sessions.get(id)
    if (!session) return undefined

    return {
      elementId: session.id,
      ptySessionId: session.ptySessionId,
      activity: session.snapshot.activity,
      startedAt: session.startedAt,
      command: session.command,
      args: [...session.args],
      agentSessionId: session.agentSession?.sessionId,
      agentSession: session.agentSession,
    }
  }

  getSnapshots(): Record<string, SessionSnapshot> {
    return this.snapshots
  }

  subscribeAll(listener: () => void): () => void {
    this.allListeners.add(listener)
    return () => this.allListeners.delete(listener)
  }

  subscribe(id: string, listener: SessionListener): () => void {
    let listeners = this.listeners.get(id)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(id, listeners)
    }

    listeners.add(listener)
    const snapshot = this.getSnapshot(id)
    if (snapshot) {
      listener(snapshot)
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && !this.sessions.has(id)) {
        this.listeners.delete(id)
      }
    }
  }

  /** Permanently ends a session and frees its resources. */
  remove(id: string): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }

    session.disposed = true
    this.clearIdleTimer(session)
    this.clearInitialTextTimer(session)
    this.clearSubmitRetryTimer(session)
    this.clearContextRetryTimer(session)
    session.linkMenuCleanup?.()
    session.offLinkContextMenu?.()
    session.offMouseSelection?.()
    session.offData()
    session.offExit()
    session.offSession()
    void window.felixo?.pty?.kill({ sessionId: session.ptySessionId, force: true })
    void window.felixo?.contextFiles?.release({ sessionId: session.ptySessionId })
    session.terminal.dispose()
    this.sessions.delete(id)
    this.listeners.delete(id)
    if (id in this.snapshots) {
      const remainingSnapshots = { ...this.snapshots }
      delete remainingSnapshots[id]
      this.snapshots = remainingSnapshots
      this.notifyAll()
    }
  }

  /** Permanently ends every terminal session owned by the canvas. */
  clear(): void {
    for (const id of Array.from(this.sessions.keys())) {
      this.remove(id)
    }
  }

  private onOutput(session: Session): void {
    // Agent CLIs animate a spinner/timer while idle, emitting bytes every frame.
    // Treat output as real "work" only when the buffer changes beyond that
    // in-place animation; otherwise a waiting agent would look busy forever.
    const signature = computeSignature(session.terminal)
    if (signature !== session.lastSignature) {
      session.lastSignature = signature
      session.lastMeaningfulAt = Date.now()
      session.paintedOutput = true
      this.markWorking(session)
      // A tela acabou de mudar: a próxima checagem não precisa esperar o
      // intervalo de polling. Para Codex e Claude, a linha de entrada é a
      // confirmação de prontidão; se ela ainda não existir, scheduleInitialText
      // volta ao polling curto sem escrever no lugar errado.
      if (session.initialText && !session.initialTextSent) {
        this.scheduleInitialText(session, 0)
      }
    } else {
      // Only the animation moved — make sure an idle check is scheduled so we
      // eventually settle even though bytes keep arriving.
      this.scheduleIdleCheck(session)
    }
  }

  private finishExit(
    session: Session,
    event: { exitCode: number; signal?: number },
  ): void {
    this.clearInitialTextTimer(session)
    this.clearContextRetryTimer(session)
    // Once the process is gone, keeping its private bootstrap/handoff files
    // serves no live session. The main process also removes stale leftovers at
    // startup for crashes and renderer resets that bypass this callback.
    void window.felixo?.contextFiles?.release({ sessionId: session.ptySessionId })
    const silentEarlyExit =
      Boolean(session.command) &&
      !session.receivedOutput &&
      Date.now() - session.startedAt < SILENT_EARLY_EXIT_MS
    const message = silentEarlyExit
      ? `O comando "${session.command}" encerrou sem produzir saída. Verifique a instalação e a autenticação da CLI.`
      : undefined

    this.update(session, {
      activity: silentEarlyExit ? 'error' : 'exited',
      exitCode: event.exitCode,
      message,
    })
  }

  private markWorking(session: Session): void {
    // Only emit on the transition into 'working' to avoid a re-render per byte;
    // the preview is refreshed once the session goes idle.
    if (session.snapshot.activity !== 'working') {
      this.update(session, { activity: 'working' })
    }
    this.scheduleIdleCheck(session)
  }

  /**
   * (Re)arms the idle check. The session only settles to `idle` once the buffer
   * has gone IDLE_AFTER_MS without a *meaningful* change — animation frames
   * (spinner/timer) bump no clock here, so a waiting agent reaches idle even
   * while it keeps repainting its prompt.
   */
  private scheduleIdleCheck(session: Session): void {
    if (session.idleTimer || session.disposed) {
      return
    }
    session.idleTimer = setTimeout(() => {
      session.idleTimer = null
      if (session.disposed || session.snapshot.activity !== 'working') {
        return
      }
      const quietFor = Date.now() - session.lastMeaningfulAt
      if (quietFor >= IDLE_AFTER_MS) {
        const viewport = readViewport(session.terminal)
        if (isBusyScreen(viewport)) {
          // The CLI is still showing its "working" banner — only its elapsed-time
          // counter is ticking, which the signature check normalizes away. Stay
          // 'working' instead of settling to idle/green while it's still busy.
          this.scheduleIdleCheck(session)
          return
        }
        // Refresh the preview from the now-settled buffer. A settled prompt
        // that looks like a decision/approval screen gets its own state so
        // it's visually distinct from "finished a turn, ready for more".
        const activity = looksLikeApprovalPrompt(viewport) ? 'waiting_approval' : 'idle'
        this.update(session, { activity })
      } else {
        this.scheduleIdleCheck(session)
      }
    }, IDLE_AFTER_MS)
  }

  private clearIdleTimer(session: Session): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
  }

  private scheduleInitialText(
    session: Session,
    delayMs: number,
    waitStartedAt = Date.now(),
  ): void {
    if (!session.initialText || session.initialTextSent || session.disposed) {
      return
    }

    this.clearInitialTextTimer(session)
    session.initialTextTimer = setTimeout(() => {
      session.initialTextTimer = null
      if (
        session.disposed ||
        session.initialTextSent ||
        session.snapshot.activity === 'exited' ||
        session.snapshot.activity === 'error'
      ) {
        return
      }

      const elapsed = Date.now() - waitStartedAt
      const quietFor = Date.now() - session.lastMeaningfulAt
      // A pergunta que importa é "a linha de entrada da CLI já existe?", e não
      // "faz quanto tempo que a tela não muda": uma CLI inicializando, um aviso
      // do modo yolo e um REPL esperando texto ficam igualmente quietos, e só um
      // dos três lê o que escrevemos. Para a CLI que não sabemos ler, resta o
      // silêncio como sinal — com teto bem mais curto, porque é um palpite.
      const inputLine = readInputLineState(session.command, readViewport(session.terminal))
      const processLooksReady =
        session.paintedOutput &&
        (inputLine ? inputLine.ready : quietFor >= INITIAL_TEXT_READY_QUIET_MS)
      const fallbackReady =
        elapsed >= (inputLine ? INITIAL_TEXT_INPUT_WAIT_MS : INITIAL_TEXT_MAX_WAIT_MS)

      // A PTY sobe muito antes de a CLI chegar no prompt: até lá, cada volta só
      // olha a tela de novo. O fallback mantém utilizável a CLI que não desenha
      // nada reconhecível, e é deliberadamente limitado.
      if (!processLooksReady && !fallbackReady) {
        this.scheduleInitialText(
          session,
          Math.min(250, INITIAL_TEXT_READY_QUIET_MS),
          waitStartedAt,
        )
        return
      }

      session.initialTextSent = true
      const submission = splitTerminalSubmission(session.initialText ?? '')
      void window.felixo?.pty?.write({
        sessionId: session.ptySessionId,
        data: submission.text,
      })

      // Sem Enter, o prompt é contexto: fica escrito na entrada da CLI e quem
      // decide executar é o usuário, que ainda vai digitar a tarefa depois
      // dele. Não há envio a confirmar, mas há entrega: o texto precisa estar
      // na linha de entrada, e é isso que a reconferência abaixo verifica.
      const submit = submission.submit
      if (!submit) {
        this.confirmContextDelivery(session, submission.text)
        return
      }

      // Codex occasionally treats an immediate CR appended to a programmatic
      // paste as a line break. Delivering the key separately mirrors a real
      // user submission after the TUI has consumed the text.
      setTimeout(() => {
        if (!session.disposed) {
          void window.felixo?.pty?.write({
            sessionId: session.ptySessionId,
            data: submit,
          })
          this.confirmSubmission(session, submission.text, submit)
        }
      }, INITIAL_TEXT_SUBMIT_DELAY_MS)
    }, delayMs)
  }

  /**
   * Converts injected context into a short PTY reference after the process is
   * known to exist. Slash commands such as `/resume` stay inline because they
   * are parsed by the agent CLI itself, not read as context.
   */
  private async prepareInitialText(session: Session): Promise<void> {
    const text = session.rawInitialText
    if (!text) {
      session.initialText = undefined
      return
    }

    session.initialText = await this.deliverContextText(
      session,
      text,
      isAgentCliCommand(text) ? undefined : contextFileKindForPrompt(text),
    )
  }

  /** Writes one generated, read-only context file or returns an explicit inline fallback. */
  private async deliverContextText(
    session: Session,
    text: string,
    kind?: ContextFileKind,
  ): Promise<string> {
    if (isAgentCliCommand(text) || !kind) {
      return text
    }

    const split = splitTerminalSubmission(text)
    const parts = kind === 'initial-context'
      ? splitInitialContext(split.text)
      : [{ kind, content: split.text }]
    const deliveredFiles: Array<{ path: string; kind: ContextFileKind }> = []

    for (const part of parts) {
      let result: { ok?: boolean; path?: string } | undefined
      try {
        result = await window.felixo?.contextFiles?.write({
          sessionId: session.ptySessionId,
          kind: part.kind,
          source: session.sourceLabel || session.command || session.id,
          content: part.content,
        })
      } catch {
        // A renderer/main-process boundary can fail while the PTY is still
        // usable (startup race, old packaged preload, or a permission error).
        // Treat that exactly like an IPC error response and preserve the old
        // inline delivery with a visible warning.
        result = undefined
      }

      if (!result?.ok || !result.path) {
        return this.contextDeliveryFallback(session, text, kind)
      }
      deliveredFiles.push({ path: result.path, kind: part.kind })
    }

    this.update(session, { contextWarning: undefined })
    return buildContextFileReferences(deliveredFiles, Boolean(split.submit))
  }

  private contextDeliveryFallback(
    session: Session,
    text: string,
    kind?: ContextFileKind,
  ): string {
    const warning =
      'Arquivo temporário de contexto indisponível; o terminal usou o fallback inline. Para handoffs muito grandes, o limite antigo preserva o começo e o fim e marca o trecho omitido.'
    this.update(session, { contextWarning: warning })
    const split = splitTerminalSubmission(text)
    if (!split.submit || kind !== 'handoff') {
      return buildInlineFallback(text)
    }

    const prepared = prepareHandoffTranscript(split.text)
    return buildInlineFallback(toSubmittedTerminalText(prepared.text))
  }

  /**
   * Confere se o prompt inicial foi realmente submetido e reenvia o Enter
   * enquanto o texto continuar parado na linha de entrada.
   *
   * O Enter é entregue numa escrita separada do texto (ver acima), e essa
   * segunda escrita pode chegar enquanto o TUI ainda redesenha — aí a tecla se
   * perde e o `/resume` fica escrito, esperando. O intervalo fixo não tem como
   * saber disso; o conteúdo da tela tem.
   *
   * Reenviar Enter é seguro justamente porque só acontece quando o texto ainda
   * está pendente: se a CLI já submeteu, a linha de entrada está limpa e nada
   * é enviado.
   */
  private confirmSubmission(
    session: Session,
    text: string,
    submit: string,
    attempt = 1,
  ): void {
    if (attempt > SUBMIT_RETRY_LIMIT) {
      return
    }

    session.submitRetryTimer = setTimeout(() => {
      session.submitRetryTimer = null
      if (session.disposed || !isSubmissionPending(readViewport(session.terminal), text)) {
        return
      }

      void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: submit })
      this.confirmSubmission(session, text, submit, attempt + 1)
    }, SUBMIT_RETRY_DELAY_MS)
  }

  /**
   * Confere se o texto de contexto realmente chegou na linha de entrada e o
   * reescreve enquanto ela continuar vazia.
   *
   * Texto sem Enter não tem submissão para confirmar, e era justamente aí que
   * ele se perdia sem deixar rastro: escrito num instante em que a CLI ainda não
   * estava lendo o teclado, ou dentro de uma tela de aceite. Agora a entrega tem
   * a mesma reconferência que a submissão já tinha — pelo conteúdo da tela, não
   * pelo relógio.
   *
   * Reescrever é seguro porque só acontece com a entrada vazia: se o contexto
   * está lá, se o usuário digitou (`inputTouched`) ou se a CLI ainda não mostrou
   * a entrada, nada é escrito. `deadline` fecha a janela para o timer não
   * sobreviver ao boot da CLI.
   */
  private confirmContextDelivery(
    session: Session,
    text: string,
    rewrites = 0,
    deadline = Date.now() + CONTEXT_DELIVERY_WINDOW_MS,
  ): void {
    if (rewrites >= CONTEXT_REWRITE_LIMIT || Date.now() >= deadline) {
      return
    }

    this.clearContextRetryTimer(session)
    session.contextRetryTimer = setTimeout(() => {
      session.contextRetryTimer = null
      if (
        session.disposed ||
        session.inputTouched ||
        session.snapshot.activity === 'exited' ||
        session.snapshot.activity === 'error'
      ) {
        return
      }

      const inputLine = readInputLineState(session.command, readViewport(session.terminal))
      if (!inputLine) {
        // CLI cuja entrada não sabemos ler: não há como confirmar a entrega, e
        // reescrever no escuro seria pior do que não reescrever.
        return
      }

      if (!inputLine.visible) {
        // A entrada ainda não apareceu — a CLI pode estar num aviso. Não há o
        // que reescrever ainda; a próxima volta pega a entrada quando existir.
        this.confirmContextDelivery(session, text, rewrites, deadline)
        return
      }

      if (!inputLine.empty) {
        // O contexto está na entrada (ou alguém assumiu a linha): entregue.
        return
      }

      void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: text })
      this.confirmContextDelivery(session, text, rewrites + 1, deadline)
    }, CONTEXT_CONFIRM_DELAY_MS)
  }

  private clearContextRetryTimer(session: Session): void {
    if (session.contextRetryTimer) {
      clearTimeout(session.contextRetryTimer)
      session.contextRetryTimer = null
    }
  }

  private clearSubmitRetryTimer(session: Session): void {
    if (session.submitRetryTimer) {
      clearTimeout(session.submitRetryTimer)
      session.submitRetryTimer = null
    }
  }

  private clearInitialTextTimer(session: Session): void {
    if (session.initialTextTimer) {
      clearTimeout(session.initialTextTimer)
      session.initialTextTimer = null
    }
  }

  private handleCodexTrustPrompt(session: Session, data: string): void {
    if (session.command !== 'codex' || session.codexTrustHandled || !data) {
      return
    }

    session.codexTrustBuffer = (
      session.codexTrustBuffer + data
    ).slice(-ACCEPT_SCREEN_BUFFER_LIMIT)

    if (!isCodexTrustPrompt(session.codexTrustBuffer)) {
      return
    }

    session.codexTrustHandled = true
    this.clearInitialTextTimer(session)

    const canAutoAccept = session.args.includes(
      '--dangerously-bypass-approvals-and-sandbox',
    )
    if (!canAutoAccept) {
      return
    }

    setTimeout(() => {
      if (!session.disposed) {
        void window.felixo?.pty?.write({
          sessionId: session.ptySessionId,
          data: '\r',
        })
      }
    }, SCREEN_ACCEPT_DELAY_MS)

    this.scheduleInitialText(session, POST_ACCEPT_INITIAL_TEXT_DELAY_MS)
  }

  /**
   * O Claude em modo yolo (`--dangerously-skip-permissions`) abre todo processo
   * novo no aviso do modo, antes do REPL: um terminal yolo salvo no canvas
   * parece ter "voltado ao normal" depois de reiniciar o app. Aceita o aviso
   * quando ele aparece de fato no stream de saída, e não num delay adivinhado.
   *
   * A seleção nesse aviso começa em "1. No, exit", então aceitar é descer uma
   * opção e confirmar. É por isso que a tecla depende de reconhecer a tela certa:
   * as mesmas teclas na tela de confiança na pasta (onde a seleção já começa em
   * "Yes, proceed") escolheriam sair e matariam a CLI.
   */
  private handleClaudeBypassWarning(session: Session, data: string): void {
    if (
      session.command !== 'claude' ||
      !session.args.includes('--dangerously-skip-permissions') ||
      session.claudeBypassHandled ||
      !data
    ) {
      return
    }

    session.claudeBypassBuffer = (
      session.claudeBypassBuffer + data
    ).slice(-ACCEPT_SCREEN_BUFFER_LIMIT)

    if (!isClaudeBypassPermissionsWarning(session.claudeBypassBuffer)) {
      return
    }

    session.claudeBypassHandled = true
    this.clearInitialTextTimer(session)
    this.acceptClaudeBypassWarning(session)
    this.scheduleInitialText(session, POST_ACCEPT_INITIAL_TEXT_DELAY_MS)
  }

  /**
   * Responde o aviso do modo yolo: desce para "2. Yes, I accept" e confirma.
   *
   * As duas teclas vão em escritas separadas porque juntas não funcionam — a CLI
   * ignora a confirmação e o aviso fica na tela. E o resultado é reconferido pela
   * tela, não pelo relógio: enquanto o aviso continuar visível, a tecla se
   * perdeu no redesenho e vale reenviar.
   */
  private acceptClaudeBypassWarning(session: Session, attempt = 1): void {
    if (attempt > SCREEN_ACCEPT_ATTEMPTS) {
      return
    }

    setTimeout(() => {
      if (session.disposed) {
        return
      }
      // Na primeira tentativa o aviso acabou de ser reconhecido no stream, e o
      // xterm pode ainda não ter desenhado; a partir da segunda, a tela já é
      // fonte confiável de "o aceite passou ou não".
      if (attempt > 1 && !isClaudeBypassPermissionsWarning(readViewport(session.terminal))) {
        return
      }

      void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: '\x1b[B' })
      setTimeout(() => {
        if (session.disposed) {
          return
        }
        void window.felixo?.pty?.write({ sessionId: session.ptySessionId, data: '\r' })
        this.acceptClaudeBypassWarning(session, attempt + 1)
      }, KEY_SEQUENCE_DELAY_MS)
    }, SCREEN_ACCEPT_DELAY_MS)
  }

  private update(session: Session, patch: Partial<SessionSnapshot>): void {
    session.snapshot = {
      ...session.snapshot,
      ...patch,
      previewLines: computePreview(session.terminal),
    }
    this.snapshots = { ...this.snapshots, [session.id]: session.snapshot }
    for (const listener of session.listeners) {
      listener(session.snapshot)
    }
    this.notifyAll()
  }

  private notifyAll(): void {
    for (const listener of this.allListeners) {
      listener()
    }
  }
}

/** Intervalo curto entre o spawn e a primeira checagem de prontidão. */
function getInitialTextDelay(): number {
  // A fixed Codex-specific wait made the standing context visibly lag behind
  // the ready prompt. Readiness is already guarded by the screen recognizer;
  // trust screens are handled separately, so every CLI can use the same short
  // scheduling interval and release the first write as soon as its input line
  // is recognized.
  return DEFAULT_INITIAL_TEXT_DELAY_MS
}
