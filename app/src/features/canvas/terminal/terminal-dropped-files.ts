/** Decisões puras para transformar arquivos arrastados em texto de prompt. */

export type DroppedFilePathResolver = (file: File) => string

export type DroppedFileReference = {
  paths: string[]
  missingCount: number
  text: string
}

/** Resolve somente os caminhos fornecidos pela ponte do Electron. */
export function resolveDroppedFilePaths(
  files: Iterable<File>,
  resolvePath: DroppedFilePathResolver,
): { paths: string[]; missingCount: number } {
  const paths: string[] = []
  let missingCount = 0

  for (const file of files) {
    let path: string
    try {
      path = resolvePath(file).trim()
    } catch {
      path = ''
    }

    if (!path) {
      missingCount += 1
      continue
    }

    if (!paths.includes(path)) {
      paths.push(path)
    }
  }

  return { paths, missingCount }
}

/**
 * Formata referências explícitas, sem shell quoting e sem Enter.
 * JSON.stringify protege aspas, barras e Unicode dentro da referência textual;
 * a linha continua sendo um prompt, nunca um comando montado pelo app.
 */
export function formatDroppedFileReferences(
  paths: readonly string[],
  missingCount = 0,
): string {
  const lines = ['\n\nArquivos arrastados:']
  paths.forEach((path) => lines.push(`- ${JSON.stringify(path)}`))

  if (missingCount > 0) {
    lines.push(
      `- [${missingCount} arquivo(s) sem caminho disponível; arraste novamente ou informe o caminho manualmente]`,
    )
  }

  return paths.length > 0 || missingCount > 0 ? `${lines.join('\n')}\n` : ''
}

export function buildDroppedFileReference(
  files: Iterable<File>,
  resolvePath: DroppedFilePathResolver,
): DroppedFileReference {
  const { paths, missingCount } = resolveDroppedFilePaths(files, resolvePath)
  return {
    paths,
    missingCount,
    text: formatDroppedFileReferences(paths, missingCount),
  }
}
