import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalSessionStore } from './terminal-session-store'
import { closeLinkChooser, getLinkChooserState } from '../../shared/links/link-chooser-store'
import { createCatalogPromptInsertion, createManualPromptInsertion } from '../../shared/types/prompt-insertion'

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

/**
 * Checagem de confiança de workspace, que a CLI mostra na primeira vez que
 * abre uma pasta nova — inclusive em modo yolo. Capturada ao vivo com
 * `claude --dangerously-skip-permissions` numa pasta nunca aberta antes: a
 * flag pula a aprovação de ferramenta, não esta tela.
 */
const TRUST_PROMPT = [
  '─'.repeat(60),
  '  Accessing workspace: /tmp/projeto-novo',
  '  Quick safety check: Is this a project you created or one you trust?',
  "  Claude Code'll be able to read, edit, and execute files here.",
  '  ❯ No, exit',
  '    Yes, I trust this folder',
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
  /** Encerra o processo, como a ponte faria com `pty:exit`. */
  emitExit: (event: { exitCode: number; signal?: number }) => void
  spawnArgs: string[]
  /**
   * Resolve a promise do `pty:spawn`. Só existe quando a bancada foi criada com
   * `deferSpawn`; nos demais casos o spawn já resolveu sozinho.
   */
  resolveSpawn: () => void
  /** Opções de autenticação recebidas pela ponte, na ordem dos spawns. */
  spawnRequests: SpawnRequest[]
  /** Nomes dos arquivos de contexto "criados" pela ponte, na ordem de escrita. */
  contextFileNames: string[]
  /** sessionId de cada chamada a `contextFiles.release`, na ordem em que ocorreram. */
  releaseCalls: string[]
}

type SpawnRequest = {
  accountId?: string
  providerId?: string
  accountMode?: 'pinned' | 'chain'
  chainTicket?: string
}

const SESSION_ID = 'terminal-1'
const PTY_SESSION_ID = `canvas:${SESSION_ID}`

function createHarness(
  initialText = CONTEXT,
  command = 'claude',
  contextFilesAvailable = true,
  deferSpawn = false,
  terminalCount = 1,
  extraOptions: {
    initialTextIsHandoff?: boolean
    accountId?: string
    providerId?: string
    accountMode?: 'pinned' | 'chain'
    chainTicket?: string
  } = {},
): Harness {
  const writes: string[] = []
  const contextBodies: string[] = []
  const dataListeners = new Set<(event: { sessionId: string; data: string }) => void>()
  const exitListeners = new Set<(event: { sessionId: string; exitCode: number; signal?: number }) => void>()
  const sessionListeners = new Set<(event: object) => void>()
  const spawnArgs: string[] = []
  const spawnRequests: SpawnRequest[] = []
  const contextFileNames: string[] = []
  const releaseCalls: string[] = []

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
    // O renderer sempre tem `navigator`: o gesto de link do terminal lê a
    // plataforma (no macOS, Ctrl+clique é o clique secundário do sistema).
    navigator: { platform: 'Linux x86_64' },
    felixo: {
      pty: {
        onData: (listener: (event: { sessionId: string; data: string }) => void) => {
          dataListeners.add(listener)
          return () => dataListeners.delete(listener)
        },
        onExit: (listener: (event: { sessionId: string; exitCode: number; signal?: number }) => void) => {
          exitListeners.add(listener)
          return () => exitListeners.delete(listener)
        },
        onSession: (listener: (event: object) => void) => {
          sessionListeners.add(listener)
          return () => sessionListeners.delete(listener)
        },
        spawn: async ({
          args,
          accountId,
          providerId,
          accountMode,
          chainTicket,
        }: { args?: string[] } & SpawnRequest) => {
          spawnArgs.splice(0, spawnArgs.length, ...(args ?? []))
          spawnRequests.push({ accountId, providerId, accountMode, chainTicket })
          await spawnGate
          return spawnResult
        },
        write: async ({ data }: { data: string }) => {
          writes.push(data)
          return { ok: true, delivered: true }
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
          const name = `felixo-context-${contextBodies.length}-initial-context.txt`
          contextFileNames.push(name)
          return { ok: true, name }
        },
        release: async ({ sessionId }: { sessionId: string }) => {
          releaseCalls.push(sessionId)
          return { ok: true }
        },
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
    terminalCount,
    ...extraOptions,
  })

  return {
    store,
    writes,
    contextBodies,
    spawnArgs,
    spawnRequests,
    contextFileNames,
    releaseCalls,
    feed: (data: string) => {
      for (const listener of dataListeners) {
        listener({ sessionId: PTY_SESSION_ID, data })
      }
    },
    feedSession: (reference: object) => {
      for (const listener of sessionListeners) listener(reference)
    },
    emitExit: (event) => {
      for (const listener of [...exitListeners]) listener({ sessionId: PTY_SESSION_ID, ...event })
    },
    resolveSpawn: () => releaseSpawn(),
  }
}

/** Só o que é texto de contexto: descarta as respostas do próprio terminal. */
function contextWrites(writes: string[]): string[] {
  return writes.filter((data) => data.includes('CONTEXTO ENTREGUE EM'))
}

/*
 * Relógio falso nas suítes que dependem dos prazos do store.
 *
 * As esperas do store (silêncio antes de digitar, reenvio do aceite, prazo de
 * emergência, confirmação do contexto) são `setTimeout` + `Date.now`. Com o
 * relógio real o arquivo levava ~44 s só esperando. O `vi.useFakeTimers()` do
 * vitest 4 falsifica timers, `Date` e `performance`; Promises nativas nunca são
 * falsificadas. `vi.advanceTimersByTimeAsync(ms)` cede um turno real antes de
 * cada timer vencido e entre um e outro, então as promises das escritas na
 * ponte resolvem entre um timer e o próximo, na mesma ordem que teriam com o
 * relógio real. (A notificação de ouvintes do store é síncrona e não depende
 * de nada disso.)
 *
 * O relógio falso é ligado ANTES de `createHarness`, para o xterm e o store
 * agendarem nele, e desligado DEPOIS do `store.clear()`: timers que sobrarem
 * são descartados em vez de dispararem no teste seguinte.
 */

