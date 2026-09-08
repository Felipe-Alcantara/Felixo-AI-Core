import { afterEach, describe, expect, it } from 'vitest'
import { buildAgentArgs } from '../services/agent-launch-options'
import { buildOpeniaRunArgs } from '../services/openia-launch-config'
import {
  buildCanvasTerminalInitialText,
  isTerminalInitialTextReady,
  resolveTerminalInitialText,
} from '../services/quality-standard-prompt'
import { canResumeAgentSession } from '../services/agent-session'
import { TerminalSessionStore } from './terminal-session-store'

// O manager é CommonJS porque é o mesmo módulo carregado pelo processo Electron.
// O Vitest não precisa (nem deve) carregar o binding nativo: o factory abaixo
// injeta o PTY determinístico no ponto que a produção injeta node-pty.
// @ts-expect-error O módulo CommonJS do processo principal não possui declaração TS.
import { PtyProcessManager as PtyProcessManagerRuntime } from '../../../../electron/services/pty-process-manager.cjs'

const PtyProcessManager = PtyProcessManagerRuntime as unknown as new (
  options: Record<string, unknown>,
) => PtyProcessManagerContract

const CONTEXT_HEADER = 'CONTEXTO ENTREGUE EM ARQUIVOS SOMENTE LEITURA'
const EXPLICIT_PROMPT = 'pedido explícito depois do contexto'
const TEST_CWD =
  (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.'
let nextFakePid = 40_000

type DataEvent = { sessionId: string; data: string }
type ExitEvent = { sessionId: string; exitCode: number; signal?: number }
type SessionEvent = { sessionId: string; ptySessionId?: string }

type PtyHandle = {
  pid: number
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
  onData: (listener: (data: string) => void) => void
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => void
}

type PtyProcessManagerContract = {
  spawn: (sessionId: string, options: Record<string, unknown>) => PtyHandle
  has: (sessionId: string) => boolean
  write: (sessionId: string, data: string) => boolean
  aguardarEscritas: (sessionId: string) => Promise<void>
  killAll: (options?: { force?: boolean }) => void
}

type LaunchProfile = {
  sessionId: string
  command?: string
  args: string[]
  cwd: string
  initialText?: string
  accountId?: string
  providerId?: string
  sourceLabel: string
}

type FakeWrite = {
  kind: 'context' | 'context-submitted' | 'prompt' | 'newline' | 'decision'
  data: string
}

/**
 * Processo fake mínimo: não interpreta prompts nem decide quando o store pode
 * escrever. Ele só registra os bytes que o `PtyProcessManager` entrega e
 * desenha uma linha de entrada para o store real reconhecer.
 */
class DeterministicFakePty implements PtyHandle {
  readonly pid = nextFakePid++
  readonly written: string[] = []
  readonly events: FakeWrite[] = []
  readonly executions: Array<{ kind: 'context' | 'user'; data: string }> = []
  private readonly profile: LaunchProfile
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(
    event: { exitCode: number; signal?: number },
  ) => void>()
  private pendingPrompt = ''

  constructor(profile: LaunchProfile) {
    this.profile = profile
    // O callback só é executado depois de o manager assinar onData, como
    // aconteceria com a primeira saída de um processo PTY real.
    queueMicrotask(() => this.emit(this.readyScreen()))
  }

  write(data: string): void {
    const text = String(data)
    this.written.push(text)

    if (text.includes(CONTEXT_HEADER)) {
      const submitted = /(?:\r|\n)$/.test(text)
      this.events.push({ kind: submitted ? 'context-submitted' : 'context', data: text })
      if (submitted) {
        this.executions.push({ kind: 'context', data: text })
      }
      // A confirmação visual torna a reconferência do store determinística e
      // impede uma segunda escrita de contexto no teste.
      const promptMarker = this.profile.command === 'codex'
        ? '\u203a'
        : this.profile.command === 'claude'
          ? '\u276f'
          : '>'
      this.emit(`\r\n${promptMarker} ${CONTEXT_HEADER}\r\n`)
      return
    }

    if (text.startsWith('\x1b')) {
      this.events.push({ kind: 'decision', data: text })
      return
    }

    if (text === '\r' || text === '\n') {
      this.events.push({ kind: text === '\r' ? 'newline' : 'prompt', data: text })
      if (text === '\r') {
        this.executions.push({ kind: 'user', data: this.pendingPrompt })
        this.pendingPrompt = ''
      }
      return
    }

    if (text.endsWith('\r')) {
      const prompt = text.slice(0, -1)
      this.events.push({ kind: 'prompt', data: prompt })
      this.events.push({ kind: 'newline', data: '\r' })
      this.executions.push({ kind: 'user', data: this.pendingPrompt + prompt })
      this.pendingPrompt = ''
      return
    }

    this.events.push({ kind: 'prompt', data: text })
    this.pendingPrompt += text
  }

  resize(): void {}

  kill(): void {
    // O manager faz o cleanup da entrada. O fake não encerra por conta própria,
    // porque um terminal real continua vivo enquanto o card está montado.
  }

  onData(listener: (data: string) => void): void {
    this.dataListeners.add(listener)
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.add(listener)
  }

  private emit(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data)
    }
  }

  private readyScreen(): string {
    if (this.profile.command === 'codex') {
      return '\r\n\u203a entrada pronta\r\n'
    }
    if (this.profile.command === 'claude') {
      return '\r\n\u276f entrada pronta\r\n'
    }
    return `\r\n${this.profile.command ?? 'shell'} fake pronto\r\n`
  }
}

