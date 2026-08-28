import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TerminalSessionStore } from './terminal-session-store'

/**
 * Entrega do texto inicial, exercitada contra a saída real de uma CLI.
 *
 * O arquivo do store nunca teve suíte porque depende de PTY — mas o que decide a
 * entrega não é o PTY, é o que está desenhado na tela. Aqui a ponte é falsa e a
 * tela é de verdade: o xterm do próprio store recebe os mesmos bytes que o
 * `claude --dangerously-skip-permissions` emite, com as mesmas etapas de boot,
 * e os testes olham o que o store escreve de volta.
 *
 * Os trechos abaixo foram capturados da CLI 2.1.227 num PTY real.
 */

/** Preâmbulo do boot: só sequências de escape, nada desenhado na tela ainda. */
const BOOT_ESCAPES = [
  '\x1b7\x1b[r\x1b8\x1b[?25h',
  '\x1b[?25l',
  '\x1b[?2004h\x1b[?1004h\x1b[?2031h',
  '\x1b[>0q\x1b[c',
  '\x1b[?1049h\x1b[2J\x1b[H\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h',
  '\x1b]0;Claude Code\x07',
].join('')

/** Aviso do modo yolo, que a CLI desenha antes do REPL. */
const BYPASS_WARNING = [
  '─'.repeat(60),
  '  WARNING: Claude Code running in Bypass Permissions mode',
  '  In Bypass Permissions mode, Claude Code will not ask for your approval before',
  '  running potentially dangerous commands.',
  '  https://code.claude.com/docs/en/security',
  '  ❯ 1. No, exit',
  '    2. Yes, I accept',
  '  Enter to confirm · Esc to cancel',
].join('\r\n')

/** REPL pronto, com a sugestão que a CLI desenha na entrada vazia. */
const READY_PROMPT = [
  '  Claude Code v2.1.227',
  '  Opus 5 with high effort · Claude Pro',
  '─'.repeat(60),
  '❯ Try "how does ChatWorkspace.tsx work?"',
  '─'.repeat(60),
  '⏵⏵ bypass permissions on (shift+tab to cycle)',
].join('\r\n')

/** Codex TUI pronto: o compositor de pé é o único sinal necessário. */
const CODEX_READY_PROMPT = ['OpenAI Codex', 'gpt-5.6 · medium', '›'].join('\r\n')

/**
 * O que o Codex realmente desenha quando fica pronto: o compositor vazio traz
 * uma sugestão da própria CLI, nunca uma linha em branco.
 */
const CODEX_READY_PROMPT_WITH_HINT = [
  'OpenAI Codex (v0.147.0)',
  '',
  '› Summarize recent commits',
  'gpt-5.6 · xhigh',
].join('\r\n')

const CONTEXT = 'Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE\n\nContexto do canvas: ...'
const DELIVERED_QUALITY_CONTEXT = 'Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE'

type Harness = {
  store: TerminalSessionStore
  /** Tudo que o store escreveu no PTY, na ordem. */
  writes: string[]
  /** Corpos que seriam gravados pelo processo principal nos arquivos temporários. */
  contextBodies: string[]
  /** Entrega bytes da CLI para o terminal do store, como a ponte faria. */
  feed: (data: string) => void
  feedSession: (reference: object) => void
  spawnArgs: string[]
  /**
   * Resolve a promise do `pty:spawn`. Só existe quando a bancada foi criada com
   * `deferSpawn`; nos demais casos o spawn já resolveu sozinho.
   */
  resolveSpawn: () => void
}

const SESSION_ID = 'terminal-1'
const PTY_SESSION_ID = `canvas:${SESSION_ID}`

