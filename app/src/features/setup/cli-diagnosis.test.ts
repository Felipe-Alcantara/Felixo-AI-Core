import { describe, expect, it } from 'vitest'
import {
  describeCliDiagnosis,
  indexCliDiagnoses,
  parseCliDiagnoseResult,
  requestCliDiagnosis,
  shouldOfferCliInstall,
  type CliDiagnosis,
} from './cli-diagnosis'

function createDiagnosis(overrides: Partial<CliDiagnosis> = {}): CliDiagnosis {
  return {
    id: 'claude',
    name: 'Claude Code CLI',
    status: 'unavailable',
    cause: 'not-installed',
    recommendInstall: true,
    nextAction: { kind: 'install', text: 'Não encontrei Claude Code CLI no PATH que o app enxerga.' },
    ...overrides,
  }
}

type BackendDiagnostics = {
  DIAGNOSIS_CAUSES: Record<string, string>
  buildCliDiagnosis: (input: object) => unknown
  formatDiagnosisForSupport: (diagnoses: unknown[]) => string
}

async function loadBackend(): Promise<{
  diagnostics: BackendDiagnostics
  reasons: Record<string, string>
}> {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)

  return {
    diagnostics: require('../../../electron/services/cli-diagnostics.cjs') as BackendDiagnostics,
    reasons: (require('../../../electron/core/cli-detector.cjs') as {
      FAILURE_REASONS: Record<string, string>
    }).FAILURE_REASONS,
  }
}

describe('parseCliDiagnoseResult', () => {
  it('keeps every well-formed diagnosis and the support text', () => {
    const outcome = parseCliDiagnoseResult({
      ok: true,
      diagnoses: [createDiagnosis(), createDiagnosis({ id: 'codex', name: 'Codex CLI' })],
      supportText: 'Felixo AI Core 0.1.0 — linux/x64',
    })

    expect(outcome).toEqual({
      ok: true,
      report: {
        diagnoses: [createDiagnosis(), createDiagnosis({ id: 'codex', name: 'Codex CLI' })],
        supportText: 'Felixo AI Core 0.1.0 — linux/x64',
      },
    })
  })

  it('drops malformed items instead of failing the whole report', () => {
    const outcome = parseCliDiagnoseResult({
      ok: true,
      diagnoses: [
        null,
        { id: 'sem-acao', name: 'Sem ação', status: 'ready', cause: null },
        { ...createDiagnosis(), status: 'talvez' },
        createDiagnosis({ id: 'gemini', name: 'Gemini CLI' }),
      ],
    })

    expect(outcome.ok && outcome.report.diagnoses.map((item) => item.id)).toEqual(['gemini'])
    expect(outcome.ok && outcome.report.supportText).toBe('')
  })

  it('only recommends installing when the main process says exactly true', () => {
    const outcome = parseCliDiagnoseResult({
      ok: true,
      diagnoses: [{ ...createDiagnosis(), recommendInstall: 'true' }],
    })

    expect(outcome.ok && outcome.report.diagnoses[0].recommendInstall).toBe(false)
  })

  it('turns a failed or unreadable answer into a message', () => {
    expect(parseCliDiagnoseResult({ ok: false, message: 'Sem permissão.' })).toEqual({
      ok: false,
      message: 'Sem permissão.',
    })
    expect(parseCliDiagnoseResult(undefined)).toEqual({
      ok: false,
      message: 'Falha ao diagnosticar as CLIs.',
    })
  })
})

describe('requestCliDiagnosis', () => {
  it('explains that the diagnosis needs the desktop app when there is no bridge', async () => {
    await expect(requestCliDiagnosis(undefined)).resolves.toEqual({
      ok: false,
      message: 'O diagnóstico das CLIs só existe no app desktop.',
    })
  })

  it('never rejects: a failing IPC call becomes a message', async () => {
    const outcome = await requestCliDiagnosis({
      diagnose: () => Promise.reject(new Error('IPC fechado')),
    })

    expect(outcome).toEqual({ ok: false, message: 'IPC fechado' })
  })

  it('returns the parsed report from the bridge', async () => {
    const outcome = await requestCliDiagnosis({
      diagnose: async () => ({ ok: true, diagnoses: [createDiagnosis()], supportText: 'texto' }),
    })

    expect(outcome.ok && outcome.report.diagnoses).toHaveLength(1)
  })
})

