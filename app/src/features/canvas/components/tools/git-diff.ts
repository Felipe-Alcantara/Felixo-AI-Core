/**
 * Leitura da saída do `git diff` para exibição.
 *
 * Fica separado do componente porque um arquivo `.tsx` que exporta algo além
 * de componente quebra o fast refresh (regra `react-refresh/only-export-
 * components`) — e porque a numeração de linhas é a parte com regra de
 * verdade aqui, que merece teste próprio.
 */

export type DiffLineKind = 'meta' | 'hunk' | 'added' | 'removed' | 'context'

export type DiffLine = {
  kind: DiffLineKind
  text: string
  /** Número no arquivo antigo; `null` em linha adicionada. */
  oldNumber: number | null
  /** Número no arquivo novo; `null` em linha removida. */
  newNumber: number | null
}

const META_PREFIXES = [
  'diff --git',
  'index ',
  '--- ',
  '+++ ',
  'new file mode',
  'deleted file mode',
  'old mode',
  'new mode',
  'similarity index',
  'rename from',
  'rename to',
  'Binary files',
]

/**
 * Converte o diff em linhas já numeradas dos dois lados.
 *
 * Os números saem do cabeçalho do trecho (`@@ -a,b +c,d @@`) e avançam
 * conforme o tipo: adicionada anda só no lado novo, removida só no antigo,
 * contexto nos dois. Sem isso o leitor mostra o que mudou mas não onde, e
 * saber onde é metade do motivo de olhar o diff antes de commitar.
 */
export function parseDiff(diff: string | null): DiffLine[] {
  if (!diff) return []

  const lines: DiffLine[] = []
  let oldNumber = 0
  let newNumber = 0

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('@@')) {
      const start = readHunkHeader(raw)
      oldNumber = start.old
      newNumber = start.new
      lines.push({ kind: 'hunk', text: raw, oldNumber: null, newNumber: null })
      continue
    }

    if (META_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
      lines.push({ kind: 'meta', text: raw, oldNumber: null, newNumber: null })
      continue
    }

    // Antes do primeiro trecho não há numeração a atribuir.
    if (oldNumber === 0 && newNumber === 0) {
      if (raw.trim() === '') continue
      lines.push({ kind: 'meta', text: raw, oldNumber: null, newNumber: null })
      continue
    }

    // "\ No newline at end of file" descreve o arquivo, não é conteúdo dele.
    if (raw.startsWith(String.fromCharCode(92))) {
      lines.push({ kind: 'meta', text: raw, oldNumber: null, newNumber: null })
      continue
    }

    if (raw.startsWith('+')) {
      lines.push({ kind: 'added', text: raw.slice(1), oldNumber: null, newNumber })
      newNumber += 1
      continue
    }

    if (raw.startsWith('-')) {
      lines.push({ kind: 'removed', text: raw.slice(1), oldNumber, newNumber: null })
      oldNumber += 1
      continue
    }

    lines.push({
      kind: 'context',
      text: raw.startsWith(' ') ? raw.slice(1) : raw,
      oldNumber,
      newNumber,
    })
    oldNumber += 1
    newNumber += 1
  }

  return lines
}

/** Lê `@@ -12,7 +12,9 @@` e devolve a primeira linha de cada lado. */
function readHunkHeader(header: string): { old: number; new: number } {
  const match = /^@@ -([0-9]+)(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/.exec(header)
  if (!match) return { old: 1, new: 1 }
  return { old: Number(match[1]), new: Number(match[2]) }
}
