// Qual repositório cada bloco do canvas representa.
//
// Existe porque a pergunta "em que repositório este terminal está trabalhando?"
// é feita em dois lugares que não se conhecem: o layout, que separa a matriz em
// faixas, e o cabeçalho do bloco, que mostra o rótulo. Se cada um respondesse
// por conta própria, um terminal poderia cair numa faixa e exibir outro nome.
import type { Node } from '@xyflow/react'

/** Chave dos blocos que não declaram diretório — notas, páginas, grupos. */
export const NO_REPOSITORY_KEY = ''

/**
 * Chave de agrupamento de um bloco: o `cwd` normalizado, ou vazio quando o
 * bloco não tem diretório nenhum.
 *
 * A normalização remove a barra final e unifica separadores, para que
 * `/projetos/app` e `/projetos/app/` não virem dois repositórios diferentes na
 * mesma matriz — engano invisível na tela e irritante de descobrir.
 */
export function repositoryKey(node: Node): string {
  return normalizeCwd((node.data as { cwd?: unknown } | undefined)?.cwd)
}

/** Caminho comparável: separadores unificados e sem barra final. */
function normalizeCwd(cwd: unknown): string {
  if (typeof cwd !== 'string') {
    return NO_REPOSITORY_KEY
  }

  return cwd.trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * Nome curto do repositório para exibição: a última pasta do caminho.
 *
 * O caminho inteiro não cabe no cabeçalho de um bloco e a parte que distingue
 * um repositório do outro é justamente o fim dele. Um caminho de raiz (`/`)
 * não tem última pasta e devolve o próprio caminho.
 */
export function repositoryLabel(cwd: string | undefined): string {
  const key = normalizeCwd(cwd)

  if (!key) {
    return ''
  }

  return key.slice(key.lastIndexOf('/') + 1) || key
}

/**
 * Separa os blocos em faixas por repositório, preservando a ordem de entrada
 * (a do dock) tanto entre as faixas quanto dentro de cada uma.
 *
 * A faixa dos blocos sem repositório vai por último, independentemente de onde
 * eles aparecem no dock: são notas, arquivos e páginas, que servem à leitura do
 * canvas e não a um repositório — deixá-los no meio partiria as faixas de quem
 * tem.
 */
export function groupByRepository<TNode extends Node>(
  nodes: TNode[],
): Array<{ key: string; label: string; nodes: TNode[] }> {
  const bands = new Map<string, TNode[]>()

  for (const node of nodes) {
    const key = repositoryKey(node)
    const members = bands.get(key)
    if (members) {
      members.push(node)
    } else {
      bands.set(key, [node])
    }
  }

  const withoutRepository = bands.get(NO_REPOSITORY_KEY)
  bands.delete(NO_REPOSITORY_KEY)

  const ordered = [...bands.entries()].map(([key, members]) => ({
    key,
    label: repositoryLabel(key),
    nodes: members,
  }))

  if (withoutRepository) {
    ordered.push({
      key: NO_REPOSITORY_KEY,
      label: '',
      nodes: withoutRepository,
    })
  }

  return ordered
}
