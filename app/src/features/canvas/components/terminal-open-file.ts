/**
 * Descobre qual arquivo está aberto num editor de texto (`nano`/`vim`/`vi`)
 * dentro do histórico de um terminal, para oferecer o preview renderizado sem
 * pedir que a pessoa aponte o caminho de novo.
 *
 * É best-effort: lê o scrollback em busca do último comando desses editores.
 * Se a pessoa não abriu nenhum, ou abriu algo que não é um editor reconhecido,
 * não há nada pra detectar — e o botão que usa isto avisa em vez de inventar.
 */

const EDITOR_COMMAND = /(?:^|[;&|]|\s)(?:nano|vim?)\s+(.+)$/

/**
 * @param transcript - Texto completo do scrollback (`store.getTranscript`).
 * @param cwd - Diretório de trabalho do terminal, para resolver caminho relativo.
 */
export function findLastEditedFile(
  transcript: string,
  cwd: string | undefined,
): { path: string; name: string } | undefined {
  const lines = transcript.split('\n')

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = EDITOR_COMMAND.exec(lines[i].trim())
    if (!match) continue

    const arg = extractFirstArg(match[1])
    if (!arg || arg.startsWith('-')) continue

    const path = resolvePath(arg, cwd)
    const name = path.split(/[\\/]/).pop() ?? path
    return { path, name }
  }

  return undefined
}

/** Pega o primeiro argumento da linha, respeitando aspas simples/duplas. */
function extractFirstArg(rest: string): string | undefined {
  const trimmed = rest.trim()
  const quoted = /^(['"])(.*?)\1/.exec(trimmed)
  if (quoted) return quoted[2]
  return trimmed.split(/\s+/)[0]
}

function resolvePath(arg: string, cwd: string | undefined): string {
  const isAbsolute = arg.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(arg)
  if (isAbsolute || !cwd) return arg
  const separator = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  return `${cwd.replace(/[\\/]+$/, '')}${separator}${arg}`
}
