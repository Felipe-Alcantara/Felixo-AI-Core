import { describe, expect, it, vi } from 'vitest'
import {
  applyClaudeApiEvent,
  createConversation,
  formatUsd,
  fromPersisted,
  permissionAnswered,
  summarizeToolInput,
  toPersisted,
  userSent,
} from './claude-api-conversation'
import { createClaudeApiConversationStore } from './claude-api-conversation-store'
import type { ClaudeApiBridge, ClaudeApiEvent } from '../../shared/types/claude-api'

function run(events: ClaudeApiEvent[], start = userSent(createConversation(), 'oi')) {
  return events.reduce(applyClaudeApiEvent, start)
}

describe('conversa do Claude por chave de API', () => {
  it('monta a resposta pelos deltas e fecha na mensagem completa', () => {
    let state = run([
      { kind: 'ready', claudeSessionId: '1b763539-ed0a-41c1-af33-b54382ca6328', model: 'm', apiKeySource: 'ANTHROPIC_API_KEY' },
      { kind: 'text-delta', text: 'Ol' },
      { kind: 'text-delta', text: 'á' },
    ])
    expect(state.status).toBe('working')
    expect(state.streamingText).toBe('Olá')
    state = run([{ kind: 'assistant-message', messageId: 'm1', blocks: [{ type: 'text', text: 'Olá!' }] }], state)
    expect(state.streamingText).toBe('')
    expect(state.items.map((item) => item.role)).toEqual(['user', 'assistant'])
    state = run(
      [{ kind: 'turn-end', isError: false, interrupted: false, errorKind: null, resultText: '', costUsd: 0.0021, durationMs: 1 }],
      state,
    )
    expect(state.status).toBe('idle')
    expect(state.totalCostUsd).toBe(0.0021)
    expect(state.claudeSessionId).toBe('1b763539-ed0a-41c1-af33-b54382ca6328')
  })

  it('ferramenta aparece com resumo e recebe o resultado depois', () => {
    const state = run([
      {
        kind: 'assistant-message',
        messageId: 'm',
        blocks: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }],
      },
      { kind: 'tool-result', toolUseId: 't1', isError: true, text: 'falhou' },
    ])
    expect(state.items[1]).toMatchObject({ role: 'tool', name: 'Bash', summary: 'npm test', result: 'falhou', isError: true })
  })

  it('pedido de permissão segura o estado até a resposta; negar marca a ferramenta', () => {
    let state = run([
      { kind: 'assistant-message', messageId: 'm', blocks: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/p/a.txt' } }] },
      { kind: 'permission-request', requestId: 'r1', toolName: 'Write', toolUseId: 't1', description: 'a.txt', input: { file_path: '/p/a.txt' } },
    ])
    expect(state.status).toBe('waiting-permission')
    expect(state.permissions[0].summary).toBe('/p/a.txt')
    state = permissionAnswered(state, 'r1', false)
    expect(state.permissions).toEqual([])
    expect(state.status).toBe('working')
    expect(state.items[1]).toMatchObject({ denied: true })
  })

  it('erro de saldo vira explicação, sem duplicar o aviso sintético', () => {
    const state = run([
      { kind: 'notice', text: 'Credit balance is too low', errorKind: 'credit' },
      { kind: 'turn-end', isError: true, interrupted: false, errorKind: 'credit', resultText: 'Credit balance is too low', costUsd: 0, durationMs: null },
    ])
    const notices = state.items.filter((item) => item.role === 'notice')
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ tone: 'error' })
    expect((notices[0] as { text: string }).text).toMatch(/Sem saldo/)
  })

  it('interrupção e queda do processo terminam o turno', () => {
    const interrompido = run([
      { kind: 'turn-end', isError: false, interrupted: true, errorKind: null, resultText: '', costUsd: 0, durationMs: null },
    ])
    expect(interrompido.items.at(-1)).toMatchObject({ role: 'notice', text: 'Interrompido.' })
    const caiu = run([{ kind: 'process-exit', code: 1, message: 'O Claude Code encerrou.' }])
    expect(caiu.status).toBe('idle')
    expect(caiu.items.at(-1)).toMatchObject({ tone: 'error' })
  })

  it('persistência guarda só o necessário e ignora lixo ao ler', () => {
    const state = run([
      { kind: 'ready', claudeSessionId: '1b763539-ed0a-41c1-af33-b54382ca6328', model: null, apiKeySource: null },
      { kind: 'permission-request', requestId: 'r', toolName: 'Bash', toolUseId: null, description: '', input: {} },
    ])
    const persisted = toPersisted(state)
    expect(Object.keys(persisted).sort()).toEqual(['claudeSessionId', 'items', 'seq', 'totalCostUsd'])
    const loaded = fromPersisted({ ...persisted, items: [...persisted.items, { role: 'hacker' }], claudeSessionId: '../x' })
    expect(loaded.items).toHaveLength(1)
    expect(loaded.claudeSessionId).toBeNull()
    expect(loaded.status).toBe('idle')
    expect(fromPersisted(null).items).toEqual([])
  })

  it('resumos e valores', () => {
    expect(summarizeToolInput('Grep', { pattern: 'foo', path: 'src' })).toBe('foo em src')
    expect(summarizeToolInput('Desconhecida', { x: 'abc' })).toBe('abc')
    expect(formatUsd(0)).toBe('US$ 0,00')
    expect(formatUsd(0.0021)).toBe('US$ 0,0021')
    expect(formatUsd(1.5)).toBe('US$ 1,50')
  })
})

