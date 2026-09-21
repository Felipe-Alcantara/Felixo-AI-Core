import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildAgentArgs } from '../services/agent-launch-options'
import { buildOpeniaRunArgs } from '../services/openia-launch-config'
import {
  buildCanvasTerminalInitialText,
  isTerminalInitialTextReady,
  resolveTerminalInitialText,
} from '../services/quality-standard-prompt'
import { splitInitialContext } from '../services/context-file-delivery'
import { canResumeAgentSession } from '../services/agent-session'
import { TerminalSessionStore } from './terminal-session-store'

// These CommonJS modules are the same writer and reader used by the packaged
// app. The PTY fake below only replaces node-pty, so the file/shim boundary is
// still exercised for every matrix iteration.
// @ts-expect-error CommonJS runtime module has no generated TypeScript types.
import { writeContextFile } from '../../../../electron/services/context-files-ipc-handlers.cjs'
// @ts-expect-error CommonJS runtime module has no generated TypeScript types.
import { executarContexto } from '../../../../electron/cli/context-command.cjs'
// @ts-expect-error CommonJS runtime module has no generated TypeScript types.
import { appendContextDeliveryEvent, flushContextDeliveryLog } from '../../../../electron/services/context-delivery-log.cjs'

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
  trustPrompt?: boolean
  codexAutoUpdate?: boolean
}

type FakeWrite = {
  kind: 'context' | 'context-submitted' | 'prompt' | 'newline' | 'decision'
  data: string
}

type DeliveryLogEntry = {
  scope?: string
  sessionId?: string
  details?: {
    artifactId?: string | null
    terminal?: string
    agent?: string
    kind?: string
    state?: string
  }
}

