import { afterEach, describe, expect, it } from 'vitest'
import { TerminalSessionStore } from './terminal-session-store'
import { toSubmittedTerminalText } from './terminal-input'
import {
  createCatalogPromptInsertion,
  createFilePromptInsertion,
  createSkillPromptInsertion,
  resolvePromptDisplayLabel,
  stripPromptSubmission,
  toPromptInsertionMetadata,
  type PromptInsertion,
  type PromptInsertionMetadata,
} from '../../shared/types/prompt-insertion'
import { composeSelectedPromptInsertion } from '../services/prompt-composition'
import { buildSkillActivationPrompt } from '../services/skill-prompt'
import { buildFileLinkPrompt, DEFAULT_FILE_LINK_PROMPT } from '../services/file-link-prompt'
import type { ContextFileKind } from '../services/context-file-delivery'
import { describeCombinedInsertFeedback, toActivationResult } from '../services/prompt-delivery-feedback'
import { toPersistedNode } from '../hooks/useCanvasPersistence'
import type { AutomationDefinition } from '../../shared/types/automations'

/**
 * As origens de prompt de ponta a ponta no store, com a ponte de PTY falsa e o
 * xterm de verdade: catálogo, combinação, skill, link de arquivo do canvas e
 * texto digitado pela pessoa. Cada origem passa pelo mesmo `sendText` que o
 * canvas chama (`CanvasView.insertPrompt`, `activateSkill`,
 * `announceFileNodeToTerminalNode`), e o teste olha o que chega ao PTY e ao
 * arquivo de contexto, o que o cartão mostraria (`resolvePromptDisplayLabel`,
 * a mesma função do `TerminalNode`) e o que vai para o disco
 * (`toPersistedNode`). O painel e a tela ficam com o smoke do app
 * (`scripts/canvas-smoke-prompts.cjs`).
 */

const ID = 'terminal-prompts'
const TIMESTAMP = '2026-09-30T18:00:00.000Z'
const COMMAND_PATH = '/home/ana/Meus apps/felixo/bin/felixo'
const SCRATCHPAD_PATH = '/home/ana/Área de trabalho/canvas files/notas do time.md'

type ContextWrite = { kind: ContextFileKind; insertion?: PromptInsertionMetadata; content: string }

type Harness = {
  store: TerminalSessionStore
  /** Tudo o que foi escrito no PTY, na ordem (inclusive as teclas). */
  ptyWrites: string[]
  contextWrites: ContextWrite[]
  /** `ok`: o arquivo de contexto é gravado; `falha`: a ponte recusa (fallback inline). */
  setContextFiles: (mode: 'ok' | 'falha') => void
  /** Próximas respostas do `pty.write` (uma por escrita; depois volta a confirmar). */
  queuePtyWriteResults: (...results: Array<{ ok: boolean; delivered?: boolean }>) => void
  /** Teclas da pessoa, como o xterm as entrega ao `onData`. */
  type: (data: string) => void
}

let harness: Harness | undefined