describe('store das conversas', () => {
  function fakeBridge(overrides: Partial<ClaudeApiBridge> = {}) {
    let listener: ((payload: { sessionId: string; event: ClaudeApiEvent }) => void) | null = null
    const bridge: ClaudeApiBridge = {
      start: vi.fn(async () => ({ ok: true })),
      send: vi.fn(async () => ({ ok: true })),
      respondPermission: vi.fn(async () => ({ ok: true })),
      interrupt: vi.fn(async () => ({ ok: true })),
      stop: vi.fn(async () => ({ ok: true })),
      onEvent: (callback) => {
        listener = callback
        return () => {
          listener = null
        }
      },
      ...overrides,
    }
    return { bridge, emit: (sessionId: string, event: ClaudeApiEvent) => listener?.({ sessionId, event }) }
  }

  it('envia com o id da sessão anterior para retomar e persiste a resposta', async () => {
    const { bridge, emit } = fakeBridge()
    const store = createClaudeApiConversationStore(() => bridge)
    const persisted: unknown[] = []
    store.onPersist((_id, value) => persisted.push(value))
    store.hydrate('b', { items: [], claudeSessionId: '1b763539-ed0a-41c1-af33-b54382ca6328', totalCostUsd: 0.5, seq: 3 })
    await store.send('b', 'oi', { accountId: 'c', cwd: '/p', yolo: true })
    expect(bridge.start).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'b', resumeSessionId: '1b763539-ed0a-41c1-af33-b54382ca6328', yolo: true }),
    )
    emit('b', { kind: 'text-delta', text: 'x' })
    const before = persisted.length
    emit('b', { kind: 'assistant-message', messageId: null, blocks: [{ type: 'text', text: 'xy' }] })
    expect(persisted.length).toBe(before + 1)
    expect(store.get('b').items.map((item) => item.role)).toEqual(['user', 'assistant'])
    emit('outro', { kind: 'text-delta', text: 'ignorado' })
    expect(store.has('outro')).toBe(false)
  })

  it('falha ao abrir vira aviso no bloco', async () => {
    const { bridge } = fakeBridge({ start: vi.fn(async () => ({ ok: false, message: 'Conta sem chave.' })) })
    const store = createClaudeApiConversationStore(() => bridge)
    store.hydrate('b', null)
    expect(await store.send('b', 'oi', { accountId: 'c', cwd: '/p' })).toBe(false)
    expect(store.get('b').items.at(-1)).toMatchObject({ role: 'notice', text: 'Conta sem chave.' })
    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('responder permissão manda a entrada original; remover o bloco encerra o processo', async () => {
    const { bridge, emit } = fakeBridge()
    const store = createClaudeApiConversationStore(() => bridge)
    store.hydrate('b', null)
    emit('b', { kind: 'permission-request', requestId: 'r', toolName: 'Bash', toolUseId: null, description: '', input: { command: 'ls' } })
    await store.answerPermission('b', 'r', true)
    expect(bridge.respondPermission).toHaveBeenCalledWith({ sessionId: 'b', requestId: 'r', allow: true, input: { command: 'ls' } })
    store.dispose('b')
    expect(bridge.stop).toHaveBeenCalledWith('b')
    expect(store.has('b')).toBe(false)
  })
})