const TRUST_SCREEN = [
  'Quick safety check: Is this a project you created or one you trust?',
  'No, exit',
  'Yes, I trust this folder',
  'Enter to confirm',
].join('\r\n')
const CODEX_UPDATE_BANNER = 'Update ran successfully! Please restart Codex.'

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
  readonly readArtifacts: string[] = []
  readonly readBodies: string[] = []
  private readonly profile: LaunchProfile
  private readonly contextDir: string
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(
    event: { exitCode: number; signal?: number },
  ) => void>()
  private pendingPrompt = ''
  private trustScreenVisible: boolean
  private autoUpdateTriggered = false
  private contextReferenceBuffer = ''
  private contextReferenceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(profile: LaunchProfile, contextDir: string) {
    this.profile = profile
    this.contextDir = contextDir
    this.trustScreenVisible = Boolean(profile.trustPrompt)
    // O callback só é executado depois de o manager assinar onData, como
    // aconteceria com a primeira saída de um processo PTY real.
    queueMicrotask(() => this.emit(this.trustScreenVisible ? TRUST_SCREEN : this.readyScreen()))
  }

  write(data: string): void {
    const text = String(data)
    this.written.push(text)

    if (text.includes(CONTEXT_HEADER) || this.contextReferenceBuffer) {
      this.contextReferenceBuffer = `${this.contextReferenceBuffer}${text}`
      if (this.contextReferenceTimer) clearTimeout(this.contextReferenceTimer)
      this.contextReferenceTimer = setTimeout(() => {
        this.contextReferenceTimer = null
        const reference = this.contextReferenceBuffer
        this.contextReferenceBuffer = ''
        void this.processContextReference(reference)
      }, 40)
      return
    }
    if (text.startsWith('\x1b')) {
      this.events.push({ kind: 'decision', data: text })
      return
    }

    if (this.trustScreenVisible && text === '\r') {
      this.events.push({ kind: 'decision', data: text })
      this.trustScreenVisible = false
      this.emit(this.readyScreen())
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
    if (this.contextReferenceTimer) {
      clearTimeout(this.contextReferenceTimer)
      this.contextReferenceTimer = null
    }
    // O manager faz o cleanup da entrada. O fake não encerra por conta própria,
    // porque um terminal real continua vivo enquanto o card está montado.
  }

  exit(exitCode = 0): void {
    for (const listener of this.exitListeners) listener({ exitCode })
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

  private async processContextReference(text: string): Promise<void> {
    const submitted = /(?:\r|\n)$/.test(text)
    this.events.push({ kind: submitted ? 'context-submitted' : 'context', data: text })
    if (submitted) {
      this.executions.push({ kind: 'context', data: text })
    }
    await this.readContextReferences(text)
    const promptMarker = this.profile.command === 'codex'
      ? '\u203a'
      : this.profile.command === 'claude'
        ? '\u276f'
        : '>'
    this.emit(`\r\n${promptMarker} ${CONTEXT_HEADER}\r\n`)
    if (this.profile.codexAutoUpdate && !this.autoUpdateTriggered) {
      this.autoUpdateTriggered = true
      this.emit(`\r\n${CODEX_UPDATE_BANNER}\r\n`)
      queueMicrotask(() => this.exit(0))
    }
  }

  private async readContextReferences(text: string): Promise<void> {
    const names = Array.from(text.matchAll(/context read\s+"([^"]+)"/g), (match) => match[1])
    for (const name of names) {
      const result = await executarContexto(['read', name], {
        getContextDir: () => this.contextDir,
      })
      if (result.codigo === 0) {
        this.readArtifacts.push(name)
        this.readBodies.push(result.saida)
      }
    }
  }
}

type E2EHarness = {
  manager: PtyProcessManagerContract
  fakes: Map<string, DeterministicFakePty>
  fakeHistory: Map<string, DeterministicFakePty[]>
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
  contextDir: string
  deliveryLogDirectory: string
  readDeliveryLog: () => Promise<DeliveryLogEntry[]>
  write: (sessionId: string, data: string) => Promise<void>
  installProfile: (profile: LaunchProfile) => void
  dispose: () => Promise<void>
}

function createHarness(options: { contextDir?: string } = {}): E2EHarness {
  const previousWindow = (globalThis as { window?: unknown }).window
  const profiles = new Map<string, LaunchProfile>()
  const fakes = new Map<string, DeterministicFakePty>()
  const fakeHistory = new Map<string, DeterministicFakePty[]>()
  const contextBodies: string[] = []
  const ownsContextRoot = !options.contextDir
  const contextRoot = options.contextDir ?? mkdtempSync(join(tmpdir(), 'felixo-context-e2e-'))
  const contextDir = options.contextDir ?? join(contextRoot, 'context-deliveries')
  const deliveryLogDirectory = join(contextRoot, 'logs', 'qa')
  const filesBySession = new Map<string, string[]>()
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
      const previousFakes = fakeHistory.get(profileBeingSpawned.sessionId) ?? []
      const fakeProfile = previousFakes.length > 0
        ? { ...profileBeingSpawned, codexAutoUpdate: false }
        : profileBeingSpawned
      const fake = new DeterministicFakePty(fakeProfile, contextDir)
      fakes.set(profileBeingSpawned.sessionId, fake)
      const history = fakeHistory.get(profileBeingSpawned.sessionId) ?? []
      history.push(fake)
      fakeHistory.set(profileBeingSpawned.sessionId, history)
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
        write: async ({
          sessionId,
          kind,
          source,
          terminal,
          agent,
          content,
        }: {
          sessionId: string
          kind?: string
          source?: string
          terminal?: string
          agent?: string
          content: string
        }) => {
          contextBodies.push(content)
          try {
            const result = await writeContextFile(contextDir, {
              sessionId,
              kind,
              source,
              terminal,
              agent,
              content,
            })
            const files = filesBySession.get(sessionId) ?? []
            files.push(result.path)
            filesBySession.set(sessionId, files)
            await appendContextDeliveryEvent(deliveryLogDirectory, {
              artifactId: result.name,
              sessionId,
              terminal,
              agent,
              kind,
              state: 'written',
            })
            return { ok: true, name: result.name, commandPath: undefined }
          } catch (error) {
            await appendContextDeliveryEvent(deliveryLogDirectory, {
              sessionId,
              terminal,
              agent,
              kind,
              state: 'failed',
              error: error instanceof Error ? error.message : String(error),
            }).catch(() => {})
            throw error
          }
        },
        markPathTyped: async ({
          sessionId,
          names,
          terminal,
          agent,
        }: {
          sessionId: string
          names?: string[]
          terminal?: string
          agent?: string
        }) => {
          for (const name of names ?? []) {
            await appendContextDeliveryEvent(deliveryLogDirectory, {
              artifactId: name,
              sessionId,
              terminal,
              agent,
              state: 'path-typed',
            })
          }
          return { ok: true, marked: names?.length ?? 0 }
        },
        release: async ({ sessionId }: { sessionId: string }) => {
          const files = filesBySession.get(sessionId) ?? []
          for (const filePath of files) rmSync(filePath, { force: true })
          filesBySession.delete(sessionId)
          return { ok: true, removed: files.length }
        },
      },
    },
  }

  const readDeliveryLog = async (): Promise<DeliveryLogEntry[]> => {
    await flushContextDeliveryLog(deliveryLogDirectory)
    if (!existsSync(deliveryLogDirectory)) return []
    const entries: DeliveryLogEntry[] = []
    for (const file of readdirSync(deliveryLogDirectory).filter((name) => /^qa-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))) {
      const content = readFileSync(join(deliveryLogDirectory, file), 'utf8')
      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line) as DeliveryLogEntry
          if (entry.scope === 'context-delivery') entries.push(entry)
        } catch {
          // A partial line from a simulated crash is itself a useful fixture;
          // the QA store ignores it when hydrating the next run.
        }
      }
    }
    return entries
  }

  return {
    manager,
    fakes,
    fakeHistory,
    profiles,
    spawnRequests,
    contextBodies,
    contextDir,
    deliveryLogDirectory,
    readDeliveryLog,
    write: (sessionId, data) => pty.write({ sessionId: `canvas:${sessionId}`, data }),
    installProfile: (profile) => profiles.set(profile.sessionId, profile),
    dispose: async () => {
      manager.killAll({ force: true })
      ;(globalThis as { window?: unknown }).window = previousWindow
      await flushContextDeliveryLog(deliveryLogDirectory)
      if (ownsContextRoot) rmSync(contextRoot, { recursive: true, force: true })
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
  options: Partial<Pick<LaunchProfile, 'sessionId' | 'trustPrompt' | 'codexAutoUpdate'>> = {},
): LaunchProfile {
  const sessionId = options.sessionId ?? `canvas-context-${command}`
  const profile: LaunchProfile = {
    sessionId,
    command,
    args,
    cwd: TEST_CWD,
    initialText: 'Contexto inicial determinístico; não é uma tarefa executável.',
    accountId,
    providerId: command,
    sourceLabel: label,
    trustPrompt: options.trustPrompt,
    codexAutoUpdate: options.codexAutoUpdate,
  }
  harness.installProfile(profile)
  return profile
}

function ensureProfile(store: TerminalSessionStore, profile: LaunchProfile): void {
  store.ensure(profile.sessionId, {
    command: profile.command,
    args: profile.args,
    cwd: profile.cwd,
    initialText: profile.initialText,
    sourceLabel: profile.sourceLabel,
    accountId: profile.accountId,
    providerId: profile.providerId,
  })
}

async function waitForInitialRead(
  harness: E2EHarness,
  sessionId: string,
  expectedReads = 1,
  timeout = 8_000,
): Promise<DeterministicFakePty> {
  await waitFor(
    () => (harness.fakes.get(sessionId)?.readArtifacts.length ?? 0) >= expectedReads,
    timeout,
  )
  const fake = harness.fakes.get(sessionId)
  if (!fake) throw new Error(`PTY fake ausente para ${sessionId}.`)
  return fake
}

function expectedReads(profile: LaunchProfile): number {
  return splitInitialContext(profile.initialText ?? '').length
}

async function readDeliveryEntries(harness: E2EHarness): Promise<DeliveryLogEntry[]> {
  const entries = await harness.readDeliveryLog()
  return entries.filter((entry) => entry.scope === 'context-delivery')
}

function statesForArtifact(entries: DeliveryLogEntry[], artifactId: string): string[] {
  return entries
    .filter((entry) => entry.details?.artifactId === artifactId)
    .map((entry) => entry.details?.state)
    .filter((state): state is string => Boolean(state))
}

function matrixRepetitions(): number {
  const configured = Number(
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.FELIXO_CONTEXT_MATRIX_RUNS,
  )
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 50
}

function matrixReportPath(): string | undefined {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.FELIXO_CONTEXT_MATRIX_REPORT
  return typeof value === 'string' && value.trim() ? value : undefined
}

function writeMatrixReport(pathname: string | undefined, report: unknown): void {
  if (!pathname) return
  const directory = dirname(pathname)
  mkdirSync(directory, { recursive: true })
  const temporary = `${pathname}.${Date.now()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  rmSync(pathname, { force: true })
  renameSync(temporary, pathname)
}

describe('E2E do contexto inicial do Canvas', () => {
  let harness: E2EHarness | undefined
  let stores: TerminalSessionStore[] = []

  afterEach(async () => {
    for (const store of stores) store.clear()
    await harness?.dispose()
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
        await waitFor(() => fake.readArtifacts.length > 0)
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

  it('prova a entrega ponta a ponta na matriz de restart, troca, concorrencia e recuperacao', async () => {
    const repetitions = matrixRepetitions()
    const reportPath = matrixReportPath()
    const report: {
      suite: string
      repetitions: number
      passed: number
      failed: number
      totalDeliveries: number
      completeDeliveries: number
      scenarios: Array<{ iteration: number; name: string; ok: boolean; deliveries: number }>
      failures: Array<{ iteration: number; error: string; log: DeliveryLogEntry[] }>
    } = {
      suite: 'canvas-context-delivery-matrix',
      repetitions,
      passed: 0,
      failed: 0,
      totalDeliveries: 0,
      completeDeliveries: 0,
      scenarios: [],
      failures: [],
    }

    try {
      for (let iteration = 1; iteration <= repetitions; iteration += 1) {
        const localHarness = createHarness()
        harness = localHarness
        const localStores: TerminalSessionStore[] = []
        try {
          const profileFor = (
            sessionId: string,
            command: 'claude' | 'codex',
            options: { trustPrompt?: boolean; codexAutoUpdate?: boolean } = {},
          ): LaunchProfile => {
            const args = command === 'codex'
              ? buildAgentArgs({ agentId: 'codex', model: 'gpt-5.6-luna', effort: 'high', yolo: true }) ?? []
              : buildAgentArgs({ agentId: 'claude', model: 'sonnet', effort: 'medium', yolo: true }) ?? []
            const profile = createAgentProfile(localHarness, command, args, `${command} matriz`, `${command}-matriz`, {
              sessionId,
              trustPrompt: options.trustPrompt,
              codexAutoUpdate: options.codexAutoUpdate,
            })
            profile.initialText = buildCanvasTerminalInitialText(
              'Siga o padrão de qualidade da matriz.',
              undefined,
              [],
              { agentName: `${command} matriz`, cwd: TEST_CWD },
            )
            return profile
          }

          const restartId = `matrix-restart-${iteration}`
          const restartProfile = profileFor(restartId, 'claude')
          const firstStore = new TerminalSessionStore()
          localStores.push(firstStore)
          ensureProfile(firstStore, restartProfile)
          await waitForInitialRead(localHarness, restartId, expectedReads(restartProfile))
          const restoredStore = new TerminalSessionStore()
          localStores.push(restoredStore)
          ensureProfile(restoredStore, restartProfile)
          await wait(30)
          expect(localHarness.fakeHistory.get(restartId)).toHaveLength(1)
          expect(localHarness.fakes.get(restartId)?.readArtifacts).toHaveLength(expectedReads(restartProfile))
          report.scenarios.push({ iteration, name: 'restart-rehidratacao', ok: true, deliveries: 1 })

          const swapId = `matrix-agent-swap-${iteration}`
          const claudeProfile = profileFor(swapId, 'claude')
          const swapStore = new TerminalSessionStore()
          localStores.push(swapStore)
          ensureProfile(swapStore, claudeProfile)
          await waitForInitialRead(localHarness, swapId, expectedReads(claudeProfile))
          const codexProfile = profileFor(swapId, 'codex')
          swapStore.restart(swapId, {
            command: codexProfile.command,
            args: codexProfile.args,
            cwd: codexProfile.cwd,
            initialText: codexProfile.initialText,
            sourceLabel: codexProfile.sourceLabel,
            accountId: codexProfile.accountId,
            providerId: codexProfile.providerId,
          })
          await waitFor(() => (localHarness.fakeHistory.get(swapId)?.length ?? 0) >= 2)
          await waitForInitialRead(localHarness, swapId, expectedReads(codexProfile))
          expect(localHarness.fakeHistory.get(swapId)).toHaveLength(2)
          report.scenarios.push({ iteration, name: 'troca-de-agente-no-node', ok: true, deliveries: 2 })

          const reopenId = `matrix-terminal-reopen-${iteration}`
          const reopenProfile = profileFor(reopenId, 'claude')
          const reopenStore = new TerminalSessionStore()
          localStores.push(reopenStore)
          ensureProfile(reopenStore, reopenProfile)
          await waitForInitialRead(localHarness, reopenId, expectedReads(reopenProfile))
          reopenStore.remove(reopenId)
          ensureProfile(reopenStore, reopenProfile)
          await waitFor(() => (localHarness.fakeHistory.get(reopenId)?.length ?? 0) >= 2)
          await waitForInitialRead(localHarness, reopenId, expectedReads(reopenProfile))
          expect(localHarness.fakeHistory.get(reopenId)).toHaveLength(2)
          report.scenarios.push({ iteration, name: 'troca-e-reabertura-de-terminal', ok: true, deliveries: 2 })

          const simultaneous = [
            profileFor(`matrix-simultaneous-a-${iteration}`, 'claude'),
            profileFor(`matrix-simultaneous-b-${iteration}`, 'codex'),
          ]
          const simultaneousStores = simultaneous.map((profile) => {
            const store = new TerminalSessionStore()
            localStores.push(store)
            ensureProfile(store, profile)
            return store
          })
          await Promise.all(simultaneous.map((profile) => waitForInitialRead(localHarness, profile.sessionId, expectedReads(profile))))
          expect(localHarness.fakes.get(simultaneous[0].sessionId)?.readArtifacts).toHaveLength(expectedReads(simultaneous[0]))
          expect(localHarness.fakes.get(simultaneous[1].sessionId)?.readArtifacts).toHaveLength(expectedReads(simultaneous[1]))
          expect(simultaneousStores).toHaveLength(2)
          report.scenarios.push({ iteration, name: 'dois-terminais-simultaneos', ok: true, deliveries: 2 })

          const trustId = `matrix-claude-trust-${iteration}`
          const trustProfile = profileFor(trustId, 'claude', { trustPrompt: true })
          const trustStore = new TerminalSessionStore()
          localStores.push(trustStore)
          ensureProfile(trustStore, trustProfile)
          const trustFake = await waitForInitialRead(localHarness, trustId, expectedReads(trustProfile))
          const decisionIndex = trustFake.events.findIndex((event) => event.kind === 'decision')
          const contextIndex = trustFake.events.findIndex((event) => event.kind === 'context')
          // A sequência completa vai na mensagem: em 20-21/09 o Windows falhou aqui (contextIndex -1) e o
          // log só mostrava os índices. Sem ver se o evento virou 'context-submitted' (um Enter dentro da
          // janela de 40 ms do fake) não dá para separar artefato de tempo de envio automático do produto.
          const sequencia = JSON.stringify(trustFake.events.map((event) => [event.kind, event.data.slice(0, 40)]))
          expect(decisionIndex, `eventos: ${sequencia}`).toBeGreaterThanOrEqual(0)
          expect(contextIndex, `context ausente ou submetido — eventos: ${sequencia}`).toBeGreaterThan(decisionIndex)
          report.scenarios.push({ iteration, name: 'claude-confianca-de-pasta', ok: true, deliveries: 1 })

          const updateId = `matrix-codex-update-${iteration}`
          const updateProfile = profileFor(updateId, 'codex', { codexAutoUpdate: true })
          const updateStore = new TerminalSessionStore()
          localStores.push(updateStore)
          ensureProfile(updateStore, updateProfile)
          await waitFor(
            () => (localHarness.fakeHistory.get(updateId)?.length ?? 0) >= 2 &&
              (localHarness.fakes.get(updateId)?.readArtifacts.length ?? 0) >= expectedReads(updateProfile),
            12_000,
          )
          expect(localHarness.fakeHistory.get(updateId)).toHaveLength(2)
          expect(localHarness.fakes.get(updateId)?.readArtifacts).toHaveLength(expectedReads(updateProfile))
          report.scenarios.push({ iteration, name: 'codex-auto-update', ok: true, deliveries: 2 })

          const entries = await readDeliveryEntries(localHarness)
          const artifacts = Array.from(new Set(
            entries
              .map((entry) => entry.details?.artifactId)
              .filter((artifactId): artifactId is string => Boolean(artifactId)),
          ))
          report.totalDeliveries += artifacts.length
          for (const artifactId of artifacts) {
            const states = statesForArtifact(entries, artifactId)
            const written = entries.find((entry) => entry.details?.artifactId === artifactId && entry.details?.state === 'written')
            expect(states).toEqual(expect.arrayContaining(['written', 'path-typed', 'read']))
            expect(states).not.toContain('failed')
            expect(written?.details?.terminal).toBeTruthy()
            expect(written?.details?.agent).toBeTruthy()
            report.completeDeliveries += 1
          }
          report.passed += 1
          writeMatrixReport(reportPath, report)
        } catch (error) {
          report.failed += 1
          let log: DeliveryLogEntry[] = []
          try {
            log = await readDeliveryEntries(localHarness)
          } catch {
            // Preserve the primary assertion if the diagnostic itself fails.
          }
          report.failures.push({
            iteration,
            error: error instanceof Error ? error.message : String(error),
            log: log.slice(-80),
          })
          writeMatrixReport(reportPath, report)
          throw error
        } finally {
          for (const store of localStores) store.clear()
          await localHarness.dispose()
          harness = undefined
        }
      }
    } catch (error) {
      writeMatrixReport(reportPath, report)
      throw error
    }

    writeMatrixReport(reportPath, report)
    expect(report.failed).toBe(0)
    expect(report.passed).toBe(repetitions)
    expect(report.completeDeliveries).toBe(report.totalDeliveries)
  }, 180_000)
})