afterEach(() => {
  harness?.store.clear()
  harness = undefined
  delete (globalThis as { window?: unknown }).window
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function createHarness(): Promise<Harness> {
  const ptyWrites: string[] = []
  const contextWrites: ContextWrite[] = []
  let contextMode: 'ok' | 'falha' = 'ok'
  const writeResults: Array<{ ok: boolean; delivered?: boolean }> = []

  ;(globalThis as { window?: unknown }).window = {
    navigator: { platform: 'Linux x86_64' },
    felixo: {
      pty: {
        onData: () => () => {},
        onExit: () => () => {},
        onSession: () => () => {},
        spawn: async () => ({ ok: true, reused: false }),
        write: async ({ data }: { data: string }) => {
          ptyWrites.push(data)
          return writeResults.shift() ?? { ok: true, delivered: true }
        },
        resize: async () => ({ ok: true }),
        kill: async () => ({ ok: true }),
      },
      contextFiles: {
        write: async (params: ContextWrite) => {
          if (contextMode === 'falha') return { ok: false, message: 'diretório de contexto indisponível' }
          contextWrites.push({ kind: params.kind, insertion: params.insertion, content: params.content })
          return { ok: true, name: `felixo-context-${contextWrites.length}-${params.kind}.txt`, commandPath: COMMAND_PATH }
        },
        release: async () => ({ ok: true }),
        markPathTyped: async () => ({ ok: true }),
      },
      qaLogger: { log: async () => ({ ok: true }) },
    },
  }

  const store = new TerminalSessionStore()
  store.ensure(ID, { command: 'claude', args: [], cwd: '/tmp/projeto', initialText: '' })
  await flush()
  await flush()

  const terminalOf = () =>
    (store as unknown as { sessions: Map<string, { terminal: { input: (data: string, user?: boolean) => void } }> })
      .sessions.get(ID)!.terminal

  return {
    store,
    ptyWrites,
    contextWrites,
    setContextFiles: (mode) => {
      contextMode = mode
    },
    queuePtyWriteResults: (...results) => writeResults.push(...results),
    type: (data) => terminalOf().input(data, true),
  }
}

/** O que o cartão do bloco mostraria agora, pela mesma função do `TerminalNode`. */
function cardLabel(h: Harness): string | undefined {
  const snapshot = h.store.getSnapshot(ID)
  return resolvePromptDisplayLabel(snapshot?.lastPrompt, snapshot?.lastPromptInsertion)?.label
}

/** Metadata estável para snapshot: o ID gerado do texto manual vira um marcador. */
function stableMetadata(insertion: PromptInsertion | undefined) {
  if (!insertion) return undefined
  const metadata = toPromptInsertionMetadata(insertion)
  return { ...metadata, id: metadata.source === 'manual' ? '<gerado>' : metadata.id }
}

function countSubmissions(text: string): number {
  return (text.match(/\r/g) ?? []).length
}

const REVIEW: AutomationDefinition = {
  id: 'catalog-revisao',
  name: 'Revisão de PR',
  description: '',
  prompt: 'Revise o diff com atenção a segurança.\nListe riscos antes de sugerir mudanças.',
  scope: 'code',
}
const TESTS: AutomationDefinition = { ...REVIEW, id: 'catalog-testes', name: 'Testes primeiro', prompt: 'Escreva o teste que falha antes.' }
const EMPTY: AutomationDefinition = { ...REVIEW, id: 'catalog-vazio', name: 'Vazio', prompt: '   ' }
const SKILL = {
  id: 'skill-revisor',
  name: 'Revisor sênior',
  description: 'Revisa com o padrão do Felixo',
  path: '/home/ana/Meus apps/skills/revisor/SKILL.md',
  source: 'user' as const,
}

type Origin = {
  label: string
  kind: ContextFileKind
  /** O que o cartão deve mostrar. */
  expectedLabel: string
  build: () => { text: string; insertion: PromptInsertion }
}

const ORIGINS: Origin[] = [
  {
    label: 'catálogo',
    kind: 'catalog-prompt',
    expectedLabel: 'Revisão de PR',
    build: () => {
      const insertion = createCatalogPromptInsertion(REVIEW, REVIEW.prompt, { autoSubmit: true, timestamp: TIMESTAMP })
      return { text: toSubmittedTerminalText(insertion.content), insertion }
    },
  },
  {
    label: 'combinação',
    kind: 'catalog-prompt',
    expectedLabel: 'Revisão de PR, Testes primeiro',
    build: () => {
      const insertion = composeSelectedPromptInsertion([REVIEW, TESTS], { timestamp: TIMESTAMP })
      return { text: toSubmittedTerminalText(insertion.content), insertion }
    },
  },
  {
    label: 'skill',
    kind: 'skill-prompt',
    expectedLabel: 'Revisor sênior',
    build: () => {
      const text = buildSkillActivationPrompt(SKILL)
      return { text, insertion: createSkillPromptInsertion(SKILL, text, { autoSubmit: true, timestamp: TIMESTAMP }) }
    },
  },
  {
    label: 'arquivo do canvas',
    kind: 'scratchpad-link',
    expectedLabel: 'notas do time.md',
    build: () => {
      const text = buildFileLinkPrompt(DEFAULT_FILE_LINK_PROMPT, SCRATCHPAD_PATH, 'Agente 1')
      return { text, insertion: createFilePromptInsertion('notas do time.md', text, { autoSubmit: true, timestamp: TIMESTAMP }) }
    },
  },
]

describe('origens de prompt: entrega pelo arquivo de contexto', () => {
  it.each(ORIGINS)('$label: corpo intacto no arquivo, uma entrega, um Enter e o nome certo no cartão', async (origin) => {
    harness = await createHarness()
    const { text, insertion } = origin.build()

    const result = await harness.store.sendText(ID, text, { kind: origin.kind, insertion })

    expect(result).toEqual({ delivered: true })
    expect(toActivationResult(result)).toBe('sent')
    // O corpo vai byte a byte para o arquivo; a metadata que o acompanha não leva o corpo.
    expect(harness.contextWrites).toHaveLength(1)
    expect(harness.contextWrites[0].kind).toBe(origin.kind)
    expect(harness.contextWrites[0].content).toBe(stripPromptSubmission(text))
    expect(harness.contextWrites[0].insertion).not.toHaveProperty('content')
    // O PTY recebe só a referência, com o caminho do `felixo` entre aspas e um Enter só.
    expect(harness.ptyWrites).toHaveLength(1)
    const written = harness.ptyWrites[0]
    expect(written).toContain(`Leia com: "${COMMAND_PATH}" context read "felixo-context-1-${origin.kind}.txt"`)
    expect(countSubmissions(written)).toBe(1)
    expect(written.endsWith('\r')).toBe(true)
    // O cartão mostra o nome, não a referência do arquivo.
    expect(cardLabel(harness)).toBe(origin.expectedLabel)
    expect(stableMetadata(harness.store.getSnapshot(ID)?.lastPromptInsertion)).toMatchSnapshot()
  })

  it('texto digitado pela pessoa: sem nome inventado, o próprio texto no cartão', async () => {
    harness = await createHarness()
    harness.type('corrija o teste de Unicode ✓\r')

    const snapshot = harness.store.getSnapshot(ID)
    expect(snapshot?.lastPromptInsertion).toMatchObject({ source: 'manual', combinedNames: [], autoSubmit: true })
    expect(snapshot?.lastPromptInsertion).not.toHaveProperty('name')
    expect(cardLabel(harness)).toBe('corrija o teste de Unicode ✓')
    // Tecla vai crua ao PTY: nada de arquivo de contexto.
    expect(harness.contextWrites).toHaveLength(0)
  })
})

describe('fallback inline', () => {
  it.each(ORIGINS)('$label: mesma metadata do caminho normal, aviso no bloco e resultado próprio', async (origin) => {
    harness = await createHarness()
    const { text, insertion } = origin.build()
    await harness.store.sendText(ID, text, { kind: origin.kind, insertion })
    const normal = stableMetadata(harness.store.getSnapshot(ID)?.lastPromptInsertion)

    harness.store.clear()
    harness = await createHarness()
    harness.setContextFiles('falha')
    const result = await harness.store.sendText(ID, text, { kind: origin.kind, insertion })

    expect(result).toEqual({ delivered: true, inline: true })
    expect(toActivationResult(result)).toBe('sent-inline')
    const written = harness.ptyWrites[0]
    expect(written.startsWith('AVISO DO FELIXO AI CORE')).toBe(true)
    expect(written).toContain(stripPromptSubmission(text))
    expect(countSubmissions(written)).toBe(1)
    expect(harness.store.getSnapshot(ID)?.contextWarning).toContain('fallback inline')
    expect(stableMetadata(harness.store.getSnapshot(ID)?.lastPromptInsertion)).toEqual(normal)
    expect(cardLabel(harness)).toBe(origin.expectedLabel)
  })
})

describe('combinação', () => {
  it('preserva a ordem, repete nomes repetidos e não conta prompt vazio', async () => {
    harness = await createHarness()
    const insertion = composeSelectedPromptInsertion([TESTS, EMPTY, REVIEW, TESTS], { timestamp: TIMESTAMP })
    await harness.store.sendText(ID, toSubmittedTerminalText(insertion.content), { kind: 'catalog-prompt', insertion })

    const body = harness.contextWrites[0].content
    const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual(['Testes primeiro', 'Revisão de PR', 'Testes primeiro'])
    expect(body).not.toContain('## Vazio')
    expect(harness.store.getSnapshot(ID)?.lastPromptInsertion?.combinedNames).toEqual([
      'Testes primeiro',
      'Revisão de PR',
      'Testes primeiro',
    ])
    expect(cardLabel(harness)).toBe('Testes primeiro, Revisão de PR, Testes primeiro')
    // O painel conta o que entrou no texto (3), não o que estava marcado (4).
    expect(describeCombinedInsertFeedback('sent', insertion.combinedNames.length).text).toBe(
      '3 prompts combinados e enviados.',
    )
  })
})

describe('conteúdo difícil', () => {
  it('Unicode, quebras de linha e um prompt enorme chegam intactos ao arquivo, e o PTY só vê a referência', async () => {
    harness = await createHarness()
    const huge = `# Revisão 日本語 🚀\n\n${'linha com acentuação é ç ã õ\r\n'.repeat(8000)}fim\n`
    const prompt = { ...REVIEW, name: 'Revisão ✓ 日本語 🚀', prompt: huge }
    const insertion = createCatalogPromptInsertion(prompt, prompt.prompt, { autoSubmit: true, timestamp: TIMESTAMP })

    await harness.store.sendText(ID, toSubmittedTerminalText(insertion.content), { kind: 'catalog-prompt', insertion })

    expect(harness.contextWrites[0].content).toBe(stripPromptSubmission(huge))
    expect(harness.ptyWrites[0].length).toBeLessThan(2000)
    expect(countSubmissions(harness.ptyWrites[0])).toBe(1)
    expect(cardLabel(harness)).toBe('Revisão ✓ 日本語 🚀')
  })

  it('prompt do catálogo sem nome: o cartão diz a origem, nunca a referência do arquivo', async () => {
    harness = await createHarness()
    const nameless = { ...REVIEW, name: '   ' }
    const insertion = createCatalogPromptInsertion(nameless, nameless.prompt, { autoSubmit: true, timestamp: TIMESTAMP })

    await harness.store.sendText(ID, toSubmittedTerminalText(insertion.content), { kind: 'catalog-prompt', insertion })

    expect(harness.store.getSnapshot(ID)?.lastPromptInsertion).not.toHaveProperty('name')
    expect(cardLabel(harness)).toBe('Prompt do catálogo')
    expect(harness.store.getSnapshot(ID)?.lastPrompt).toContain('CONTEXTO ENTREGUE EM ARQUIVOS')
  })

  it('caminho de arquivo e de pasta com espaço saem entre aspas no texto entregue', async () => {
    harness = await createHarness()
    const skill = { ...SKILL, path: 'C:\\Users\\Ana Maria\\skills\\revisor\\SKILL.md' }
    const text = buildSkillActivationPrompt(skill)
    await harness.store.sendText(ID, text, {
      kind: 'skill-prompt',
      insertion: createSkillPromptInsertion(skill, text, { autoSubmit: true, timestamp: TIMESTAMP }),
    })
    const link = buildFileLinkPrompt(DEFAULT_FILE_LINK_PROMPT, SCRATCHPAD_PATH, 'Agente 1')
    await harness.store.sendText(ID, link, {
      kind: 'scratchpad-link',
      insertion: createFilePromptInsertion('notas do time.md', link, { autoSubmit: true, timestamp: TIMESTAMP }),
    })

    // Aspas literais, e não `quotePromptPath`: o teste não pode se validar com a própria função.
    expect(harness.contextWrites[0].content).toContain(`"${skill.path}"`)
    expect(harness.contextWrites[1].content).toContain(`"${SCRATCHPAD_PATH}"`)
    expect(harness.contextWrites[1].content.split(`"${SCRATCHPAD_PATH}"`).join('')).not.toContain(SCRATCHPAD_PATH)
  })
})

describe('repetição, cancelamento, nova tentativa e reinício', () => {
  it('o mesmo prompt duas vezes seguidas: duas entregas em ordem, um Enter cada, nunca intercaladas', async () => {
    harness = await createHarness()
    const { text, insertion } = ORIGINS[0].build()

    const [first, second] = await Promise.all([
      harness.store.sendText(ID, text, { kind: 'catalog-prompt', insertion }),
      harness.store.sendText(ID, text, { kind: 'catalog-prompt', insertion }),
    ])

    expect([first, second]).toEqual([{ delivered: true }, { delivered: true }])
    expect(harness.ptyWrites).toHaveLength(2)
    expect(harness.ptyWrites[0]).toContain('felixo-context-1-catalog-prompt.txt')
    expect(harness.ptyWrites[1]).toContain('felixo-context-2-catalog-prompt.txt')
    expect(harness.ptyWrites.map(countSubmissions)).toEqual([1, 1])
  })

  it('prompt só digitado (sem Enter) e depois trocado pela pessoa: o cartão mostra o que ela enviou', async () => {
    harness = await createHarness()
    const insertion = createCatalogPromptInsertion(REVIEW, REVIEW.prompt, { autoSubmit: false, timestamp: TIMESTAMP })

    await harness.store.sendText(ID, insertion.content, { kind: 'catalog-prompt', insertion })
    expect(countSubmissions(harness.ptyWrites[0])).toBe(0)
    expect(cardLabel(harness)).toBe('Revisão de PR')

    // A pessoa apaga e escreve outro pedido: o nome do catálogo não fica com ele.
    harness.type('\x7f')
    harness.type('outro pedido\r')
    expect(harness.store.getSnapshot(ID)?.lastPromptInsertion).toMatchObject({ source: 'manual' })
    expect(cardLabel(harness)).toBe('outro pedido')
  })

  it('bloco removido com a entrega na fila: nada é escrito e a resposta diz por quê', async () => {
    harness = await createHarness()
    const { text, insertion } = ORIGINS[0].build()
    const pending = harness.store.sendText(ID, text, { kind: 'catalog-prompt', insertion })
    harness.store.remove(ID)

    expect(await pending).toEqual({ delivered: false, reason: 'no-session' })
    expect(harness.ptyWrites.filter((data) => data.includes('context read'))).toHaveLength(0)
  })

  it('PTY recusa a primeira escrita: falha visível, nada registrado, e a nova tentativa entrega uma vez só', async () => {
    harness = await createHarness()
    const { text, insertion } = ORIGINS[0].build()
    harness.queuePtyWriteResults({ ok: false })

    const failed = await harness.store.sendText(ID, text, { kind: 'catalog-prompt', insertion })
    expect(failed).toMatchObject({ delivered: false, reason: 'rejected' })
    expect(toActivationResult(failed)).toBe('failed')
    expect(harness.store.getSnapshot(ID)?.lastPromptInsertion).toBeUndefined()
    expect(cardLabel(harness)).toBeUndefined()

    const retried = await harness.store.sendText(ID, text, { kind: 'catalog-prompt', insertion })
    expect(retried).toEqual({ delivered: true })
    expect(harness.ptyWrites.map(countSubmissions)).toEqual([1, 1])
    expect(cardLabel(harness)).toBe('Revisão de PR')
  })

  it('reinício: o prompt anterior não é reenviado, e o disco guarda só a metadata', async () => {
    harness = await createHarness()
    const { text, insertion } = ORIGINS[2].build()
    await harness.store.sendText(ID, text, { kind: 'skill-prompt', insertion })
    const live = harness.store.getSnapshot(ID)?.lastPromptInsertion

    // O que o canvas grava do bloco: a inserção sem o corpo.
    const persisted = toPersistedNode({
      id: ID,
      type: 'terminal',
      position: { x: 0, y: 0 },
      data: { label: 'Agente', command: 'claude', lastPromptInsertion: live },
    } as never)
    expect(persisted.data.lastPromptInsertion).toEqual(toPromptInsertionMetadata(live!))
    expect(persisted.data.lastPromptInsertion).not.toHaveProperty('content')

    const writesBefore = harness.ptyWrites.length
    harness.store.restart(ID, { command: 'claude', args: [], cwd: '/tmp/projeto', initialText: '' })
    await flush()
    await flush()

    expect(harness.ptyWrites.slice(writesBefore).filter((data) => data.includes('context read'))).toHaveLength(0)
    expect(harness.store.getSnapshot(ID)?.lastPromptInsertion).toBeUndefined()
    // Depois do reinício, os detalhes do bloco ainda sabem o que foi o último prompt.
    expect(resolvePromptDisplayLabel('referência anterior', persisted.data.lastPromptInsertion as PromptInsertionMetadata)?.label).toBe(
      'Revisor sênior',
    )
  })
})