describe('TerminalSessionStore: entrega do texto de contexto', () => {
  let harness: Harness | undefined

  beforeEach(() => {
    harness = undefined
    vi.useFakeTimers()
  })

  afterEach(() => {
    harness?.store.clear()
    vi.useRealTimers()
  })

  it('cria o xterm compacto quando o canvas já tem dez terminais', () => {
    harness = createHarness('', 'claude', true, false, 10)

    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      limit: 5_000,
      outputLines: 0,
      historyTruncated: false,
      replayLimitChars: 200_000,
    })
  })

  // A capacidade real do xterm é linhas visíveis (24) + scrollback (5.000).
  // Cada teste abaixo confere o marcador contra o próprio buffer: a primeira
  // linha ainda está lá (nada descartado) ou já saiu (descartado).
  it('marca quando a saída passa da capacidade do buffer visual compacto', async () => {
    harness = createHarness('', 'claude', true, false, 10)
    const output = `${Array.from({ length: 5_100 }, (_, index) => `output-${index}`).join('\r\n')}\r\n`

    harness.feed(output)
    await vi.advanceTimersByTimeAsync(50)

    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      limit: 5_000,
      outputLines: 5_100,
      historyTruncated: true,
      nearLimit: false,
    })
    expect(harness.store.getTranscript(SESSION_ID).text).not.toMatch(/^output-0$/m)
  })

  it('não acusa descarte quando a saída ainda cabe, mas avisa que está perto do limite', async () => {
    harness = createHarness('', 'claude', true, false, 10)
    // Mais linhas lógicas que o scrollback, menos que a capacidade: nada saiu.
    // A contagem anterior (`\n` > limite) acusava descarte aqui.
    const output = `${Array.from({ length: 5_001 }, (_, index) => `output-${index}`).join('\r\n')}\r\n`

    harness.feed(output)
    await vi.advanceTimersByTimeAsync(50)

    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      limit: 5_000,
      historyTruncated: false,
      nearLimit: true,
    })
    expect(harness.store.getTranscript(SESSION_ID).text).toMatch(/^output-0$/m)
  })

  it('conta linhas quebradas pela largura: 3.000 linhas longas já descartam o começo', async () => {
    harness = createHarness('', 'claude', true, false, 10)
    // 120 caracteres em 80 colunas: cada linha lógica ocupa duas visuais.
    const output = `${Array.from({ length: 3_000 }, (_, index) =>
      `linha-${String(index).padStart(5, '0')} ${'x'.repeat(108)}`,
    ).join('\r\n')}\r\n`

    harness.feed(output)
    await vi.advanceTimersByTimeAsync(50)

    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      limit: 5_000,
      outputLines: 3_000,
      historyTruncated: true,
    })
    expect(harness.store.getTranscript(SESSION_ID).text).not.toContain('linha-00000')
  })

  it('o descarte continua marcado quando a gaveta abre e o terminal ganha linhas', async () => {
    harness = createHarness('', 'claude', true, false, 10)
    harness.feed(`${Array.from({ length: 5_100 }, (_, index) => `output-${index}`).join('\r\n')}\r\n`)
    await vi.advanceTimersByTimeAsync(50)
    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback?.historyTruncated).toBe(true)

    // O `fit()` da gaveta só age com o xterm aberto no DOM; aqui redimensionamos
    // o xterm da sessão direto, que é o efeito dele: mais linhas, capacidade
    // maior (24 + 5.000 → 45 + 5.000) e as linhas perdidas continuam perdidas.
    const sessions = (harness.store as unknown as {
      sessions: Map<string, { terminal: { resize: (cols: number, rows: number) => void } }>
    }).sessions
    sessions.get(SESSION_ID)?.terminal.resize(160, 45)
    harness.feed('mais uma linha depois de abrir a gaveta\r\n')
    await vi.advanceTimersByTimeAsync(50)

    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      historyTruncated: true,
      nearLimit: false,
    })
    expect(harness.store.getTranscript(SESSION_ID).text).not.toMatch(/^output-0$/m)
  })

  it('o aviso de perto do limite continua quando a CLI entra na tela alternativa', async () => {
    harness = createHarness('', 'claude', true, false, 10)
    harness.feed(`${Array.from({ length: 4_500 }, (_, index) => `output-${index}`).join('\r\n')}\r\n`)
    await vi.advanceTimersByTimeAsync(50)
    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback?.nearLimit).toBe(true)

    // O histórico continua no buffer normal; o alternativo tem só a tela (24
    // linhas). Medir o buffer ativo apagaria o aviso aqui.
    harness.feed('\x1b[?1049h')
    harness.feed(`${Array.from({ length: 100 }, (_, index) => `repintura-${index}`).join('\r\n')}\r\n`)
    await vi.advanceTimersByTimeAsync(50)

    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      historyTruncated: false,
      nearLimit: true,
    })
  })

  it('saída na tela alternativa não entra no histórico e não acende aviso', async () => {
    harness = createHarness('', 'claude', true, false, 10)
    harness.feed('antes da tela cheia\r\n\x1b[?1049h')
    harness.feed(`${Array.from({ length: 6_000 }, (_, index) => `repintura-${index}`).join('\r\n')}\r\n`)
    await vi.advanceTimersByTimeAsync(50)

    // Nenhuma transição de estado: o snapshot nem é republicado (a contagem de
    // `\n` segue só no store), que é exatamente o que evita render por pedaço.
    expect(harness.store.getSnapshot(SESSION_ID)?.scrollback).toMatchObject({
      limit: 5_000,
      historyTruncated: false,
      nearLimit: false,
    })
  })

  it('não escreve enquanto a CLI só emitiu sequências de escape', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)

    // Bem depois do delay inicial (1200 ms) e de várias voltas da espera: sem
    // nada desenhado na tela, não existe linha de entrada para receber o texto.
    await vi.advanceTimersByTimeAsync(2200)

    expect(contextWrites(harness.writes)).toEqual([])
  })

  it('não escreve o contexto dentro do aviso do modo yolo', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)

    await vi.advanceTimersByTimeAsync(2200)

    expect(contextWrites(harness.writes)).toEqual([])
  })

  it('aceita o aviso do modo yolo escolhendo "Yes, I accept"', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)

    await vi.advanceTimersByTimeAsync(600)

    // Seta para baixo e Enter em escritas separadas: a seleção começa em
    // "1. No, exit", e as duas teclas juntas a CLI ignora.
    expect(harness.writes).toContain('\x1b[B')
    expect(harness.writes).toContain('\r')
    expect(harness.writes.indexOf('\x1b[B')).toBeLessThan(harness.writes.indexOf('\r'))
  })

  it('reenvia o aceite enquanto o aviso continuar na tela', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)

    // A tela nunca sai do aviso: as teclas se perderam no redesenho.
    await vi.advanceTimersByTimeAsync(1600)

    expect(harness.writes.filter((data) => data === '\x1b[B').length).toBeGreaterThan(1)
  })

  it('escreve o contexto quando a linha de entrada aparece', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(BYPASS_WARNING)
    await vi.advanceTimersByTimeAsync(1500)
    expect(contextWrites(harness.writes)).toEqual([])

    // A pessoa (ou o aceite automático) respondeu o aviso: o REPL subiu.
    harness.feed('\x1b[2J\x1b[H')
    harness.feed(READY_PROMPT)
    await vi.advanceTimersByTimeAsync(1600)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
    const [reference] = contextWrites(harness.writes)
    expect(reference).toContain('felixo context read "felixo-context-1-initial-context.txt"')
    expect(reference).not.toMatch(/(?:\/Users|[A-Za-z]:\\|\/home\/|\/tmp\/)/)
  })

  // Bug real: a checagem de confiança de workspace aparece mesmo em modo
  // yolo (`--dangerously-skip-permissions`), e o código antes assumia que o
  // modo yolo a dispensava — o contexto inicial era digitado dentro deste
  // menu de "No, exit / Yes, I trust this folder" e a sessão começava sem
  // contexto nenhum. Ver `isClaudeTrustPrompt`.
  it('não escreve o contexto dentro da checagem de confiança de workspace', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(TRUST_PROMPT)

    await vi.advanceTimersByTimeAsync(2200)

    expect(contextWrites(harness.writes)).toEqual([])
  })

  it('aceita a checagem de confiança de workspace escolhendo "Yes, I trust this folder"', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(TRUST_PROMPT)

    await vi.advanceTimersByTimeAsync(600)

    // Seta para baixo e Enter em escritas separadas: a seleção começa em
    // "No, exit", e as duas teclas juntas a CLI ignora.
    expect(harness.writes).toContain('\x1b[B')
    expect(harness.writes).toContain('\r')
    expect(harness.writes.indexOf('\x1b[B')).toBeLessThan(harness.writes.indexOf('\r'))
  })

  it('reenvia o aceite enquanto a checagem de confiança continuar na tela', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(TRUST_PROMPT)

    // A tela nunca sai da checagem: as teclas se perderam no redesenho.
    await vi.advanceTimersByTimeAsync(1600)

    expect(harness.writes.filter((data) => data === '\x1b[B').length).toBeGreaterThan(1)
  })

  it('escreve o contexto quando o REPL sobe depois da checagem de confiança', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(TRUST_PROMPT)
    await vi.advanceTimersByTimeAsync(1500)
    expect(contextWrites(harness.writes)).toEqual([])

    // A pessoa (ou o aceite automático) confiou na pasta: o REPL subiu.
    harness.feed('\x1b[2J\x1b[H')
    harness.feed(READY_PROMPT)
    await vi.advanceTimersByTimeAsync(1600)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  })

  it('não força o contexto num prompt de decisão nem depois do prazo de emergência de uma CLI desconhecida', async () => {
    // `gemini` não tem leitor de linha de entrada dedicado (INPUT_LINE_READERS),
    // então cai no teto genérico de 10s — o mesmo caminho que, sem a checagem
    // de tela de decisão, digitava o contexto dentro de qualquer menu parado.
    harness = createHarness(CONTEXT, 'gemini')
    harness.feed(BOOT_ESCAPES)
    harness.feed(['Apply this change?', '❯ 1. Yes', '  2. No'].join('\r\n'))

    await vi.advanceTimersByTimeAsync(10400)

    expect(contextWrites(harness.writes)).toEqual([])
  })

  it('escreve no Codex assim que o compositor aparece, sem esperar silêncio extra', async () => {
    harness = createHarness(CONTEXT, 'codex')
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)

    // O detector do compositor já confirma que o TUI aceita entrada; não há
    // motivo para aguardar os 500 ms usados apenas pelo fallback genérico.
    await vi.advanceTimersByTimeAsync(400)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  })

  it('escreve no Codex mesmo com a sugestão da CLI dentro do compositor', async () => {
    harness = createHarness(CONTEXT, 'codex')
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT_WITH_HINT)

    // Enquanto a prontidão exigia o compositor em branco — tela que o Codex não
    // mostra — o contexto só saía quando a espera de emergência estourava, e o
    // agente parecia demorar dezenas de segundos para receber o prompt.
    await vi.advanceTimersByTimeAsync(400)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  })

  it('volta ao inline com aviso quando a entrega por arquivo falha', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)

    await vi.advanceTimersByTimeAsync(400)

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
  })

  it('não aplica o recorte de handoff a um prompt de catálogo no fallback', async () => {
    harness = createHarness('', 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    const longPrompt = `catálogo começo\n${'x'.repeat(160_100)}\ncatálogo fim`
    await harness.store.sendText(SESSION_ID, `${longPrompt}\r`, { kind: 'catalog-prompt' })

    const fallback = harness.writes.find((data) =>
      data.startsWith('AVISO DO FELIXO AI CORE'),
    )
    expect(fallback).toContain('catálogo começo')
    expect(fallback).toContain('catálogo fim')
    expect(fallback).not.toContain('trecho do meio do histórico omitido')
  })

  it('sendText devolve delivered:true quando a PTY confirma a escrita', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    const result = await harness.store.sendText(SESSION_ID, 'olá\r', { kind: 'catalog-prompt' })

    expect(result).toEqual({ delivered: true })
  })

  it('typeText digita o texto ditado SEM Enter e SEM arquivo de contexto', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    const antes = harness.writes.length

    const result = await harness.store.typeText(SESSION_ID, 'listar os arquivos do projeto')

    expect(result).toEqual({ delivered: true })
    const novos = harness.writes.slice(antes)
    expect(novos).toEqual(['listar os arquivos do projeto'])
    // Nada de Enter, e o texto curto não vira "arquivo de contexto".
    expect(novos.join('')).not.toMatch(/[\r\n]/)
    expect(contextWrites(novos)).toEqual([])
  })

  it('typeText RECUSA controle (Enter/ESC) mesmo se o chamador esquecer de limpar', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    const antes = harness.writes.length

    for (const perigoso of ['rm -rf /\r', 'ls\n', 'x\x1b[2Jy', 'a\x00b']) {
      const result = await harness.store.typeText(SESSION_ID, perigoso)
      expect(result.delivered).toBe(false)
    }
    expect(harness.writes.length).toBe(antes)
  })

  it('typeText sem sessão ou com texto vazio não entrega nada', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    expect(await harness.store.typeText('nao-existe', 'oi')).toEqual({ delivered: false, reason: 'no-session' })
    expect(await harness.store.typeText(SESSION_ID, '')).toEqual({ delivered: false, reason: 'no-session' })
  })

  it('guarda a identidade do catálogo ao lado do payload enviado', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    const insertion = createCatalogPromptInsertion(
      { id: 'catalog-123', name: 'Revisão', prompt: 'revisar o diff' },
      'revisar o diff',
      { autoSubmit: true, timestamp: '2026-09-16T12:00:00.000Z' },
    )
    const result = await harness.store.sendText(SESSION_ID, 'revisar o diff\r', {
      kind: 'catalog-prompt',
      insertion,
    })

    expect(result).toEqual({ delivered: true })
    expect(harness.store.getSnapshot(SESSION_ID)?.lastPromptInsertion).toMatchObject({
      id: 'catalog-123',
      name: 'Revisão',
      source: 'catalog',
      content: 'revisar o diff',
      combinedNames: ['Revisão'],
      autoSubmit: true,
      timestamp: '2026-09-16T12:00:00.000Z',
    })
    expect(harness.store.getSessionMetadata(SESSION_ID)?.lastPromptInsertion?.id).toBe('catalog-123')
  })

  it('mantém a mesma metadata quando o arquivo cai no fallback inline', async () => {
    const insertion = createCatalogPromptInsertion(
      { id: 'catalog-fallback', name: 'Fallback', prompt: 'instrução protegida' },
      'instrução protegida',
      { autoSubmit: true, timestamp: '2026-09-16T12:00:00.000Z' },
    )
    const delivered = createHarness('', 'codex', true)
    delivered.feed(BOOT_ESCAPES)
    delivered.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    await delivered.store.sendText(SESSION_ID, 'instrução protegida\r', {
      kind: 'catalog-prompt',
      insertion,
    })
    const deliveredMetadata = delivered.store.getSnapshot(SESSION_ID)?.lastPromptInsertion
    delivered.store.clear()

    const fallback = createHarness('', 'codex', false)
    fallback.feed(BOOT_ESCAPES)
    fallback.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    await fallback.store.sendText(SESSION_ID, 'instrução protegida\r', {
      kind: 'catalog-prompt',
      insertion,
    })

    expect(fallback.store.getSnapshot(SESSION_ID)?.lastPromptInsertion).toEqual(
      deliveredMetadata,
    )
    expect(fallback.store.getSnapshot(SESSION_ID)?.contextWarning).toContain('fallback inline')
    // Este teste não usa o `harness` do afterEach: sem o clear, os timers do
    // store do fallback ficariam pendurados para além deste teste.
    fallback.store.clear()
  })

  it('marca envio digitado pelo painel como manual e sem nome', async () => {
    harness = createHarness('', 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    const result = await harness.store.sendText(SESSION_ID, 'texto escrito\r', {
      kind: 'manual-prompt',
      insertion: createManualPromptInsertion('texto escrito\r', {
        timestamp: '2026-09-16T12:00:00.000Z',
      }),
    })

    expect(result).toEqual({ delivered: true })
    expect(harness.store.getSnapshot(SESSION_ID)?.lastPromptInsertion).toMatchObject({
      source: 'manual',
      combinedNames: [],
      content: 'texto escrito',
      autoSubmit: true,
    })
    expect(harness.store.getSnapshot(SESSION_ID)?.lastPromptInsertion?.name).toBeUndefined()
  })

  it('sendText devolve delivered:false quando a PTY rejeita a escrita', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    ;(
      globalThis as unknown as {
        window: { felixo: { pty: { write: () => Promise<unknown> } } }
      }
    ).window.felixo.pty.write = async () => ({ ok: false, erro: 'sessão fechada' })

    const result = await harness.store.sendText(SESSION_ID, 'olá\r', { kind: 'catalog-prompt' })

    expect(result).toEqual({ delivered: false, reason: 'rejected', message: 'sessão fechada' })
  })

  it('sendText devolve delivered:false quando o IPC de escrita lança', async () => {
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    ;(
      globalThis as unknown as {
        window: { felixo: { pty: { write: () => Promise<unknown> } } }
      }
    ).window.felixo.pty.write = async () => {
      throw new Error('ponte indisponível')
    }

    const result = await harness.store.sendText(SESSION_ID, 'olá\r', { kind: 'catalog-prompt' })

    expect(result).toEqual({ delivered: false, reason: 'error', message: 'ponte indisponível' })
  })

  it('sendText devolve delivered:false sem terminal correspondente', async () => {
    harness = createHarness(CONTEXT, 'codex', false)

    const result = await harness.store.sendText('inexistente', 'olá\r', { kind: 'catalog-prompt' })

    expect(result).toEqual({ delivered: false, reason: 'no-session' })
  })

  it('duas chamadas de sendText na mesma sessão são serializadas, nunca intercaladas', async () => {
    // Dois cliques (duplo clique burlando o botão desabilitado, ou dois
    // painéis distintos mandando pra mesma sessão ao mesmo tempo) não podem
    // interleave a escrita na PTY. `sendChain` já garante isso; este teste
    // prova a ordem observável em vez de só confiar na leitura do código.
    harness = createHarness(CONTEXT, 'codex', false)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    const first = harness.store.sendText(SESSION_ID, 'primeiro\r', { kind: 'catalog-prompt' })
    const second = harness.store.sendText(SESSION_ID, 'segundo\r', { kind: 'catalog-prompt' })
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult).toEqual({ delivered: true })
    expect(secondResult).toEqual({ delivered: true })
    // A escrita do segundo texto só aparece depois da do primeiro — nunca
    // fragmentos dos dois textos intercalados no mesmo write.
    const primeiroIndex = harness.writes.findIndex((data) => data.includes('primeiro'))
    const segundoIndex = harness.writes.findIndex((data) => data.includes('segundo'))
    expect(primeiroIndex).toBeGreaterThanOrEqual(0)
    expect(segundoIndex).toBeGreaterThan(primeiroIndex)
  })

  it('retry após falha não apaga o artefato de outra entrega da mesma sessão', async () => {
    // `contextFiles.release` limpa TODOS os arquivos da sessão de uma vez —
    // se um retry o chamasse, apagaria também artefatos de envios anteriores
    // bem-sucedidos que ainda podem estar em uso. sendText nunca deve chamar
    // release; quem chama é só dispose/restart da sessão.
    harness = createHarness(CONTEXT, 'codex', true)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    let shouldFail = true
    ;(
      globalThis as unknown as {
        window: { felixo: { pty: { write: (params: { data: string }) => Promise<unknown> } } }
      }
    ).window.felixo.pty.write = async (params) => {
      harness!.writes.push(params.data)
      if (shouldFail) return { ok: false, erro: 'sessão fechada' }
      return { ok: true, delivered: true }
    }

    // A entrega do texto inicial do boot já grava seu próprio arquivo; a
    // contagem daqui em diante é relativa, não absoluta.
    const filesBeforeAttempts = harness.contextFileNames.length

    const failedAttempt = await harness.store.sendText(SESSION_ID, 'catálogo\r', {
      kind: 'catalog-prompt',
    })
    expect(failedAttempt).toEqual({ delivered: false, reason: 'rejected', message: 'sessão fechada' })
    expect(harness.contextFileNames.length).toBe(filesBeforeAttempts + 1)

    shouldFail = false
    const retryAttempt = await harness.store.sendText(SESSION_ID, 'catálogo\r', {
      kind: 'catalog-prompt',
    })
    expect(retryAttempt).toEqual({ delivered: true })

    // O retry escreveu um SEGUNDO artefato, com nome distinto do primeiro —
    // não reaproveitou nem apagou o da tentativa que falhou.
    expect(harness.contextFileNames.length).toBe(filesBeforeAttempts + 2)
    const [failedName, retryName] = harness.contextFileNames.slice(filesBeforeAttempts)
    expect(failedName).not.toBe(retryName)
    expect(harness.releaseCalls).toEqual([])
  })

  it('preserva Unicode, Markdown e quebras de linha do catálogo ponta a ponta', async () => {
    harness = createHarness(CONTEXT, 'codex', true)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    const prompt = [
      '## Título com acentuação: café, ação, emoji 🚀',
      '',
      '- item com **negrito** e `código`',
      '- segunda linha\ncom quebra explícita',
      '',
      '> citação em bloco',
    ].join('\n')

    const result = await harness.store.sendText(SESSION_ID, `${prompt}\r`, {
      kind: 'catalog-prompt',
    })

    expect(result).toEqual({ delivered: true })
    const body = harness.contextBodies.at(-1) ?? ''
    expect(body).toContain('café, ação, emoji 🚀')
    expect(body).toContain('**negrito**')
    expect(body).toContain('`código`')
    expect(body).toContain('segunda linha\ncom quebra explícita')
    expect(body).toContain('> citação em bloco')
  })

  it('aguarda o dreno da PTY antes de resolver — não confirma cedo demais', async () => {
    harness = createHarness(CONTEXT, 'codex', true)
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    let releaseDrain: (() => void) | undefined
    const drainGate = new Promise<void>((resolve) => {
      releaseDrain = resolve
    })
    ;(
      globalThis as unknown as {
        window: { felixo: { pty: { write: (params: { data: string }) => Promise<unknown> } } }
      }
    ).window.felixo.pty.write = async (params) => {
      harness!.writes.push(params.data)
      await drainGate
      return { ok: true, delivered: true }
    }

    let settled = false
    const pending = harness.store.sendText(SESSION_ID, 'catálogo\r', { kind: 'catalog-prompt' })
    void pending.then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(50)
    expect(settled).toBe(false) // ainda preso no dreno — não pode ter confirmado

    releaseDrain?.()
    const result = await pending
    expect(settled).toBe(true)
    expect(result).toEqual({ delivered: true })
  })

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
    await vi.advanceTimersByTimeAsync(400)

    expect(contextWrites(harness.writes)).toEqual([])
  })

  it('reescreve o contexto se ele não aparecer na linha de entrada', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)

    // A tela continua mostrando a entrada vazia: o texto não chegou na CLI.
    await vi.advanceTimersByTimeAsync(3000)

    expect(contextWrites(harness.writes).length).toBeGreaterThan(1)
  })

  it('não reescreve quando o contexto está na linha de entrada', async () => {
    harness = createHarness()
    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)
    await vi.advanceTimersByTimeAsync(1600)
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
    await vi.advanceTimersByTimeAsync(2500)

    expect(contextWrites(harness.writes)).toHaveLength(1)
  })
})

