import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingErrorBoundary } from './OnboardingErrorBoundary'
import { createOnboardingStore, type OnboardingLogEntry } from './onboarding-store'
import { FIRST_BOOT, memoryStorage } from './onboarding-test-fixtures'

/**
 * U-bound: o tutorial só destaca e explica. Uma sonda estática garante que
 * nenhum módulo de `features/onboarding` alcança o que cria bloco, PTY, edge,
 * flyout, rede ou crédito, e que a interface só entra por `lazy()`.
 */

const directory = dirname(fileURLToPath(import.meta.url))
const canvasDirectory = join(directory, '../canvas/components')

function sourceFiles(): Array<{ file: string; source: string }> {
  return readdirSync(directory)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.ts$/.test(file) && file !== 'onboarding-test-fixtures.ts')
    .map((file) => ({ file, source: readFileSync(join(directory, file), 'utf8') }))
}

/** Importações que viram código (as `import type` são apagadas na compilação). */
function runtimeImports(source: string): string[] {
  const statics = [...source.matchAll(/^import\s+(?!type\s)[^'"]*?from\s+'([^']+)'/gm)].map((match) => match[1])
  const bare = [...source.matchAll(/^import\s+'([^']+)'/gm)].map((match) => match[1])
  const dynamic = [...source.matchAll(/import\(\s*'([^']+)'\s*\)/g)].map((match) => match[1])
  return [...statics, ...bare, ...dynamic]
}

function staticImports(source: string): string[] {
  return [...source.matchAll(/^import\s+(?!type\s)[^'"]*?from\s+'([^']+)'/gm)].map((match) => match[1])
}

/** Tudo o que o tutorial pode importar de fora da própria pasta. */
const ALLOWED_EXTERNAL = new Map<string, readonly string[] | 'todos'>([
  ['react', 'todos'],
  // Só o menu Ajuda usa a superfície de popover do Felixo.
  ['../shared/components/FelixoPopoverSurface', ['OnboardingHelpMenu.tsx']],
  ['../canvas/services/keyboard-focus', 'todos'],
  ['../shared/accessibility/reduced-motion-preference', 'todos'],
])

/** Módulos que entram no chunk do canvas (eager): nenhum deles pode puxar a interface. */
const EAGER_MODULES = [
  'onboarding-catalog.ts',
  'onboarding-state.ts',
  'onboarding-store.ts',
  'onboarding-boot-signals.ts',
  'onboarding-devtools.ts',
  'onboarding-help-label.ts',
  'OnboardingMount.tsx',
  'OnboardingErrorBoundary.tsx',
]

const LAZY_ONLY = [
  './onboarding-messages',
  './onboarding-layout',
  './onboarding-ui-model',
  './onboarding-ui-entry',
  './OnboardingTourLayer',
  './OnboardingTourCard',
  './OnboardingNotice',
  './OnboardingHelpMenu',
]

describe('fronteiras do tutorial (sonda estática)', () => {
  const files = sourceFiles()

  it('a sonda enxerga os módulos de verdade', () => {
    expect(files.map(({ file }) => file)).toEqual(
      expect.arrayContaining(['onboarding-store.ts', 'OnboardingMount.tsx', 'OnboardingTourLayer.tsx']),
    )
  })

  it('só importa de fora o que o plano permite', () => {
    const offenders = files.flatMap(({ file, source }) =>
      runtimeImports(source)
        .filter((specifier) => !specifier.startsWith('./'))
        .filter((specifier) => {
          const allowed = ALLOWED_EXTERNAL.get(specifier)
          return allowed === undefined || (allowed !== 'todos' && !allowed.includes(file))
        })
        .map((specifier) => `${file}: ${specifier}`),
    )
    expect(offenders).toEqual([])
  })

  it('nada de chat, terminal, rede, processo nem ponte fora de onboarding, qaLogger e devtools', () => {
    const offenders = files.flatMap(({ file, source }) => {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const found: string[] = []
      if (/features\/chat|\/chat\//.test(code)) found.push('features/chat')
      if (/from '[^']*terminal\//.test(code)) found.push('terminal/*')
      if (/\bfetch\s*\(/.test(code)) found.push('fetch')
      if (/XMLHttpRequest|WebSocket|EventSource/.test(code)) found.push('rede')
      if (/https?:\/\//.test(code)) found.push('URL http(s)')
      if (/\bwindow\.open\s*\(|\.click\s*\(\s*\)|dispatchEvent\s*\(|scrollIntoView/.test(code)) found.push('ação sintetizada')
      if (/\bpty\b|spawn\s*\(|child_process/i.test(code)) found.push('processo')
      if (/\bconfirm\s*\(|\balert\s*\(|\bprompt\s*\(/.test(code)) found.push('diálogo nativo que trava o renderer')
      for (const match of code.matchAll(/felixo\??\.(\w+)/g)) {
        if (!['onboarding', 'qaLogger', 'devtools'].includes(match[1])) found.push(`window.felixo.${match[1]}`)
      }
      return found.map((item) => `${file}: ${item}`)
    })
    expect(offenders).toEqual([])
  })

  it('módulos eager não puxam mensagens, layout nem interface (só por lazy)', () => {
    const offenders = files
      .filter(({ file }) => EAGER_MODULES.includes(file))
      .flatMap(({ file, source }) =>
        staticImports(source)
          .filter((specifier) => LAZY_ONLY.includes(specifier))
          .map((specifier) => `${file}: ${specifier}`),
      )
    expect(offenders).toEqual([])
  })

  it('o OnboardingMount importa a camada só por lazy(import(...)) do ponto de entrada', () => {
    const source = readFileSync(join(directory, 'OnboardingMount.tsx'), 'utf8')
    expect(source).toMatch(/lazy\(\(\) =>\s*import\('\.\/onboarding-ui-entry'\)/)
    expect(staticImports(source).sort()).toEqual(['./OnboardingErrorBoundary', './onboarding-store', 'react'].sort())
  })

  it('o botão Ajuda carrega o menu só por lazy(import(...)) do mesmo ponto de entrada', () => {
    const toolbar = readFileSync(join(canvasDirectory, 'CanvasToolbar.tsx'), 'utf8')
    expect(toolbar).toMatch(/lazy\(\(\) =>\s*import\('\.\.\/\.\.\/onboarding\/onboarding-ui-entry'\)/)
  })

  it('ninguém importa o ponto de entrada da interface de forma estática', () => {
    const canvasSources = readdirSync(canvasDirectory)
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => ({ file: `canvas/${file}`, source: readFileSync(join(canvasDirectory, file), 'utf8') }))
    const offenders = [...files, ...canvasSources].flatMap(({ file, source }) =>
      staticImports(source)
        .filter((specifier) => /onboarding-ui-entry|OnboardingTourLayer|OnboardingHelpMenu/.test(specifier))
        .filter(() => file !== 'onboarding-ui-entry.ts')
        .map((specifier) => `${file}: ${specifier}`),
    )
    expect(offenders).toEqual([])
  })
})

describe('OnboardingErrorBoundary', () => {
  it('getDerivedStateFromError troca para o fallback', () => {
    expect(OnboardingErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true })
  })

  it('com erro renderiza null; sem erro, os filhos', () => {
    const store = { reportFailure: vi.fn() }
    const boundary = new OnboardingErrorBoundary({ store, resetKey: 1, children: 'tour' })
    expect(boundary.render()).toBe('tour')
    boundary.state = { hasError: true }
    expect(boundary.render()).toBeNull()
  })

  it('componentDidCatch avisa a store com o erro e a pilha de componentes', () => {
    const store = { reportFailure: vi.fn() }
    const boundary = new OnboardingErrorBoundary({ store, resetKey: 1, children: null })
    const error = new Error('render quebrou')
    boundary.componentDidCatch(error, { componentStack: '\n    at OnboardingTourLayer' })
    expect(store.reportFailure).toHaveBeenCalledWith(error, '\n    at OnboardingTourLayer')
  })

  it('uma abertura nova (resetKey diferente) tenta de novo', () => {
    const boundary = new OnboardingErrorBoundary({ store: { reportFailure: vi.fn() }, resetKey: 2, children: null })
    boundary.state = { hasError: true }
    const setState = vi.fn()
    boundary.setState = setState
    boundary.componentDidUpdate({ store: boundary.props.store, resetKey: 1, children: null })
    expect(setState).toHaveBeenCalledWith({ hasError: false })
    setState.mockClear()
    boundary.componentDidUpdate({ store: boundary.props.store, resetKey: 2, children: null })
    expect(setState).not.toHaveBeenCalled()
  })

  it('com a store real: desativa o tour na sessão e registra erro no log (QA Logger)', () => {
    const logs: OnboardingLogEntry[] = []
    const store = createOnboardingStore({
      backend: null,
      session: () => memoryStorage(),
      now: () => 0,
      bootSignals: () => FIRST_BOOT,
      clearFirstBootMarker: () => {},
      getLocale: () => 'pt-BR',
      getActiveElement: () => null,
      log: (entry) => logs.push(entry),
    })
    store.open('inicial', 'ajuda')
    const boundary = new OnboardingErrorBoundary({ store, resetKey: 1, children: null })
    boundary.componentDidCatch(new Error('render quebrou'), { componentStack: 'pilha' })
    expect(store.getSnapshot()).toMatchObject({ fase: 'desativado', tour: null })
    expect(logs.filter((entry) => entry.level === 'error')).toHaveLength(1)
    expect(logs[0]?.details).toMatchObject({ message: 'render quebrou', componentStack: 'pilha' })
  })

  it('a store da janela manda o log para o QA Logger no escopo renderer:onboarding', () => {
    const source = readFileSync(join(directory, 'onboarding-store.ts'), 'utf8')
    expect(source).toContain("scope: 'renderer:onboarding'")
    expect(source).toMatch(/felixo\?\.qaLogger\?\.log\(/)
  })
})