function createHarness(
  initialText = CONTEXT,
  command = 'claude',
  contextFilesAvailable = true,
  deferSpawn = false,
): Harness {
  const writes: string[] = []
  const contextBodies: string[] = []
  const dataListeners = new Set<(event: { sessionId: string; data: string }) => void>()
  const sessionListeners = new Set<(event: object) => void>()
  const spawnArgs: string[] = []

  // Com `deferSpawn`, a resposta do `pty:spawn` fica pendurada até o teste
  // soltá-la, reproduzindo a ordem que o ConPTY impõe no Windows: a CLI pinta
  // a primeira tela antes de a promise do IPC voltar ao renderer.
  let releaseSpawn = () => {}
  const spawnResult = { ok: true, reused: false }
  const spawnGate = deferSpawn
    ? new Promise<void>((resolve) => {
        releaseSpawn = resolve
      })
    : Promise.resolve()

  ;(globalThis as { window?: unknown }).window = {
    felixo: {
      pty: {
        onData: (listener: (event: { sessionId: string; data: string }) => void) => {
          dataListeners.add(listener)
          return () => dataListeners.delete(listener)
        },
        onExit: () => () => {},
        onSession: (listener: (event: object) => void) => {
          sessionListeners.add(listener)
          return () => sessionListeners.delete(listener)
        },
        spawn: async ({ args }: { args?: string[] }) => {
          spawnArgs.splice(0, spawnArgs.length, ...(args ?? []))
          await spawnGate
          return spawnResult
        },
        write: async ({ data }: { data: string }) => {
          writes.push(data)
        },
        resize: async () => {},
        kill: async () => {},
      },
      contextFiles: {
        write: async ({ content }: { content: string }) => {
          if (!contextFilesAvailable) {
            return { ok: false, message: 'simulated context directory failure' }
          }
          contextBodies.push(content)
          return {
            ok: true,
            path: `/tmp/felixo-context-${contextBodies.length}.txt`,
          }
        },
        release: async () => ({ ok: true }),
      },
    },
  }

  const store = new TerminalSessionStore()
  store.ensure(SESSION_ID, {
    command,
    args:
      command === 'codex'
        ? ['--dangerously-bypass-approvals-and-sandbox']
        : ['--dangerously-skip-permissions'],
    cwd: '/tmp',
    initialText,
  })

  return {
    store,
    writes,
    contextBodies,
    spawnArgs,
    feed: (data: string) => {
      for (const listener of dataListeners) {
        listener({ sessionId: PTY_SESSION_ID, data })
      }
    },
    feedSession: (reference: object) => {
      for (const listener of sessionListeners) listener(reference)
    },
    resolveSpawn: () => releaseSpawn(),
  }
}

