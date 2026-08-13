import { describe, expect, it } from 'vitest'
import {
  buildPlanSections,
  countAutoCommitCandidates,
  describeProgress,
  planHasSafeActions,
  summarizeResults,
} from './fetch-all-plan'
import type {
  FetchAllPlan,
  FetchAllRepoState,
  FetchAllRepoStatus,
} from '../../types'

function repo(
  path: string,
  state: FetchAllRepoState,
  extra: Partial<FetchAllRepoStatus> = {},
): FetchAllRepoStatus {
  return {
    path,
    name: path.split('/').pop() ?? path,
    state,
    stateLabel: state,
    branch: 'main',
    ahead: 0,
    behind: 0,
    detail: '',
    dirtyFiles: [],
    ...extra,
  }
}

function plan(overrides: Partial<FetchAllPlan> = {}): FetchAllPlan {
  const base: FetchAllPlan = {
    upToDate: [],
    toPull: [],
    toPush: [],
    problems: [],
    total: 0,
  }
  const merged = { ...base, ...overrides }

  return {
    ...merged,
    total:
      merged.upToDate.length +
      merged.toPull.length +
      merged.toPush.length +
      merged.problems.length,
  }
}

describe('buildPlanSections', () => {
  it('mantém a ordem de revisão e descarta seções vazias', () => {
    const sections = buildPlanSections(
      plan({
        toPush: [repo('/a', 'NEEDS_PUSH')],
        problems: [repo('/b', 'DIRTY')],
      }),
    )

    expect(sections.map((section) => section.key)).toEqual(['toPush', 'problems'])
    expect(sections[0].tone).toBe('action')
    expect(sections[1].tone).toBe('warning')
  })

  it('devolve nada quando ainda não houve varredura', () => {
    expect(buildPlanSections(null)).toEqual([])
  })
})

describe('countAutoCommitCandidates', () => {
  it('conta só os sujos que não estão atrás do remoto', () => {
    const current = plan({
      problems: [
        repo('/a', 'DIRTY'),
        repo('/b', 'DIRTY', { behind: 2 }),
        repo('/c', 'CONFLICT'),
      ],
    })

    expect(countAutoCommitCandidates(current)).toBe(1)
  })
})

describe('planHasSafeActions', () => {
  it('habilita a execução com pull ou push no plano', () => {
    expect(planHasSafeActions(plan({ toPull: [repo('/a', 'NEEDS_PULL')] }), false)).toBe(
      true,
    )
  })

  it('só conta os commits automáticos quando a pessoa marca a opção', () => {
    const current = plan({ problems: [repo('/a', 'DIRTY')] })

    expect(planHasSafeActions(current, false)).toBe(false)
    expect(planHasSafeActions(current, true)).toBe(true)
  })

  it('não habilita nada sem plano', () => {
    expect(planHasSafeActions(null, true)).toBe(false)
  })
})

describe('describeProgress', () => {
  it('descreve cada fase da passada', () => {
    expect(
      describeProgress({
        phase: 'scanning',
        type: 'scan',
        foundRepos: 3,
        scannedDirs: 120,
      }),
    ).toBe('Varrendo… 3 repositório(s) em 120 pasta(s)')

    expect(
      describeProgress({
        phase: 'analyzing',
        type: 'analyze',
        analyzed: 2,
        total: 5,
        repoName: 'meu-projeto',
      }),
    ).toBe('Analisando 2/5 · meu-projeto')

    expect(
      describeProgress({ phase: 'executing', type: 'execute', done: 1, total: 4 }),
    ).toBe('Executando 1/4')
  })

  it('fica em branco quando não há passada em andamento', () => {
    expect(describeProgress(null)).toBe('')
    expect(describeProgress({ phase: 'idle', type: 'done' })).toBe('')
  })
})

describe('summarizeResults', () => {
  it('separa sucessos de falhas', () => {
    const status = repo('/a', 'NEEDS_PUSH')

    expect(summarizeResults([])).toBe('Nenhuma ação executada.')
    expect(
      summarizeResults([
        { status, action: 'push', ok: true, message: '' },
        { status, action: 'pull', ok: false, message: 'erro' },
      ]),
    ).toBe('1 ação(ões) concluída(s), 1 com falha.')
    expect(summarizeResults([{ status, action: 'push', ok: true, message: '' }])).toBe(
      '1 ação(ões) concluída(s).',
    )
  })
})
