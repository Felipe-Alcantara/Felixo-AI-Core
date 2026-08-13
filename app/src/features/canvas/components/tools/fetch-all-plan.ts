// Leitura do plano do Fetch All para a interface: agrupamento em seções,
// resumo da passada e texto de progresso. Fica fora do componente para o
// painel cuidar só de estado e eventos, e para estas regras terem teste.
import type {
  FetchAllActionResult,
  FetchAllPlan,
  FetchAllProgress,
  FetchAllRepoStatus,
} from '../../types'

/** Uma seção do plano, na ordem em que a pessoa precisa revisar. */
export type PlanSection = {
  key: 'toPull' | 'toPush' | 'problems' | 'upToDate'
  label: string
  /** Cor do rótulo: ação segura, pendência manual ou nada a fazer. */
  tone: 'action' | 'warning' | 'neutral'
  repos: FetchAllRepoStatus[]
}

const SECTION_ORDER: Array<Omit<PlanSection, 'repos'>> = [
  { key: 'toPull', label: 'Para pull', tone: 'action' },
  { key: 'toPush', label: 'Para push', tone: 'action' },
  { key: 'problems', label: 'Com pendência', tone: 'warning' },
  { key: 'upToDate', label: 'Atualizados', tone: 'neutral' },
]

/**
 * Divide o plano nas seções exibidas, descartando as vazias — uma lista de
 * cabeçalhos zerados só empurra para baixo o que a pessoa precisa ver.
 */
export function buildPlanSections(plan: FetchAllPlan | null): PlanSection[] {
  if (!plan) return []

  return SECTION_ORDER.map((section) => ({
    ...section,
    repos: plan[section.key],
  })).filter((section) => section.repos.length > 0)
}

/** Repositórios cuja única pendência é commitar (e que não estão atrás do remoto). */
export function countAutoCommitCandidates(plan: FetchAllPlan | null): number {
  if (!plan) return 0

  return plan.problems.filter((repo) => repo.state === 'DIRTY' && repo.behind === 0)
    .length
}

/** Há alguma ação segura para o botão de executar habilitar. */
export function planHasSafeActions(plan: FetchAllPlan | null, autoCommit: boolean): boolean {
  if (!plan) return false

  const safe = plan.toPull.length + plan.toPush.length

  return safe > 0 || (autoCommit && countAutoCommitCandidates(plan) > 0)
}

/** Linha de status da passada em andamento, ou string vazia quando parada. */
export function describeProgress(progress: FetchAllProgress | null): string {
  if (!progress || progress.type === 'done') return ''

  if (progress.type === 'scan') {
    return `Varrendo… ${progress.foundRepos ?? 0} repositório(s) em ${
      progress.scannedDirs ?? 0
    } pasta(s)`
  }

  if (progress.type === 'analyze') {
    const suffix = progress.repoName ? ` · ${progress.repoName}` : ''
    return `Analisando ${progress.analyzed ?? 0}/${progress.total ?? 0}${suffix}`
  }

  return `Executando ${progress.done ?? 0}/${progress.total ?? 0}`
}

/** Resumo de uma execução: quantas ações deram certo e quantas falharam. */
export function summarizeResults(results: FetchAllActionResult[]): string {
  if (!results.length) return 'Nenhuma ação executada.'

  const succeeded = results.filter((result) => result.ok).length
  const failed = results.length - succeeded

  return failed
    ? `${succeeded} ação(ões) concluída(s), ${failed} com falha.`
    : `${succeeded} ação(ões) concluída(s).`
}