/** Só o que é texto de contexto: descarta as respostas do próprio terminal. */
function contextWrites(writes: string[]): string[] {
  return writes.filter((data) => data.includes('CONTEXTO ENTREGUE EM'))
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('TerminalSessionStore: entrega do texto de contexto', () => {
  let harness: Harness | undefined

  beforeEach(() => {
    harness = undefined
  })

  afterEach(() => {
    harness?.store.clear()
  })

  it('não escreve enquanto a CLI só emitiu sequências de escape', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)

    // Bem depois do delay inicial (1200 ms) e de várias voltas da espera: sem
    // nada desenhado na tela, não existe linha de entrada para receber o texto.
    await wait(2200)

    expect(contextWrites(harness.writes)).toEqual([])
  }, 10000)

  it('não escreve o contexto dentro do aviso do modo yolo', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)

    await wait(2200)

    expect(contextWrites(harness.writes)).toEqual([])
  }, 10000)

  it('aceita o aviso do modo yolo escolhendo "Yes, I accept"', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)

    await wait(600)

    // Seta para baixo e Enter em escritas separadas: a seleção começa em
    // "1. No, exit", e as duas teclas juntas a CLI ignora.
    expect(harness.writes).toContain('\x1b[B')
    expect(harness.writes).toContain('\r')
    expect(harness.writes.indexOf('\x1b[B')).toBeLessThan(harness.writes.indexOf('\r'))
  }, 10000)

  it('reenvia o aceite enquanto o aviso continuar na tela', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)

    // A tela nunca sai do aviso: as teclas se perderam no redesenho.
    await wait(1600)

    expect(harness.writes.filter((data) => data === '\x1b[B').length).toBeGreaterThan(1)
  }, 10000)

  it('escreve o contexto quando a linha de entrada aparece', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)
    await wait(1500)
    expect(contextWrites(harness.writes)).toEqual([])

    // A pessoa (ou o aceite automático) respondeu o aviso: o REPL subiu.
    harness.feed('\x1b[2J\x1b[H')
    harness.feed(READY_PROMPT)
    await wait(1600)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  }, 15000)

  it('escreve no Codex assim que o compositor aparece, sem esperar silêncio extra', async () => {
    harness = createHarness(CONTEXT, 'codex')
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)

    // O detector do compositor já confirma que o TUI aceita entrada; não há
    // motivo para aguardar os 500 ms usados apenas pelo fallback genérico.
    await wait(400)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  }, 10000)

  it('escreve no Codex mesmo com a sugestão da CLI dentro do compositor', async () => {
    harness = createHarness(CONTEXT, 'codex')
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT_WITH_HINT)

    // Enquanto a prontidão exigia o compositor em branco — tela que o Codex não
    // mostra — o contexto só saía quando a espera de emergência estourava, e o
    // agente parecia demorar dezenas de segundos para receber o prompt.
    await wait(400)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  }, 10000)

  it('volta ao inline com aviso quando a entrega por arquivo falha', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)

    await wait(400)

    const fallback = harness.writes.find((data) =>
      data.startsWith('AVISO DO FELIXO AI CORE'),
    )
    expect(fallback).toBeDefined()
    expect(fallback).toContain('PADRÃO DE QUALIDADE')
    expect(fallback).toContain('Contexto do canvas: ...')
    expect(harness.contextBodies).toEqual([])
    expect(harness.store.getSnapshot(SESSION_ID)?.contextWarning).toContain(
      'fallback inline',
    )
  }, 10000)

  it('não aplica o recorte de handoff a um prompt de catálogo no fallback', async () => {
    harness = createHarness('', 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await wait(400)

    const longPrompt = `catálogo começo\n${'x'.repeat(160_100)}\ncatálogo fim`
    await harness.store.sendText(SESSION_ID, `${longPrompt}\r`, { kind: 'catalog-prompt' })

    const fallback = harness.writes.find((data) =>
      data.startsWith('AVISO DO FELIXO AI CORE'),
    )
    expect(fallback).toContain('catálogo começo')
    expect(fallback).toContain('catálogo fim')
    expect(fallback).not.toContain('trecho do meio do histórico omitido')
  }, 10000)

  it('não escreve enquanto o Codex pergunta se a pasta é confiável', async () => {
    harness = createHarness(CONTEXT, 'codex')
    harness.feed(BOOT_ESCAPES)
    harness.feed(
      [
        'Do you trust the contents of this directory?',
        '› 1. Yes, continue',
        '  2. No, quit',
      ].join('\r\n'),
    )

    // A tela de confiança usa o mesmo marcador do compositor: escrever aqui
    // seria digitar dentro de um menu de decisão.
    await wait(400)

    expect(contextWrites(harness.writes)).toEqual([])
  }, 10000)

  it('reescreve o contexto se ele não aparecer na linha de entrada', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)

    // A tela continua mostrando a entrada vazia: o texto não chegou na CLI.
    await wait(3000)

    expect(contextWrites(harness.writes).length).toBeGreaterThan(1)
  }, 15000)

  it('não reescreve quando o contexto está na linha de entrada', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)
    await wait(1600)
    expect(contextWrites(harness.writes)).toHaveLength(1)

    // A CLI redesenha a entrada com o texto: entrega confirmada.
    harness.feed('\x1b[2J\x1b[H')
    harness.feed(
      [
        '─'.repeat(60),
        `❯ ${CONTEXT.split('\n')[0]}`,
        '─'.repeat(60),
      ].join('\r\n'),
    )
    await wait(2500)

    expect(contextWrites(harness.writes)).toHaveLength(1)
  }, 15000)
})

