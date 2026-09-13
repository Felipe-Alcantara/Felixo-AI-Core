/**
 * Árvore do repositório para o explorador do Source Control.
 *
 * O backend devolve uma lista plana de caminhos (`git ls-files`), que é o
 * formato certo para trafegar e o errado para navegar: quem procura um arquivo
 * pensa em pastas. Aqui a lista vira árvore uma vez só, já com o status de cada
 * arquivo pendurado no nó e com a contagem de alterações agregada por pasta —
 * é essa contagem que deixa achar, de fora, em que canto do projeto a mudança
 * caiu, sem abrir pasta por pasta.
 *
 * Tudo aqui é função pura sobre dados já carregados: nada de IPC, para o painel
 * poder recalcular a árvore a cada tecla do filtro sem ir ao processo principal.
 */

import type { GitStatusEntry } from './git-status'

export type RepoFileNode = {
  kind: 'file'
  name: string
  /** Caminho relativo à raiz do repositório, com barra normal. */
  path: string
  /** Entrada do `git status`, quando o arquivo tem alteração pendente. */
  entry: GitStatusEntry | null
}

export type RepoDirNode = {
  kind: 'dir'
  name: string
  path: string
  children: RepoNode[]
  /** Arquivos alterados na subárvore inteira, não só nos filhos diretos. */
  changed: number
}

export type RepoNode = RepoFileNode | RepoDirNode

/**
 * Monta a árvore a partir dos caminhos do repositório e do status atual.
 *
 * Os dois conjuntos são unidos de propósito: um arquivo apagado e já preparado
 * some do `ls-files`, mas continua no status — e some da árvore justamente
 * quando a pessoa mais precisa vê-lo para conferir o que vai no commit.
 */
export function buildRepoTree(
  files: readonly string[],
  entries: readonly GitStatusEntry[],
): RepoDirNode {
  const statusByPath = new Map<string, GitStatusEntry>()
  for (const entry of entries) {
    statusByPath.set(entry.path, entry)
  }

  const root: RepoDirNode = { kind: 'dir', name: '', path: '', children: [], changed: 0 }
  const directories = new Map<string, RepoDirNode>([['', root]])
  const seen = new Set<string>()

  for (const rawPath of [...files, ...statusByPath.keys()]) {
    const path = normalizePath(rawPath)
    if (!path || seen.has(path)) continue
    seen.add(path)

    const segments = path.split('/')
    const fileName = segments.pop() as string
    let parent = root
    let prefix = ''

    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment
      let directory = directories.get(prefix)
      if (!directory) {
        directory = { kind: 'dir', name: segment, path: prefix, children: [], changed: 0 }
        directories.set(prefix, directory)
        parent.children.push(directory)
      }
      parent = directory
    }

    parent.children.push({
      kind: 'file',
      name: fileName,
      path,
      entry: statusByPath.get(path) ?? null,
    })
  }

  sortTree(root)
  countChanges(root)
  return root
}

/** Pastas primeiro, depois arquivos; dentro de cada grupo, ordem alfabética. */
function sortTree(node: RepoDirNode): void {
  node.children.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  for (const child of node.children) {
    if (child.kind === 'dir') sortTree(child)
  }
}

/** Devolve quantos arquivos alterados existem na subárvore, gravando no nó. */
function countChanges(node: RepoDirNode): number {
  let total = 0
  for (const child of node.children) {
    total += child.kind === 'dir' ? countChanges(child) : child.entry ? 1 : 0
  }
  node.changed = total
  return total
}

function normalizePath(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim()
}

/**
 * Filtra a árvore por texto e/ou por "só o que mudou".
 *
 * Uma pasta sobrevive se algum descendente sobreviveu — é o que faz o caminho
 * até o resultado continuar visível em vez de o arquivo aparecer solto, sem
 * contexto de onde mora.
 */
export function filterRepoTree(
  node: RepoDirNode,
  options: { query?: string; changedOnly?: boolean } = {},
): RepoDirNode {
  const query = (options.query ?? '').trim().toLowerCase()
  const changedOnly = options.changedOnly ?? false

  const keep = (child: RepoNode): RepoNode | null => {
    if (child.kind === 'dir') {
      const filtered = filterRepoTree(child, options)
      return filtered.children.length > 0 ? filtered : null
    }
    if (changedOnly && !child.entry) return null
    if (query && !child.path.toLowerCase().includes(query)) return null
    return child
  }

  const children = node.children.map(keep).filter((child): child is RepoNode => child !== null)
  return { ...node, children, changed: children.reduce(sumChanged, 0) }
}

function sumChanged(total: number, node: RepoNode): number {
  return total + (node.kind === 'dir' ? node.changed : node.entry ? 1 : 0)
}

/** Caminhos das pastas até um arquivo, da mais externa para a mais interna. */
export function ancestorPaths(path: string): string[] {
  const segments = normalizePath(path).split('/')
  segments.pop()

  const result: string[] = []
  let prefix = ''
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment
    result.push(prefix)
  }
  return result
}

/**
 * Pastas que contêm alguma alteração.
 *
 * O explorador abre já nelas: um repositório grande fechado na raiz esconde
 * exatamente aquilo que trouxe a pessoa até aqui.
 */
export function dirsWithChanges(node: RepoDirNode): string[] {
  const result: string[] = []

  const walk = (current: RepoDirNode) => {
    for (const child of current.children) {
      if (child.kind !== 'dir') continue
      if (child.changed > 0) {
        result.push(child.path)
        walk(child)
      }
    }
  }

  walk(node)
  return result
}

/** Todas as pastas da árvore, para os botões de expandir e recolher tudo. */
export function allDirPaths(node: RepoDirNode): string[] {
  const result: string[] = []

  const walk = (current: RepoDirNode) => {
    for (const child of current.children) {
      if (child.kind !== 'dir') continue
      result.push(child.path)
      walk(child)
    }
  }

  walk(node)
  return result
}
