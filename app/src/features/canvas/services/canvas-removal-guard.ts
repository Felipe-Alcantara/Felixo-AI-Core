/**
 * Decide se uma remoção do canvas pode seguir (gancho `onBeforeDelete` do
 * React Flow) e, quando ela perde algo que não volta, o texto da confirmação.
 *
 * Todo caminho de remoção passa por aqui: Delete/Backspace, o Remover da barra
 * de status, o X do cabeçalho e o "Remover grupo". O React Flow entrega a lista
 * já com os filhos de grupo em cascata, então a contagem inclui quem sai junto.
 */

export type RemovalCandidate = {
  id: string
  type?: string
  parentId?: string
  data?: unknown
}

export type RemovalVerdict =
  | { allow: false }
  | { allow: true; confirmMessage?: string }

function isTemporaryImage(node: RemovalCandidate): boolean {
  const data = node.data as { image?: { temporary?: boolean } } | undefined
  return data?.image?.temporary === true
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function judgeCanvasRemoval(
  nodes: readonly RemovalCandidate[],
  options: { locked: boolean; isLiveTerminal: (nodeId: string) => boolean },
): RemovalVerdict {
  // Trava ligada: nem tecla nem botão removem.
  if (options.locked) return { allow: false }

  const groupIds = new Set(nodes.filter((node) => node.type === 'group').map((node) => node.id))
  const groups = groupIds.size
  const insideGroups = nodes.filter((node) => node.parentId && groupIds.has(node.parentId)).length
  const liveTerminals = nodes.filter(
    (node) => node.type === 'terminal' && options.isLiveTerminal(node.id),
  ).length
  const temporaryImages = nodes.filter(isTemporaryImage).length

  const lines: string[] = []
  if (insideGroups > 0) {
    lines.push(`${count(groups, 'grupo', 'grupos')} com ${count(insideGroups, 'bloco', 'blocos')} dentro: tudo sai junto.`)
  }
  if (liveTerminals > 0) {
    lines.push(`${count(liveTerminals, 'terminal com processo em execução', 'terminais com processo em execução')}: o processo será encerrado.`)
  }
  if (temporaryImages > 0) {
    lines.push(`${count(temporaryImages, 'imagem temporária', 'imagens temporárias')}: o arquivo será apagado do disco.`)
  }
  if (lines.length === 0) return { allow: true }

  return {
    allow: true,
    confirmMessage: `Remover ${count(nodes.length, 'bloco', 'blocos')}?\n\n${lines.join('\n')}\n\nNão dá para desfazer.`,
  }
}
