/**
 * Edição das pastas-raiz do Fetch All.
 *
 * Funções puras, fora do painel: é aqui que se decide se uma escolha vira
 * gravação. Cancelar o seletor ou repetir uma pasta que já estava na lista não
 * pode regravar a configuração nem recalcular o escopo à toa.
 */

/** Resposta do seletor nativo de pastas (`fetchAll.pickRoots`). */
export type PickRootsResult = {
  ok: boolean
  message?: string
  paths?: string[]
}

/**
 * O que o painel faz depois de uma edição: gravar `roots`, mostrar `error`,
 * ou nada, quando os dois vêm nulos.
 */
export type ScanRootsEdit = {
  roots: string[] | null
  error: string | null
}

const NOTHING_TO_SAVE: ScanRootsEdit = { roots: null, error: null }

/**
 * Acrescenta as pastas escolhidas no seletor às raízes atuais.
 *
 * A ordem e a normalização finais são do processo principal; aqui só se evita
 * repetir o que já estava na lista.
 */
export function addPickedRoots(
  current: readonly string[],
  picked: PickRootsResult | null | undefined,
): ScanRootsEdit {
  if (!picked?.ok) {
    return {
      roots: null,
      error: picked?.message ?? 'Não foi possível abrir o seletor de pastas.',
    }
  }

  const roots = [...current]

  for (const candidate of picked.paths ?? []) {
    const root = candidate.trim()
    if (root && !roots.includes(root)) roots.push(root)
  }

  return roots.length > current.length ? { roots, error: null } : NOTHING_TO_SAVE
}

/**
 * Nome curto de uma raiz: a última pasta do caminho, em qualquer sistema.
 *
 * O caminho inteiro raramente cabe na largura do painel, e o que distingue
 * duas raízes costuma estar no fim dele; sem o nome à frente, duas pastas
 * irmãs apareceriam iguais depois do corte.
 */
export function scanRootName(root: string): string {
  return root.split(/[\\/]+/).filter(Boolean).at(-1) ?? root
}

/** Tira uma pasta das raízes; se ela não estava na lista, não há o que gravar. */
export function removeScanRoot(current: readonly string[], root: string): ScanRootsEdit {
  const roots = current.filter((item) => item !== root)

  return roots.length < current.length ? { roots, error: null } : NOTHING_TO_SAVE
}