/**
 * A corrida entre a primeira tela da CLI e a resposta do `pty:spawn`.
 *
 * O `onData` é assinado antes do `spawn`, então os dois chegam em qualquer
 * ordem. No Windows o ConPTY pinta a tela primeiro quase sempre, e o spawn
 * bem-sucedido era tratado como falha — o card mostrava "Falha ao iniciar o
 * terminal." com a CLI viva atrás, e o texto inicial nunca era enviado.
 */
describe('TerminalSessionStore: relançamento automático do Codex depois do auto-update', () => {
  let harness: Harness | undefined
  const HANDOFF = 'Continue o trabalho do agente anterior: refatore o módulo de pagamentos.'
  const UPDATE_BANNER = '🎉Update ran successfully! Please restart Codex.'

  beforeEach(() => {
    harness = undefined
    vi.useFakeTimers()
  })

  afterEach(() => {
    harness?.store.clear()
    vi.useRealTimers()
  })

  async function relaunchAfterUpdate(current: Harness): Promise<void> {
    current.feed(`\r\n${UPDATE_BANNER}\r\n`)
    current.emitExit({ exitCode: 0 })
    await vi.advanceTimersByTimeAsync(0)
    current.feed(BOOT_ESCAPES)
    current.feed(CODEX_READY_PROMPT)
    // Bem mais que o prazo de emergência da entrega: se o texto fosse sair,
    // já teria saído.
    await vi.advanceTimersByTimeAsync(15_000)
  }

  it('não reenvia o texto de passagem e diz no bloco o que fazer', async () => {
    harness = createHarness(HANDOFF, 'codex', true, false, 1, { initialTextIsHandoff: true })
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    expect(harness.contextBodies).toEqual([HANDOFF])

    await relaunchAfterUpdate(harness)

    expect(harness.spawnRequests).toHaveLength(2)
    expect(harness.contextBodies, 'a passagem foi entregue de novo ao Codex relançado').toEqual([HANDOFF])
    expect(harness.store.getSnapshot(SESSION_ID)?.contextWarning).toContain('não foi reenviado')
  })

  it('o ticket da cadeia vai só no primeiro spawn; o relançamento é spawn comum na mesma conta', async () => {
    harness = createHarness(HANDOFF, 'codex', true, false, 1, {
      initialTextIsHandoff: true,
      accountId: 'conta-b',
      providerId: 'codex',
      accountMode: 'chain',
      chainTicket: 'ticket-1',
    })
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)

    await relaunchAfterUpdate(harness)

    expect(harness.spawnRequests).toEqual([
      { accountId: 'conta-b', providerId: 'codex', accountMode: 'chain', chainTicket: 'ticket-1' },
      { accountId: 'conta-b', providerId: 'codex', accountMode: 'chain', chainTicket: undefined },
    ])
    expect(harness.spawnRequests[1]).not.toHaveProperty('chainTicket', 'ticket-1')
  })

  it('sem passagem, a instrução de largada volta a ser entregue, como antes', async () => {
    harness = createHarness(CONTEXT, 'codex')
    harness.feed(BOOT_ESCAPES)
    harness.feed(CODEX_READY_PROMPT)
    await vi.advanceTimersByTimeAsync(400)
    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])

    await relaunchAfterUpdate(harness)

    expect(harness.spawnRequests).toHaveLength(2)
    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT, DELIVERED_QUALITY_CONTEXT])
    expect(harness.store.getSnapshot(SESSION_ID)?.contextWarning).toBeUndefined()
  })
})

