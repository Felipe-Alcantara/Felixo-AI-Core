/**
 * Estado do catálogo de skills como o painel de Skills o usa.
 *
 * O catálogo (`canvas:list-available-skills`) é a lista que todo agente novo
 * recebe. A pessoa pode tirar dela uma skill do sistema (da biblioteca do app
 * ou de terceiros); os ids tirados ficam gravados em `hiddenBuiltinIds`, que o
 * painel regrava inteiro a cada mudança — por isso as operações aqui devolvem a
 * lista completa, e não só a diferença.
 */
import type { CanvasSkill } from '../../types'

/** Retorno de `canvas:list-available-skills`, como o preload o entrega. */
type SkillsCatalogResult =
  | {
      ok: boolean
      message?: string
      skills?: CanvasSkill[]
      communityEnabled?: boolean
      hiddenBuiltinIds?: string[]
      hiddenSkills?: CanvasSkill[]
    }
  | null
  | undefined

export type SkillsCatalogState = {
  /** Tudo o que um agente novo recebe: sistema (menos as ocultas) + as da pessoa. */
  skills: CanvasSkill[]
  communityEnabled: boolean
  /**
   * Ids ocultos exatamente como estão gravados. Inclui terceiros ocultos que o
   * painel não mostra enquanto terceiros estão desligados — gravar sem eles os
   * restauraria sem a pessoa pedir.
   */
  hiddenIds: string[]
  /** Ocultas com nome e origem, para o painel mostrar o que dá para restaurar. */
  hiddenSkills: CanvasSkill[]
}

/**
 * Normaliza o retorno do catálogo. Devolve `null` quando a leitura falhou, para
 * o painel manter o que já mostrava em vez de esvaziar a lista.
 *
 * @param result - Retorno cru de `listAvailableSkills`.
 */
export function readSkillsCatalog(result: SkillsCatalogResult): SkillsCatalogState | null {
  if (!result?.ok || !Array.isArray(result.skills)) {
    return null
  }
  return {
    skills: result.skills,
    communityEnabled: result.communityEnabled !== false,
    hiddenIds: Array.isArray(result.hiddenBuiltinIds) ? result.hiddenBuiltinIds : [],
    hiddenSkills: Array.isArray(result.hiddenSkills) ? result.hiddenSkills : [],
  }
}

/**
 * Lista de ocultos depois de tirar `id` da lista que os agentes recebem.
 *
 * @param hiddenIds - Ocultos atuais, preservados intactos.
 * @param id - Skill do sistema a ocultar.
 */
export function hideSkillId(hiddenIds: readonly string[], id: string): string[] {
  return hiddenIds.includes(id) ? [...hiddenIds] : [...hiddenIds, id]
}

/**
 * Lista de ocultos depois de devolver `id` à lista que os agentes recebem.
 *
 * @param hiddenIds - Ocultos atuais, preservados intactos.
 * @param id - Skill do sistema a restaurar.
 */
export function restoreSkillId(hiddenIds: readonly string[], id: string): string[] {
  return hiddenIds.filter((hidden) => hidden !== id)
}