/**
 * A corrida entre a primeira tela da CLI e a resposta do `pty:spawn`.
 *
 * O `onData` é assinado antes do `spawn`, então os dois chegam em qualquer
 * ordem. No Windows o ConPTY pinta a tela primeiro quase sempre, e o spawn
 * bem-sucedido era tratado como falha — o card mostrava "Falha ao iniciar o
 * terminal." com a CLI viva atrás, e o texto inicial nunca era enviado.
 */
describe('TerminalSessionStore: saída antes da resposta do spawn', () => {
  let harness: Harness | undefined

  beforeEach(() => {
    harness = undefined
  })

  afterEach(() => {
    harness?.store.clear()
  })

  it('não marca erro quando a CLI desenha antes de o spawn responder', async () => {
    harness = createHarness(CONTEXT, 'claude', true, true)

    // A CLI já está de pé e pintando: a sessão sai de 'starting'.
    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)
    await wait(50)
    expect(harness.store.getSnapshot(SESSION_ID)?.activity).not.toBe('starting')

    // Só agora o IPC volta, com o sucesso que sempre foi verdade.
    harness.resolveSpawn()
    await wait(50)

    const snapshot = harness.store.getSnapshot(SESSION_ID)
    expect(snapshot?.activity).not.toBe('error')
    expect(snapshot?.message).toBeUndefined()
  }, 10000)

  it('entrega o texto inicial mesmo com a saída chegando primeiro', async () => {
    harness = createHarness(CONTEXT, 'claude', true, true)

    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)
    await wait(50)

    harness.resolveSpawn()
    await wait(1600)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  }, 15000)

  it('ainda marca erro quando o spawn falha antes de qualquer saída', async () => {
    harness = createHarness(CONTEXT, 'claude', true, true)
    ;(
      globalThis as unknown as {
        window: { felixo: { pty: { spawn: () => Promise<unknown> } } }
      }
    ).window.felixo.pty.spawn = async () => ({ ok: false, message: 'comando não encontrado' })

    harness.store.clear()
    harness.store.ensure(SESSION_ID, {
      command: 'claude',
      args: [],
      cwd: '/tmp',
      initialText: CONTEXT,
    })
    await wait(50)

    const snapshot = harness.store.getSnapshot(SESSION_ID)
    expect(snapshot?.activity).toBe('error')
    expect(snapshot?.message).toBe('comando não encontrado')
  }, 10000)

  it('insere referências de arquivos arrastados sem enviar Enter', async () => {
    harness = createHarness('')
    ;(globalThis as unknown as { window: { felixo: { getFilePath: (file: File) => string } } }).window.felixo.getFilePath =
      (file) => `/tmp/${file.name}`

    harness.store.handleFileDrop(SESSION_ID, [
      { name: 'um arquivo.txt' } as File,
      { name: 'ação.png' } as File,
    ])
    await wait(0)

    const dropped = harness.writes.find((data) => data.includes('Arquivos arrastados'))
    expect(dropped).toContain('"/tmp/um arquivo.txt"')
    expect(dropped).toContain('"/tmp/ação.png"')
    expect(dropped).not.toContain('\r')
  })

  it('captura e expõe o ID do agente sem guardar conteúdo da conversa', async () => {
    harness = createHarness('')
    harness.feedSession({
      ptySessionId: PTY_SESSION_ID,
      version: 1,
      provider: 'codex',
      sessionId: 'codex-session-123',
      cwd: '/tmp',
      capturedAt: 123,
    })
    await wait(0)

    const metadata = harness.store.getSessionMetadata(SESSION_ID)
    expect(metadata?.agentSessionId).toBe('codex-session-123')
    expect(metadata?.agentSession?.cwd).toBe('/tmp')
  })

  it('usa o ID persistido na retomada e não injeta /resume genérico', async () => {
    harness = createHarness('')
    harness.store.restart(SESSION_ID, {
      command: 'codex',
      args: ['--dangerously-bypass-approvals-and-sandbox'],
      cwd: '/tmp',
      resumeAgentSession: true,
      agentSession: {
        version: 1,
        provider: 'codex',
        sessionId: 'codex-session-123',
        cwd: '/tmp',
        capturedAt: 123,
      },
    })
    await wait(0)

    expect(harness.spawnArgs).toEqual([
      'resume',
      '--dangerously-bypass-approvals-and-sandbox',
      'codex-session-123',
    ])
    expect(harness.writes.some((data) => data.includes('/resume'))).toBe(false)
  })

  it('ignora o drop quando a sessão já foi encerrada', async () => {
    harness = createHarness('')
    ;(globalThis as unknown as { window: { felixo: { getFilePath: (file: File) => string } } }).window.felixo.getFilePath =
      () => '/tmp/encerrado.txt'

    harness.store.remove(SESSION_ID)
    harness.store.handleFileDrop(SESSION_ID, [{ name: 'encerrado.txt' } as File])
    await wait(0)

    expect(harness.writes).toEqual([])
  })
})