describe('TerminalSessionStore: saída antes da resposta do spawn', () => {
  let harness: Harness | undefined

  beforeEach(() => {
    harness = undefined
    vi.useFakeTimers()
  })

  afterEach(() => {
    harness?.store.clear()
    vi.useRealTimers()
  })

  it('não marca erro quando a CLI desenha antes de o spawn responder', async () => {
    harness = createHarness(CONTEXT, 'claude', true, true)

    // A CLI já está de pé e pintando: a sessão sai de 'starting'.
    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)
    await vi.advanceTimersByTimeAsync(50)
    expect(harness.store.getSnapshot(SESSION_ID)?.activity).not.toBe('starting')

    // Só agora o IPC volta, com o sucesso que sempre foi verdade.
    harness.resolveSpawn()
    await vi.advanceTimersByTimeAsync(50)

    const snapshot = harness.store.getSnapshot(SESSION_ID)
    expect(snapshot?.activity).not.toBe('error')
    expect(snapshot?.message).toBeUndefined()
  })

  it('entrega o texto inicial mesmo com a saída chegando primeiro', async () => {
    harness = createHarness(CONTEXT, 'claude', true, true)

    harness.feed(BOOT_ESCAPES)
    harness.feed(READY_PROMPT)
    await vi.advanceTimersByTimeAsync(50)

    harness.resolveSpawn()
    await vi.advanceTimersByTimeAsync(1600)

    expect(harness.contextBodies).toEqual([DELIVERED_QUALITY_CONTEXT])
  })

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
    await vi.advanceTimersByTimeAsync(50)

    const snapshot = harness.store.getSnapshot(SESSION_ID)
    expect(snapshot?.activity).toBe('error')
    expect(snapshot?.message).toBe('comando não encontrado')
  })

  it('insere referências de arquivos arrastados sem enviar Enter', async () => {
    harness = createHarness('')
    ;(globalThis as unknown as { window: { felixo: { getFilePath: (file: File) => string } } }).window.felixo.getFilePath =
      (file) => `/tmp/${file.name}`

    harness.store.handleFileDrop(SESSION_ID, [
      { name: 'um arquivo.txt' } as File,
      { name: 'ação.png' } as File,
    ])
    await vi.advanceTimersByTimeAsync(0)

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
    await vi.advanceTimersByTimeAsync(0)

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
    await vi.advanceTimersByTimeAsync(0)

    expect(harness.spawnArgs).toEqual([
      'resume',
      '--dangerously-bypass-approvals-and-sandbox',
      'codex-session-123',
    ])
    expect(harness.writes.some((data) => data.includes('/resume'))).toBe(false)
  })

  it('não passa o UUID persistido ao Gemini quando a retomada automática não é segura', async () => {
    harness = createHarness('')
    harness.store.restart(SESSION_ID, {
      command: 'gemini',
      args: ['--yolo'],
      cwd: '/tmp',
      resumeAgentSession: true,
      agentSession: {
        version: 1,
        provider: 'gemini',
        sessionId: 'gemini-session-123',
        cwd: '/tmp',
        capturedAt: 123,
      },
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(harness.spawnArgs).toEqual(['--yolo'])
    expect(harness.spawnArgs).not.toContain('gemini-session-123')
  })

  it('restart acionado pelo drawer preserva a conta selecionada', async () => {
    harness = createHarness('')
    harness.store.restart(SESSION_ID, {
      command: 'claude',
      args: ['--dangerously-skip-permissions'],
      cwd: '/tmp',
      accountId: 'claude-pessoal',
      providerId: 'claude',
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(harness.spawnRequests.at(-1)).toEqual({
      accountId: 'claude-pessoal',
      providerId: 'claude',
    })
  })

  it('restart acionado pelo drawer sem accountId mantém o login do sistema', async () => {
    harness = createHarness('')
    harness.store.restart(SESSION_ID, {
      command: 'claude',
      args: ['--dangerously-skip-permissions'],
      cwd: '/tmp',
      providerId: 'claude',
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(harness.spawnRequests.at(-1)).toEqual({
      accountId: undefined,
      providerId: 'claude',
    })
  })

  it('ignora o drop quando a sessão já foi encerrada', async () => {
    harness = createHarness('')
    ;(globalThis as unknown as { window: { felixo: { getFilePath: (file: File) => string } } }).window.felixo.getFilePath =
      () => '/tmp/encerrado.txt'

    harness.store.remove(SESSION_ID)
    harness.store.handleFileDrop(SESSION_ID, [{ name: 'encerrado.txt' } as File])
    await vi.advanceTimersByTimeAsync(0)

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

/**
 * Os dois caminhos de link do xterm — texto que parece URL (WebLinksAddon) e
 * hyperlink OSC 8 (`linkHandler`) — precisam cair no mesmo gesto. Sem o
 * `linkHandler`, o xterm abre OSC 8 com clique simples, `confirm()` e um
 * `window.open()` sem URL que o processo principal recebe como about:blank.
 *
 * O gesto nunca abre o link: pede o menu de destino (`link-chooser-store`),
 * que mostra para onde ele vai e pergunta navegador, Página Web ou copiar.
 */
describe('TerminalSessionStore: links do terminal', () => {
  type LinkHandler = {
    activate: (event: MouseEvent, text: string, range: unknown) => void
    hover?: (event: MouseEvent, text: string, range: unknown) => void
    leave?: (event: MouseEvent, text: string, range: unknown) => void
    allowNonHttpProtocols?: boolean
  }
  type LinkSession = {
    hoveredLink?: string
    hoveredLinkPoint?: { x: number; y: number }
    linkGestureOrigin?: { clientX: number; clientY: number }
    terminal: { options: { linkHandler?: LinkHandler | null }; hasSelection: () => boolean }
  }

  const RANGE = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } }
  const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
  let harness: Harness | undefined
  let opened: string[]

  function mouse(init: Partial<MouseEvent> = {}) {
    return { ctrlKey: false, metaKey: false, button: 0, ...init } as MouseEvent
  }

  function linkSession(current: Harness): LinkSession {
    const session = (current.store as unknown as { sessions: Map<string, LinkSession> }).sessions.get(SESSION_ID)
    if (!session) throw new Error('sessão não criada')
    return session
  }

  /** O link pedido ao menu, ou `null` se nenhum gesto chegou a pedir. */
  function chooserUrl(): string | null {
    return getLinkChooserState().request?.url ?? null
  }

  beforeEach(() => {
    harness = undefined
    vi.useFakeTimers()
    closeLinkChooser()
    opened = []
  })

  /**
   * A bancada com um gravador de `window.open`. Nenhum gesto do terminal pode
   * abrir janela: quem abre é o menu, depois da escolha. O gravador vai
   * DEPOIS da bancada, porque ela troca o `window` global: posto antes, ele
   * ficava no objeto velho, não gravava nada e as asserções passavam vazias.
   */
  function linkHarness(): Harness {
    const created = createHarness('', 'claude', true, false, 1)
    ;(globalThis as unknown as { window: { open: (url: string) => null } }).window.open = (url) => {
      opened.push(url)
      return null
    }
    return created
  }

  afterEach(() => {
    harness?.store.clear()
    closeLinkChooser()
    vi.useRealTimers()
  })

  it('hyperlink OSC 8: Ctrl/Cmd+clique pede o menu com o destino, clique simples não pede nada', () => {
    harness = linkHarness()
    const session = linkSession(harness)
    const handler = session.terminal.options.linkHandler
    // `true` só faz o xterm entregar ao app o OSC 8 fora da web, em vez de
    // descartá-lo em silêncio; quem decide o que abre continua sendo a política.
    expect(handler?.allowNonHttpProtocols).toBe(true)

    handler?.activate(mouse(), 'https://example.com/a', RANGE)
    expect(chooserUrl()).toBeNull()

    handler?.activate(mouse({ ctrlKey: true, clientX: 30, clientY: 40 }), 'HTTPS://Example.com/a', RANGE)
    expect(getLinkChooserState().request).toEqual({
      url: 'HTTPS://Example.com/a',
      origin: 'terminal',
      anchor: { x: 30, y: 40 },
      sourceNodeId: SESSION_ID,
      returnFocus: null,
    })
    expect(opened).toEqual([])
  })

  it.each(['file:///C:/x', 'vscode://file/C:/x', `https://exa${ZERO_WIDTH_SPACE}mple.com/`])(
    'link recusado (%j) também pede o menu, que explica o motivo e só oferece copiar',
    (uri) => {
      harness = linkHarness()
      linkSession(harness).terminal.options.linkHandler?.activate(mouse({ ctrlKey: true }), uri, RANGE)
      expect(chooserUrl()).toBe(uri)
      expect(opened).toEqual([])
    },
  )

  it('um toque pede o menu sem Ctrl; Ctrl+clique do meio ou direito não pede', () => {
    harness = linkHarness()
    const handler = linkSession(harness).terminal.options.linkHandler

    handler?.activate(mouse({ ctrlKey: true, button: 1 }), 'https://example.com/', RANGE)
    handler?.activate(mouse({ ctrlKey: true, button: 2 }), 'https://example.com/', RANGE)
    expect(chooserUrl()).toBeNull()

    const tap = { ...mouse(), sourceCapabilities: { firesTouchEvents: true } } as unknown as MouseEvent
    handler?.activate(tap, 'https://example.com/toque', RANGE)
    expect(chooserUrl()).toBe('https://example.com/toque')
  })

  /*
   * O ponto do `mousedown` é gravado pelo listener de `bindMouseSelection`,
   * preso ao `terminal.element` — que só existe depois de `terminal.open()`
   * num DOM real, e esta suíte roda sem DOM. Aqui o ponto é posto na sessão
   * como o listener o poria; o teste logo abaixo exercita o listener em si
   * contra um elemento falso.
   */
  it('Ctrl+arrastar dentro de uma URL seleciona texto e não pede o menu', () => {
    harness = linkHarness()
    const session = linkSession(harness)
    session.terminal.hasSelection = () => true

    // Desceu num ponto da URL e subiu 60 px adiante, ainda sobre ela: arrasto.
    session.linkGestureOrigin = { clientX: 100, clientY: 40 }
    session.terminal.options.linkHandler?.activate(
      mouse({ ctrlKey: true, clientX: 160, clientY: 40 }),
      'https://example.com/docs',
      RANGE,
    )
    expect(chooserUrl()).toBeNull()

    // O gesto seguinte desceu e subiu no mesmo lugar: clique, pede o menu.
    session.linkGestureOrigin = { clientX: 120, clientY: 40 }
    session.terminal.options.linkHandler?.activate(
      mouse({ ctrlKey: true, clientX: 121, clientY: 41 }),
      'https://example.com/docs',
      RANGE,
    )
    expect(chooserUrl()).toBe('https://example.com/docs')
    expect(opened).toEqual([])
  })

  it('Ctrl+clique sem arrasto pede o menu mesmo com seleção existente (o 2º clique seleciona a URL)', () => {
    harness = linkHarness()
    const session = linkSession(harness)
    // Clique simples e logo depois Ctrl+clique: o 2º `mousedown` chega com
    // `detail=2`, o xterm seleciona a palavra — a própria URL — e no `mouseup`
    // já há seleção. O gesto não andou, então é pedido de escolher.
    session.terminal.hasSelection = () => true
    session.linkGestureOrigin = { clientX: 100, clientY: 40 }

    session.terminal.options.linkHandler?.activate(
      mouse({ ctrlKey: true, clientX: 100, clientY: 40 }),
      'https://example.com/docs',
      RANGE,
    )
    expect(chooserUrl()).toBe('https://example.com/docs')
  })

  it('o mousedown do botão principal grava a origem do gesto; o de outro botão não', () => {
    const previousWindow = (globalThis as { window?: unknown }).window
    // `bindMouseSelection` consulta a plataforma antes de ligar o listener.
    ;(globalThis as { window?: unknown }).window = { navigator: { platform: 'Win32' } }
    try {
      const listeners: Array<{ type: string; listener: (event: unknown) => void }> = []
      const session: {
        linkGestureOrigin?: { clientX: number; clientY: number }
        mouseSelectionBound: boolean
        terminal: object
      } = {
        mouseSelectionBound: false,
        terminal: {
          element: {
            addEventListener: (type: string, listener: (event: unknown) => void) => {
              listeners.push({ type, listener })
            },
          },
          // Sem mouse tracking o gesto não é retido — o listener sai cedo, mas
          // só depois de gravar a origem.
          modes: { mouseTrackingMode: 'none' },
        },
      }
      const store = new TerminalSessionStore()
      ;(store as unknown as { bindMouseSelection: (session: unknown) => void }).bindMouseSelection(session)
      const onMouseDown = listeners.find((entry) => entry.type === 'mousedown')?.listener
      if (!onMouseDown) throw new Error('listener de mousedown não ligado')

      const down = (init: { button: number; clientX: number; clientY: number }) => ({
        type: 'mousedown',
        isTrusted: true,
        shiftKey: false,
        altKey: false,
        ...init,
      })

      onMouseDown(down({ button: 0, clientX: 42, clientY: 17 }))
      expect(session.linkGestureOrigin).toEqual({ clientX: 42, clientY: 17 })

      // Clique direito abre o menu, não começa gesto de link: não mexe na origem.
      onMouseDown(down({ button: 2, clientX: 300, clientY: 200 }))
      expect(session.linkGestureOrigin).toEqual({ clientX: 42, clientY: 17 })
    } finally {
      ;(globalThis as { window?: unknown }).window = previousWindow
    }
  })

  /*
   * Um toque chega ao terminal como mousedown/mouseup de verdade, marcados em
   * `sourceCapabilities.firesTouchEvents` — um dedo não tem Ctrl. Com o mouse
   * tracking ligado (Claude Code e Codex ligam), `bindMouseSelection` retém o
   * par e o devolve como sintético, e o xterm ativa o link com o mouseup que
   * recebe: o sintético. Sem DOM, o elemento, o documento e o `MouseEvent` são
   * dublês; o do `MouseEvent` faz o que o do Chromium faz com o init (cada
   * campo vira propriedade do evento, `sourceCapabilities` inclusive, e
   * `isTrusted` é falso).
   */
  it('com o mouse tracking ligado, um toque no link ainda pede o menu', () => {
    harness = linkHarness()
    const handler = linkSession(harness).terminal.options.linkHandler
    const globals = globalThis as { document?: unknown; MouseEvent?: unknown }
    const previousDocument = globals.document
    const previousMouseEvent = globals.MouseEvent
    const documentListeners = new Map<string, (event: unknown) => void>()
    const dispatched: MouseEvent[] = []

    class ScreenElement extends EventTarget {
      dispatchEvent(event: Event): boolean {
        dispatched.push(event as MouseEvent)
        return true
      }
    }
    class ChromiumMouseEvent {
      readonly isTrusted = false
      readonly type: string
      constructor(type: string, init: object) {
        Object.assign(this, init)
        this.type = type
      }
    }

    Object.assign((globalThis as { window: object }).window, {
      navigator: { platform: 'Win32' },
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    globals.document = {
      addEventListener: (type: string, listener: (event: unknown) => void) => documentListeners.set(type, listener),
      removeEventListener: (type: string) => documentListeners.delete(type),
    }
    globals.MouseEvent = ChromiumMouseEvent
    try {
      const elementListeners = new Map<string, (event: unknown) => void>()
      const session = {
        mouseSelectionBound: false,
        terminal: {
          element: {
            addEventListener: (type: string, listener: (event: unknown) => void) => {
              elementListeners.set(type, listener)
            },
          },
          modes: { mouseTrackingMode: 'vt200' },
        },
      }
      ;(harness.store as unknown as { bindMouseSelection: (session: unknown) => void }).bindMouseSelection(session)

      const screen = new ScreenElement()
      const touch = (type: string) => ({
        type,
        target: screen,
        isTrusted: true,
        button: 0,
        buttons: type === 'mousedown' ? 1 : 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        clientX: 30,
        clientY: 40,
        sourceCapabilities: { firesTouchEvents: true },
        preventDefault: () => {},
        stopImmediatePropagation: () => {},
      })

      const onMouseDown = elementListeners.get('mousedown')
      if (!onMouseDown) throw new Error('listener de mousedown não ligado')
      onMouseDown(touch('mousedown'))
      // Retido: o xterm ainda não recebeu nada, e o gesto espera o mouseup.
      expect(dispatched).toEqual([])
      const onDocumentUp = documentListeners.get('mouseup')
      if (!onDocumentUp) throw new Error('o mousedown do toque não foi retido')
      onDocumentUp(touch('mouseup'))

      expect(dispatched.map((event) => event.type)).toEqual(['mousedown', 'mouseup'])
      const replayedUp = dispatched[1]
      expect(replayedUp.isTrusted).toBe(false)
      handler?.activate(replayedUp, 'https://example.com/toque', RANGE)
      expect(chooserUrl()).toBe('https://example.com/toque')
    } finally {
      globals.document = previousDocument
      globals.MouseEvent = previousMouseEvent
    }
  })

  it('no macOS, com o mouse tracking ligado, Ctrl+clique segue direto para o xterm, como o clique direito', () => {
    // O `contextmenu` do Ctrl+clique sai já no mousedown e, sobre um link,
    // abre o menu de destino. Retido, o mousedown só chegaria ao xterm no
    // mouseup, e o xterm, que se foca a cada mousedown, tiraria o foco do menu.
    const globals = globalThis as { window?: unknown; document?: unknown }
    const previousWindow = globals.window
    const previousDocument = globals.document
    const documentListeners: string[] = []
    globals.window = { navigator: { platform: 'MacIntel' }, addEventListener: () => {}, removeEventListener: () => {} }
    globals.document = {
      addEventListener: (type: string) => documentListeners.push(type),
      removeEventListener: () => {},
    }
    try {
      const elementListeners = new Map<string, (event: unknown) => void>()
      const session = {
        mouseSelectionBound: false,
        terminal: {
          element: {
            addEventListener: (type: string, listener: (event: unknown) => void) => {
              elementListeners.set(type, listener)
            },
          },
          modes: { mouseTrackingMode: 'vt200' },
        },
      }
      const store = new TerminalSessionStore()
      ;(store as unknown as { bindMouseSelection: (session: unknown) => void }).bindMouseSelection(session)
      const onMouseDown = elementListeners.get('mousedown')
      if (!onMouseDown) throw new Error('listener de mousedown não ligado')

      /** Aperta o botão principal e diz se o store reteve o mousedown. */
      const press = (modifiers: { ctrlKey?: boolean; metaKey?: boolean }) => {
        const preventDefault = vi.fn()
        onMouseDown({
          type: 'mousedown',
          isTrusted: true,
          button: 0,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
          clientX: 30,
          clientY: 40,
          ...modifiers,
          preventDefault,
          stopImmediatePropagation: () => {},
        })
        return preventDefault.mock.calls.length > 0
      }

      expect(press({ ctrlKey: true })).toBe(false)
      expect(documentListeners).toEqual([])
      // Cmd+clique, o gesto do link no macOS, continua retido até o mouseup.
      expect(press({ metaKey: true })).toBe(true)
    } finally {
      globals.window = previousWindow
      globals.document = previousDocument
    }
  })

  it('o WebLinksAddon usa o mesmo gesto, dica e limpeza do hyperlink OSC 8', () => {
    harness = linkHarness()
    const terminal = linkSession(harness).terminal as unknown as {
      options: { linkHandler?: LinkHandler | null }
      _addonManager: { _addons: Array<{ instance: { _handler?: unknown; _options?: { hover?: unknown; leave?: unknown } } }> }
    }
    // Campos internos do xterm e do addon: é o único jeito de ver, sem DOM, qual
    // função o WebLinksAddon chama. Sem esta trava, dar ao addon um callback
    // próprio tiraria da URL em texto plano a regra de arrasto (ou o menu)
    // sem nenhum teste falhar.
    const webLinks = terminal._addonManager._addons
      .map((addon) => addon.instance)
      .find((instance) => typeof instance._handler === 'function' && instance._options)
    const handler = terminal.options.linkHandler

    expect(webLinks).toBeDefined()
    expect(webLinks?._handler).toBe(handler?.activate)
    expect(webLinks?._options?.hover).toBe(handler?.hover)
    expect(webLinks?._options?.leave).toBe(handler?.leave)
  })

  it('o hover guarda o link (e onde o ponteiro estava) para o menu, e o leave os esquece', () => {
    harness = linkHarness()
    const session = linkSession(harness)
    const handler = session.terminal.options.linkHandler

    handler?.hover?.(mouse({ clientX: 12, clientY: 34 }), 'https://example.com/', RANGE)
    expect(session.hoveredLink).toBe('https://example.com/')
    expect(session.hoveredLinkPoint).toEqual({ x: 12, y: 34 })

    // Sem limpar, um clique direito longe do link ainda abriria o menu dele.
    handler?.leave?.(mouse(), 'https://example.com/', RANGE)
    expect(session.hoveredLink).toBeUndefined()
    expect(session.hoveredLinkPoint).toBeUndefined()
  })

  describe('clique direito, toque longo e tecla de menu', () => {
    type ContextMenuInit = { clientX?: number; clientY?: number; pointerType?: string }

    /** Liga o listener de `contextmenu` a um elemento falso e devolve como dispará-lo. */
    function bindContextMenu(session: { hoveredLink?: string; hoveredLinkPoint?: { x: number; y: number } }) {
      let listener: ((event: unknown) => void) | undefined
      const fakeSession = {
        id: SESSION_ID,
        ...session,
        terminal: {
          element: {
            addEventListener: (type: string, handler: (event: unknown) => void) => {
              if (type === 'contextmenu') listener = handler
            },
            removeEventListener: () => {},
          },
          textarea: undefined,
        },
      }
      const store = new TerminalSessionStore()
      ;(store as unknown as { bindLinkContextMenu: (session: unknown) => void }).bindLinkContextMenu(fakeSession)
      return (init: ContextMenuInit) => {
        const event = {
          clientX: 0,
          clientY: 0,
          ...init,
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true
          },
          stopPropagation() {},
        }
        listener?.(event)
        return event
      }
    }

    it('sobre um link: pede o menu no ponto do clique e não deixa o menu do sistema abrir', () => {
      const fire = bindContextMenu({ hoveredLink: 'https://example.com/', hoveredLinkPoint: { x: 5, y: 6 } })
      const event = fire({ clientX: 50, clientY: 60, pointerType: 'mouse' })
      expect(event.defaultPrevented).toBe(true)
      expect(getLinkChooserState().request).toMatchObject({
        url: 'https://example.com/',
        anchor: { x: 50, y: 60 },
        sourceNodeId: SESSION_ID,
      })
    })

    it('pela tecla de menu (sem ponteiro): o menu nasce onde o ponteiro estava sobre o link', () => {
      const fire = bindContextMenu({ hoveredLink: 'https://example.com/', hoveredLinkPoint: { x: 5, y: 6 } })
      fire({ clientX: 0, clientY: 0, pointerType: '' })
      expect(getLinkChooserState().request?.anchor).toEqual({ x: 5, y: 6 })
    })

    it('longe de um link: nada muda, o terminal segue sem menu', () => {
      const fire = bindContextMenu({})
      const event = fire({ clientX: 50, clientY: 60, pointerType: 'mouse' })
      expect(event.defaultPrevented).toBe(false)
      expect(getLinkChooserState().request).toBeNull()
    })

    it('no macOS, Ctrl+clique é este clique secundário: pede o menu uma vez, não de novo no mouseup', () => {
      harness = linkHarness()
      ;(globalThis as { window: { navigator: unknown } }).window.navigator = { platform: 'MacIntel' }
      const handler = linkSession(harness).terminal.options.linkHandler

      // O Chromium no macOS entrega Ctrl+clique como `contextmenu` já no
      // mousedown, e o menu abre por aqui...
      const fire = bindContextMenu({ hoveredLink: 'https://example.com/', hoveredLinkPoint: { x: 5, y: 6 } })
      fire({ clientX: 50, clientY: 60, pointerType: 'mouse' })
      const pedido = getLinkChooserState()
      expect(pedido.request?.url).toBe('https://example.com/')

      // ...e o mouseup que vem depois chega ao xterm com o botão principal e
      // Ctrl. Pedir de novo remontaria o menu (pisca, o foco cai no body por
      // um quadro, o leitor de tela anuncia duas vezes).
      handler?.activate(mouse({ ctrlKey: true, clientX: 50, clientY: 60 }), 'https://example.com/', RANGE)
      expect(getLinkChooserState()).toBe(pedido)

      // Cmd+clique continua sendo o gesto do link no macOS.
      handler?.activate(mouse({ metaKey: true, clientX: 50, clientY: 60 }), 'https://example.com/', RANGE)
      expect(getLinkChooserState().version).toBe(pedido.version + 1)
    })
  })
})
