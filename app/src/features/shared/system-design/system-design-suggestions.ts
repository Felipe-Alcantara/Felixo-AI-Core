import type { SystemDesignGuideInput } from './types'

/**
 * Fontes sugeridas por área. O app não impõe nenhuma: a pessoa escolhe e o
 * padrão do app (Felixo) segue valendo para quem não escolheu. `reviewedCommit`
 * é só a referência da comparação feita em 17/11/2026; o guia segue a branch.
 */
export type SystemDesignSuggestion = {
  id: 'felixo' | 'doktor'
  label: string
  area: string
  repoUrl: string
  branch: string
  reviewedCommit: string
}

export const SYSTEM_DESIGN_SUGGESTIONS: readonly SystemDesignSuggestion[] = Object.freeze([
  {
    id: 'felixo',
    label: 'Felixo System Design',
    area: 'back-end',
    repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
    branch: 'main',
    reviewedCommit: 'cc4aae7',
  },
  {
    id: 'doktor',
    label: 'Doktor System-Design',
    area: 'front-end',
    repoUrl: 'https://github.com/AndreGustavoms/Doktor-SystemDesign.git',
    branch: 'main',
    reviewedCommit: '7fc7f5e',
  },
])

/** Tolera `.git` final, barra final e caixa: o mesmo repositório é o mesmo guia. */
function sameRepo(a: string, b: string): boolean {
  const canon = (url: string) => url.trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase()
  return canon(a) === canon(b)
}

export function isSuggestionInList(
  suggestion: SystemDesignSuggestion,
  guides: readonly SystemDesignGuideInput[],
): boolean {
  return guides.some((guide) => sameRepo(guide.repoUrl, suggestion.repoUrl) && guide.branch === suggestion.branch)
}

/** Lista nova com a sugestão no fim; sem duplicar quem já está lá. */
export function withSuggestion(
  guides: readonly SystemDesignGuideInput[],
  suggestion: SystemDesignSuggestion,
): SystemDesignGuideInput[] {
  if (isSuggestionInList(suggestion, guides)) return [...guides]
  return [...guides, { repoUrl: suggestion.repoUrl, branch: suggestion.branch }]
}