/**
 * Portão `hasTypedInputSelection`: decide se o Backspace pós-Ctrl+A pode
 * mandar a sequência de limpeza ou se deve deixar a tecla crua seguir para o
 * PTY.
 *
 * Testado com um `terminal` falso, não o xterm de verdade: `terminal.select()`
 * exige `SelectionService`, que só existe depois de `terminal.open(container)`
 * num DOM real — e a suíte roda em `environment: 'node'` (sem DOM), como o
 * resto deste arquivo. O gate em si só lê `hasSelection()`/`getSelection()`
 * e compara com o que foi guardado, então um dublê que responde essas duas
 * chamadas exercita exatamente a lógica sob teste sem precisar do xterm real.
 */
describe('TerminalSessionStore: portão hasTypedInputSelection', () => {
  function fakeSession(opts: {
    selectedInput?: { selection: string; text: string; visualLineCount: number }
    hasSelection: boolean
    selection: string
  }) {
    return {
      selectedInput: opts.selectedInput,
      terminal: {
        hasSelection: () => opts.hasSelection,
        getSelection: () => opts.selection,
      },
    }
  }

  function gate(store: TerminalSessionStore, session: unknown): boolean {
    return (store as unknown as { hasTypedInputSelection: (session: unknown) => boolean }).hasTypedInputSelection(
      session,
    )
  }

  it('abre quando a seleção lida ainda é a que o Ctrl+A guardou', () => {
    const store = new TerminalSessionStore()
    const session = fakeSession({
      selectedInput: { selection: 'abc', text: 'abc', visualLineCount: 1 },
      hasSelection: true,
      selection: 'abc',
    })

    expect(gate(store, session)).toBe(true)
  })

  it('fecha quando não houve Ctrl+A nenhum', () => {
    const store = new TerminalSessionStore()
    const session = fakeSession({ selectedInput: undefined, hasSelection: true, selection: 'abc' })

    expect(gate(store, session)).toBe(false)
  })

  it('fecha quando a seleção lida diverge da guardada — não apaga um caractere em silêncio', () => {
    const store = new TerminalSessionStore()
    // Simula o que a anotação original suspeitava: a seleção do xterm mudou
    // por fora do Ctrl+A (repintura, clique, seleção do mouse) e passou a
    // cobrir outra coisa — a guardada no Ctrl+A não bate mais.
    const session = fakeSession({
      selectedInput: { selection: 'abc', text: 'abc', visualLineCount: 1 },
      hasSelection: true,
      selection: 'ab',
    })

    expect(gate(store, session)).toBe(false)
  })

  it('fecha quando a seleção foi limpa depois do Ctrl+A', () => {
    const store = new TerminalSessionStore()
    const session = fakeSession({
      selectedInput: { selection: 'abc', text: 'abc', visualLineCount: 1 },
      hasSelection: false,
      selection: 'abc',
    })

    expect(gate(store, session)).toBe(false)
  })
})
