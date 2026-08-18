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
}

const SESSION_ID = 'terminal-1'
const PTY_SESSION_ID = `canvas:${SESSION_ID}`

function createHarness(
  initialText = CONTEXT,
  command = 'claude',
  contextFilesAvailable = true,
): Harness {
  const writes: string[] = []
  const contextBodies: string[] = []
  const dataListeners = new Set<(event: { sessionId: string; data: string }) => void>()

  ;(globalThis as { window?: unknown }).window = {
    felixo: {
      pty: {
        onData: (listener: (event: { sessionId: string; data: string }) => void) => {
          dataListeners.add(listener)
          return () => dataListeners.delete(listener)
        },
        onExit: () => () => {},
        spawn: async () => ({ ok: true, reused: false }),
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
    feed: (data: string) => {
      for (const listener of dataListeners) {
        listener({ sessionId: PTY_SESSION_ID, data })
      }
    },
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
