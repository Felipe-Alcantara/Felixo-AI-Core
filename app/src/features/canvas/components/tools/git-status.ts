/**
 * Leitura do `git status --short` para a interface de controle de versão.
 *
 * O painel antes exibia as linhas cruas do porcelain como texto monoespaçado.
 * Isso serve para ler, não para operar: sem decorar o formato, não dá para
 * saber se um arquivo está no stage, fora dele, ou nos dois ao mesmo tempo —
 * que é o caso de quem editou depois de adicionar, e o mais fácil de mandar
 * pro commit pela metade sem perceber.
 *
 * O backend expõe o mesmo parsing em `git-service.cjs`, para quem consome o
 * IPC direto. Aqui a versão do renderer trabalha em cima de `statusLines`, que
 * é o que o resumo já devolve, e evita mais uma ida ao processo principal só
 * para reformatar texto que já está na mão.
 */

export type GitStatusEntry = {
  /** Caminho relativo à raiz do repositório, sempre com barra normal. */
  path: string
  /** Nome anterior, quando o git detectou renomeação. */
  originalPath: string | null
  /** Coluna do índice no porcelain (o lado do stage). */
  index: string
  /** Coluna da árvore de trabalho no porcelain. */
  worktree: string
  untracked: boolean
  staged: boolean
  unstaged: boolean
}

export type StatusBadge = {
  letter: string
  label: string
  tone: 'modificado' | 'adicionado' | 'removido' | 'renomeado' | 'novo' | 'conflito'
}

export function parseStatusEntries(statusLines: readonly string[]): GitStatusEntry[] {
  const entries: GitStatusEntry[] = []

  for (const line of statusLines) {
    if (typeof line !== 'string' || line.startsWith('## ') || line.length < 4) {
      continue
    }

    const index = line[0]
    const worktree = line[1]
    const rest = line.slice(3)
    if (!rest) continue

    const arrow = rest.indexOf(' -> ')
    const rawPath = arrow === -1 ? rest : rest.slice(arrow + 4)
    const rawOrigin = arrow === -1 ? null : rest.slice(0, arrow)

    entries.push({
      path: unquotePath(rawPath),
      originalPath: rawOrigin === null ? null : unquotePath(rawOrigin),
      index,
      worktree,
      // Untracked ocupa as duas colunas com "?" e não é modificação: não há
      // versão anterior com que comparar, então também não é "unstaged".
      untracked: index === '?' && worktree === '?',
      staged: index !== ' ' && index !== '?',
      unstaged: worktree !== ' ' && worktree !== '?',
    })
  }

  return entries
}

/**
 * Desfaz o escape octal que o git aplica a caminho fora do ASCII imprimível
 * quando `core.quotePath` está ligado, que é o padrão. Sem isto um arquivo
 * acentuado apareceria como "src/configura\303\247\303\243o.ts".
 */
function unquotePath(value: string): string {
  const text = String(value ?? '').trim()
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) {
    return text
  }

  const body = text.slice(1, -1)
  const bytes: number[] = []
  const BACKSLASH = String.fromCharCode(92)

  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === BACKSLASH && i + 3 < body.length) {
      const octal = body.slice(i + 1, i + 4)
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(Number.parseInt(octal, 8))
        i += 3
        continue
      }
    }
    bytes.push(body.charCodeAt(i))
  }

  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  } catch {
    return body
  }
}

/**
 * Letra e cor do arquivo, lidas da coluna certa.
 *
 * O mesmo arquivo pode ter estados diferentes nos dois lados — adicionado no
 * índice e modificado de novo na árvore, por exemplo —, então a linha do grupo
 * "Stage" mostra a coluna do índice e a do grupo "Alterações" mostra a da
 * árvore. Mostrar sempre a mesma faria a lista mentir num dos dois lugares.
 */
export function statusDescriptor(entry: GitStatusEntry, stagedSide: boolean): StatusBadge {
  if (entry.untracked) {
    return { letter: 'U', label: 'Arquivo novo, ainda não rastreado', tone: 'novo' }
  }

  const code = stagedSide ? entry.index : entry.worktree

  switch (code) {
    case 'A':
      return { letter: 'A', label: 'Adicionado', tone: 'adicionado' }
    case 'D':
      return { letter: 'D', label: 'Removido', tone: 'removido' }
    case 'R':
      return { letter: 'R', label: 'Renomeado', tone: 'renomeado' }
    case 'C':
      return { letter: 'C', label: 'Copiado', tone: 'renomeado' }
    case 'U':
      return { letter: '!', label: 'Conflito de merge', tone: 'conflito' }
    default:
      return { letter: 'M', label: 'Modificado', tone: 'modificado' }
  }
}

/** Separa pasta e nome para a linha mostrar o nome em destaque e o caminho ao lado. */
export function splitPath(value: string): { dir: string; name: string } {
  const index = value.lastIndexOf('/')
  if (index === -1) return { dir: '', name: value }
  return { dir: value.slice(0, index), name: value.slice(index + 1) }
}