type E2EHarness = {
  manager: PtyProcessManagerContract
  fakes: Map<string, DeterministicFakePty>
  profiles: Map<string, LaunchProfile>
  spawnRequests: Array<{
    sessionId: string
    command?: string
    args: string[]
    cwd?: string
    accountId?: string
    providerId?: string
  }>
  contextBodies: string[]
  write: (sessionId: string, data: string) => Promise<void>
  installProfile: (profile: LaunchProfile) => void
  dispose: () => void
}

function createHarness(): E2EHarness {
  const previousWindow = (globalThis as { window?: unknown }).window
  const profiles = new Map<string, LaunchProfile>()
  const fakes = new Map<string, DeterministicFakePty>()
  const contextBodies: string[] = []
  const spawnRequests: E2EHarness['spawnRequests'] = []
  const dataListeners = new Set<(event: DataEvent) => void>()
  const exitListeners = new Set<(event: ExitEvent) => void>()
  const sessionListeners = new Set<(event: SessionEvent) => void>()

  let profileBeingSpawned: LaunchProfile | undefined

  const manager = new PtyProcessManager({
    discoverAgentSession: () => null,
    logger: { warn: () => {} },
    spawnPty: () => {
      if (!profileBeingSpawned) {
        throw new Error('O teste tentou criar um PTY sem um perfil de lançamento.')
      }
      const fake = new DeterministicFakePty(profileBeingSpawned)
      fakes.set(profileBeingSpawned.sessionId, fake)
      return fake
    },
  })

  const pty = {
    onData: (listener: (event: DataEvent) => void) => {
      dataListeners.add(listener)
      return () => dataListeners.delete(listener)
    },
    onExit: (listener: (event: ExitEvent) => void) => {
      exitListeners.add(listener)
      return () => exitListeners.delete(listener)
    },
    onSession: (listener: (event: SessionEvent) => void) => {
      sessionListeners.add(listener)
      return () => sessionListeners.delete(listener)
    },
    spawn: async (request: {
      sessionId: string
      command?: string
      args?: string[]
      cwd?: string
      accountId?: string
      providerId?: string
      cols?: number
      rows?: number
      reuseExisting?: boolean
    }) => {
      const logicalSessionId = request.sessionId.replace(/^canvas:/, '')
      const profile = profiles.get(logicalSessionId)
      if (!profile) {
        throw new Error(`Perfil ausente para ${request.sessionId}.`)
      }

      const reused = manager.has(request.sessionId)
      profileBeingSpawned = profile
      spawnRequests.push({
        sessionId: logicalSessionId,
        command: request.command,
        args: [...(request.args ?? [])],
        cwd: request.cwd,
        accountId: request.accountId,
        providerId: request.providerId,
      })
      try {
        manager.spawn(request.sessionId, {
          command: request.command,
          args: request.args,
          cwd: request.cwd,
          cols: request.cols,
          rows: request.rows,
          accountId: request.accountId,
          providerId: request.providerId,
          reuseExisting: request.reuseExisting,
          onData: (data: string) => {
            for (const listener of dataListeners) {
              listener({ sessionId: request.sessionId, data })
            }
          },
          onExit: (event: { exitCode: number; signal?: number }) => {
            for (const listener of exitListeners) {
              listener({ sessionId: request.sessionId, ...event })
            }
          },
          onSession: (event: SessionEvent) => {
            for (const listener of sessionListeners) listener(event)
          },
        })
      } finally {
        profileBeingSpawned = undefined
      }
      return { ok: true, reused }
    },
    write: async ({ sessionId, data }: { sessionId: string; data: string }) => {
      if (!manager.write(sessionId, data)) {
        throw new Error(`O manager recusou a escrita de ${sessionId}.`)
      }
      await manager.aguardarEscritas(sessionId)
    },
    resize: async () => {},
    kill: async ({ sessionId }: { sessionId: string }) => {
      manager.killAll({ force: true })
      return { ok: Boolean(sessionId) }
    },
  }

  ;(globalThis as { window?: unknown }).window = {
    felixo: {
      pty,
      contextFiles: {
        write: async ({ content }: { content: string }) => {
          contextBodies.push(content)
          return {
            ok: true,
            name: `felixo-context-${contextBodies.length}-initial-context.txt`,
          }
        },
        release: async () => ({ ok: true }),
      },
    },
  }

  return {
    manager,
    fakes,
    profiles,
    spawnRequests,
    contextBodies,
    write: (sessionId, data) => pty.write({ sessionId: `canvas:${sessionId}`, data }),
    installProfile: (profile) => profiles.set(profile.sessionId, profile),
    dispose: () => {
      manager.killAll({ force: true })
      ;(globalThis as { window?: unknown }).window = previousWindow
    },
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitFor(condition: () => boolean, timeout = 4_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (condition()) return
    await wait(25)
  }
  throw new Error('A condição E2E não ficou verdadeira dentro do prazo.')
}

function createAgentProfile(
  harness: E2EHarness,
  command: string,
  args: string[],
  label: string,
  accountId = `${command}-conta-fake`,
): LaunchProfile {
  const sessionId = `canvas-context-${command}`
  const profile: LaunchProfile = {
    sessionId,
    command,
    args,
    cwd: TEST_CWD,
    initialText: 'Contexto inicial determinístico; não é uma tarefa executável.',
    accountId,
    providerId: command,
    sourceLabel: label,
  }
  harness.installProfile(profile)
  return profile
}

describe('E2E do contexto inicial do Canvas', () => {
  let harness: E2EHarness | undefined
  let stores: TerminalSessionStore[] = []

  afterEach(() => {
    for (const store of stores) store.clear()
    harness?.dispose()
    stores = []
    harness = undefined
  })

  it('não submete contexto e entrega o prompt explícito depois em todos os caminhos', async () => {
    harness = createHarness()
    const qualidade = buildCanvasTerminalInitialText(
      'Siga o padrão de qualidade.',
      undefined,
      [],
      { agentName: 'Agente fake', cwd: TEST_CWD },
    )
    expect(qualidade.endsWith('\r')).toBe(false)
    expect(qualidade.endsWith('\n')).toBe(false)

    const casos: Array<{
      nome: string
      profile: LaunchProfile
      initialText?: string
    }> = [
      {
        nome: 'shell',
        profile: {
          sessionId: 'canvas-context-shell',
          cwd: TEST_CWD,
          args: [],
          sourceLabel: 'Shell',
        },
      },
      {
        nome: 'launcher opaco',
        profile: {
          sessionId: 'canvas-context-launcher',
          command: 'openia',
          args: [],
          cwd: TEST_CWD,
          sourceLabel: 'Launcher legado',
          providerId: 'openia',
          accountId: 'openia-conta-fake',
        },
      },
      {
        nome: 'Openia direto',
        profile: createAgentProfile(
          harness,
          'openia',
          buildOpeniaRunArgs('openrouter', 'modelo-fake', TEST_CWD) ?? [],
          'Openia direto',
          'openia-conta-fake',
        ),
      },
      {
        nome: 'Claude',
        profile: createAgentProfile(
          harness,
          'claude',
          buildAgentArgs({ agentId: 'claude', model: 'sonnet', effort: 'high', yolo: true }) ?? [],
          'Claude',
        ),
      },
      {
        nome: 'Codex',
        profile: createAgentProfile(
          harness,
          'codex',
          buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-luna', effort: 'high', yolo: true }) ?? [],
          'Codex',
        ),
      },
      {
        nome: 'Gemini',
        profile: createAgentProfile(
          harness,
          'gemini',
          buildAgentArgs({ agentId: 'gemini', model: 'gemini-3-flash', yolo: true }) ?? [],
          'Gemini',
        ),
      },
    ]

    // As decisões de launcher não são duplicadas no fake: estes asserts pegam
    // o caminho que o Canvas usa para decidir se deve construir contexto.
    expect(casos[1].profile.initialText).toBeUndefined()
    expect(casos[2].profile.args[0]).toBe('run')
    expect(casos[2].profile.initialText).toBeDefined()
    expect(casos[3].profile.args).toEqual([
      '--model',
      'sonnet',
      '--effort',
      'high',
      '--dangerously-skip-permissions',
    ])
    expect(casos[4].profile.args).toEqual([
      '--model',
      'gpt-5.6-luna',
      '-c',
      'model_reasoning_effort=high',
      '--dangerously-bypass-approvals-and-sandbox',
    ])
    expect(casos[5].profile.args).toEqual(['--model', 'gemini-3-flash', '--yolo'])
    const observacoes: string[] = []

    for (const caso of casos) {
      harness.installProfile(caso.profile)
      const store = new TerminalSessionStore()
      stores.push(store)
      store.ensure(caso.profile.sessionId, {
        command: caso.profile.command,
        args: caso.profile.args,
        cwd: caso.profile.cwd,
        initialText: caso.profile.command ? caso.profile.initialText : undefined,
        sourceLabel: caso.profile.sourceLabel,
        accountId: caso.profile.accountId,
        providerId: caso.profile.providerId,
      })

      await waitFor(() => harness?.fakes.has(caso.profile.sessionId) ?? false)
      const fake = harness.fakes.get(caso.profile.sessionId)

      if (!fake) throw new Error(`PTY fake ausente no caminho ${caso.nome}.`)

      if (caso.profile.initialText) {
        try {
          await waitFor(() => fake.written.some((data) => data.includes(CONTEXT_HEADER)))
        } catch {
          throw new Error(
            `O contexto inicial não chegou no caminho ${caso.nome}; ` +
              `escritas=${fake.written.length}; ` +
              `eventos=${fake.events.map((event) => event.kind).join('>')}; ` +
              `solicitaÃ§Ãµes=${harness.spawnRequests.length}`,
          )
        }
        const contextWrites = fake.written.filter((data) => data.includes(CONTEXT_HEADER))
        expect(contextWrites).toHaveLength(1)
        expect(contextWrites.every((data) => !/(?:\r|\n)$/.test(data))).toBe(true)
        expect(fake.events.filter((event) => event.kind === 'context-submitted')).toEqual([])
      }

      const contextWriteIndex = fake.written.findIndex((data) => data.includes(CONTEXT_HEADER))
      await harness.write(caso.profile.sessionId, EXPLICIT_PROMPT)
      await harness.write(caso.profile.sessionId, '\r')
      try {
        await waitFor(() => fake.executions.some((execution) => execution.kind === 'user'))
      } catch {
        throw new Error(
          `O prompt explícito não chegou no caminho ${caso.nome}; ` +
            `escritas=${fake.written.length}; ` +
            `eventos=${fake.events.map((event) => event.kind).join('>')}; ` +
            `execuções=${fake.executions.map((execution) => execution.kind).join('>')}`,
        )
      }

      const userPromptIndex = fake.written.indexOf(EXPLICIT_PROMPT)
      const submitIndex = fake.written.lastIndexOf('\r')
      expect(fake.executions.filter((execution) => execution.kind === 'context')).toEqual([])
      expect(fake.executions.filter((execution) => execution.kind === 'user')).toEqual([
        { kind: 'user', data: EXPLICIT_PROMPT },
      ])
      expect(userPromptIndex).toBeGreaterThan(contextWriteIndex)
      expect(submitIndex).toBeGreaterThan(userPromptIndex)

      const request = harness.spawnRequests.find(
        (item) => item.sessionId === caso.profile.sessionId,
      )
      expect(request?.cwd).toBe(caso.profile.cwd)
      expect(request?.accountId).toBe(caso.profile.accountId)
      expect(request?.providerId).toBe(caso.profile.providerId)
      observacoes.push(
        `${caso.nome}: escritas=${fake.written.length}; contexto=${fake.events.filter((event) => event.kind === 'context').length}; execuções=${fake.executions.length}; ordem=${fake.events.map((event) => event.kind).join('>')}`,
      )
    }

    const runtime = (globalThis as {
      process?: {
        platform?: string
        version?: string
        versions?: { electron?: string }
      }
    }).process
    console.info(
      `[canvas-context-e2e] plataforma=${runtime?.platform ?? 'desconhecida'} ` +
        `node=${runtime?.version ?? 'desconhecido'} ` +
        `electron=${runtime?.versions?.electron ?? 'ausente (Vitest)'} ` +
        observacoes.join(' | '),
    )
  }, 15_000)

  it('não duplica contexto quando o mesmo node é reidratado no reload', async () => {
    harness = createHarness()
    const profile = createAgentProfile(
      harness,
      'claude',
      buildAgentArgs({ agentId: 'claude', model: 'sonnet', effort: 'medium', yolo: true }) ?? [],
      'Claude reidratado',
    )
    const firstStore = new TerminalSessionStore()
    stores.push(firstStore)
    firstStore.ensure(profile.sessionId, {
      command: profile.command,
      args: profile.args,
      cwd: profile.cwd,
      initialText: profile.initialText,
      sourceLabel: profile.sourceLabel,
      accountId: profile.accountId,
      providerId: profile.providerId,
    })

    await waitFor(() => harness?.fakes.get(profile.sessionId)?.written.some((data) => data.includes(CONTEXT_HEADER)) ?? false)
    const fake = harness.fakes.get(profile.sessionId)
    if (!fake) throw new Error('PTY fake ausente durante a reidratação.')
    expect(fake.written.filter((data) => data.includes(CONTEXT_HEADER))).toHaveLength(1)
    expect(harness.spawnRequests).toHaveLength(1)

    const secondStore = new TerminalSessionStore()
    stores.push(secondStore)
    secondStore.ensure(profile.sessionId, {
      command: profile.command,
      args: profile.args,
      cwd: profile.cwd,
      initialText: profile.initialText,
      sourceLabel: profile.sourceLabel,
      accountId: profile.accountId,
      providerId: profile.providerId,
    })
    await wait(50)

    expect(harness.spawnRequests).toHaveLength(2)
    expect(harness.fakes.get(profile.sessionId)).toBe(fake)
    expect(fake.written.filter((data) => data.includes(CONTEXT_HEADER))).toHaveLength(1)
    expect(fake.executions).toEqual([])
  })

  it('espera conexões e arquivos antes de liberar o texto inicial', () => {
    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: false,
        edgesHydrated: true,
        connectedCanvasFileCount: 1,
        resolvedCanvasFileCount: 1,
      }),
    ).toBe(false)
    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: true,
        edgesHydrated: false,
        connectedCanvasFileCount: 1,
        resolvedCanvasFileCount: 1,
      }),
    ).toBe(false)
    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: true,
        edgesHydrated: true,
        connectedCanvasFileCount: 2,
        resolvedCanvasFileCount: 1,
      }),
    ).toBe(false)
    expect(
      isTerminalInitialTextReady({
        restoredAgentsCaptured: true,
        edgesHydrated: true,
        connectedCanvasFileCount: 2,
        resolvedCanvasFileCount: 2,
      }),
    ).toBe(true)
  })

  it('retoma Codex compatível sem reencaminhar contexto e identifica fallback do Gemini', async () => {
    harness = createHarness()
    const cwd = TEST_CWD
    const codexSession = 'codex-session-fake-123'
    const codexProfile = createAgentProfile(
      harness,
      'codex',
      buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-luna', effort: 'high', yolo: true }) ?? [],
      'Codex retomado',
    )
    const codexStore = new TerminalSessionStore()
    stores.push(codexStore)
    codexStore.ensure(codexProfile.sessionId, {
      command: codexProfile.command,
      args: codexProfile.args,
      cwd,
      initialText: undefined,
      sourceLabel: codexProfile.sourceLabel,
      accountId: codexProfile.accountId,
      providerId: codexProfile.providerId,
      resumeAgentSession: true,
      agentSession: {
        version: 1,
        provider: 'codex',
        sessionId: codexSession,
        cwd,
        capturedAt: 1,
      },
    })
    await waitFor(() => harness?.fakes.has(codexProfile.sessionId) ?? false)
    const codexRequest = harness.spawnRequests.find(
      (request) => request.sessionId === codexProfile.sessionId,
    )
    expect(codexRequest?.args).toEqual(['resume', ...codexProfile.args, codexSession])
    expect(harness.contextBodies).toEqual([])
    expect(harness.fakes.get(codexProfile.sessionId)?.written).not.toContain('/resume\r')
    expect(canResumeAgentSession('codex', cwd, {
      version: 1,
      provider: 'codex',
      sessionId: codexSession,
      cwd,
      capturedAt: 1,
    })).toBe(true)

    const fallback = resolveTerminalInitialText({
      isRestoredAgent: true,
      qualityStandardEnabled: true,
      qualityStandardPrompt: 'Siga o padrão.',
      hasCommand: true,
      command: 'gemini',
      cwd,
      resumeAgentSession: true,
      agentSession: {
        version: 1,
        provider: 'gemini',
        sessionId: 'gemini-session-fake-456',
        cwd,
        capturedAt: 1,
      },
    })
    expect(fallback).toBeDefined()
    expect(fallback).toMatch(/retom|session|ID/i)
    expect(fallback).not.toMatch(/\r$|\n$/)

    const geminiProfile = createAgentProfile(
      harness,
      'gemini',
      buildAgentArgs({ agentId: 'gemini', model: 'gemini-3-flash', yolo: true }) ?? [],
      'Gemini fallback',
    )
    const geminiStore = new TerminalSessionStore()
    stores.push(geminiStore)
    geminiStore.ensure(geminiProfile.sessionId, {
      command: geminiProfile.command,
      args: geminiProfile.args,
      cwd,
      initialText: fallback,
      sourceLabel: geminiProfile.sourceLabel,
      accountId: geminiProfile.accountId,
      providerId: geminiProfile.providerId,
    })
    await waitFor(() => harness?.fakes.get(geminiProfile.sessionId)?.written.some((data) => data.includes(CONTEXT_HEADER)) ?? false)
    expect(harness.contextBodies.some((body) => /retom|session|ID/i.test(body))).toBe(true)
    expect(harness.fakes.get(geminiProfile.sessionId)?.events.filter((event) => event.kind === 'context-submitted')).toEqual([])
    expect(harness.fakes.get(geminiProfile.sessionId)?.executions).toEqual([])
  }, 10_000)
})