describe('describeCliDiagnosis', () => {
  it('separates "not installed" from "installed but invisible to the app"', () => {
    expect(describeCliDiagnosis(createDiagnosis())).toMatchObject({
      label: 'Não instalada',
      tone: 'missing',
    })
    expect(
      describeCliDiagnosis(
        createDiagnosis({
          cause: 'path',
          recommendInstall: false,
          nextAction: { kind: 'fix-path', text: 'Reiniciar o Felixo costuma refazer o PATH.' },
        }),
      ),
    ).toEqual({
      label: 'Instalada, mas invisível ao app',
      tone: 'problem',
      detail: 'Reiniciar o Felixo costuma refazer o PATH.',
    })
  })

  it('calls a ready CLI ready and keeps an unknown cause readable', () => {
    expect(
      describeCliDiagnosis(createDiagnosis({ status: 'ready', cause: null, recommendInstall: false })),
    ).toMatchObject({ label: 'Pronta', tone: 'ready' })
    expect(describeCliDiagnosis(createDiagnosis({ cause: 'causa-nova' }))).toMatchObject({
      label: 'Indisponível',
      tone: 'problem',
    })
  })
})

describe('shouldOfferCliInstall', () => {
  it('keeps the old behaviour until a diagnosis exists', () => {
    expect(shouldOfferCliInstall({ detected: false })).toBe(true)
    expect(shouldOfferCliInstall({ detected: true })).toBe(false)
  })

  it('hides "Instalar" when the diagnosis says reinstalling does not help', () => {
    expect(
      shouldOfferCliInstall({
        detected: false,
        diagnosis: createDiagnosis({ cause: 'path', recommendInstall: false }),
      }),
    ).toBe(false)
    expect(shouldOfferCliInstall({ detected: false, diagnosis: createDiagnosis() })).toBe(true)
  })
})

describe('indexCliDiagnoses', () => {
  it('finds each diagnosis by CLI id and tolerates no report', () => {
    const index = indexCliDiagnoses({ diagnoses: [createDiagnosis()], supportText: '' })

    expect(index.claude?.name).toBe('Claude Code CLI')
    expect(indexCliDiagnoses(null)).toEqual({})
  })
})

describe('paridade com o processo principal', () => {
  it('has a label for every cause the main process can return', async () => {
    const { diagnostics } = await loadBackend()

    for (const cause of Object.values(diagnostics.DIAGNOSIS_CAUSES)) {
      const { label } = describeCliDiagnosis(createDiagnosis({ cause }))
      expect(label, `causa sem rótulo: ${cause}`).not.toBe('Indisponível')
    }
  })

  it('reads what buildCliDiagnosis really produces', async () => {
    const { diagnostics, reasons } = await loadBackend()
    const cli = { id: 'claude', name: 'Claude Code CLI', command: 'claude' }
    const invisible = diagnostics.buildCliDiagnosis({
      cli,
      detection: {
        detected: false,
        version: null,
        path: null,
        reason: reasons.NOT_FOUND,
        attempts: [{ command: 'claude', resolvedPath: null, viaShell: false, outcome: 'failed', reason: reasons.NOT_FOUND }],
      },
      managedPresent: true,
      managedHealth: { ok: true },
      context: { platformName: 'linux', arch: 'x64', appVersion: '0.1.0', homeDir: '/home/bia' },
    })

    const outcome = parseCliDiagnoseResult({
      ok: true,
      diagnoses: [invisible],
      supportText: diagnostics.formatDiagnosisForSupport([invisible]),
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const [diagnosis] = outcome.report.diagnoses
    expect(describeCliDiagnosis(diagnosis).label).toBe('Instalada, mas invisível ao app')
    expect(shouldOfferCliInstall({ detected: false, diagnosis })).toBe(false)
    expect(outcome.report.supportText).toContain('Claude Code CLI: indisponível')
  })
})
